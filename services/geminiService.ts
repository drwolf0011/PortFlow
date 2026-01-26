
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Asset, AssetType, RebalancingStrategy, Account, AccountType, UserProfile } from "../types";

export interface AnalysisResponse {
  currentDiagnosis: string;
  marketConditions: string;
  bestStrategy: RebalancingStrategy;
  sources: { title: string; uri: string }[];
}

export interface StockInfo {
  name: string;
  ticker: string;
  price: number;
  currency: 'KRW' | 'USD';
  type: AssetType;
  market?: string;
}

export interface PriceUpdateResult {
  updatedAssets: Asset[];
  exchangeRate?: number;
}

export interface HistoryPoint {
  date: string;
  price: number;
}

// 시세 캐시 인터페이스 및 전역 캐시 객체
interface CachedPrice {
  price: number;
  timestamp: number;
}
const PRICE_CACHE = new Map<string, CachedPrice>();
const CACHE_TTL = 10 * 60 * 1000; // 10분 동안 캐시 유효

const safeJsonParse = (text: string) => {
  try {
    if (!text) return null;
    // 마크다운 코드 블록 제거
    const cleaned = text.replace(/```json|```/g, "").trim();
    
    // JSON 블록만 추출하는 정규식 개선
    const firstChar = cleaned.indexOf('{');
    const lastChar = cleaned.lastIndexOf('}');
    const firstArrayChar = cleaned.indexOf('[');
    const lastArrayChar = cleaned.lastIndexOf(']');
    
    let jsonStr = "";
    if (firstChar !== -1 && lastChar !== -1 && (firstArrayChar === -1 || firstChar < firstArrayChar)) {
      jsonStr = cleaned.substring(firstChar, lastChar + 1);
    } else if (firstArrayChar !== -1 && lastArrayChar !== -1) {
      jsonStr = cleaned.substring(firstArrayChar, lastArrayChar + 1);
    } else {
      jsonStr = cleaned;
    }

    try {
      return JSON.parse(jsonStr);
    } catch (parseError: any) {
      console.warn("JSON 파싱 실패, 정화 후 재시도:", parseError.message);
      // 기본적인 잘림 현상(Truncation) 대응: 괄호가 닫히지 않은 경우 강제로 닫아보는 시도 등은 복잡하므로 null 반환 후 상위에서 처리
      return null;
    }
  } catch (e) {
    console.error("safeJsonParse Error:", e);
    return null;
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class RequestQueue {
  private queue: (() => Promise<void>)[] = [];
  private activeCount = 0;
  private maxConcurrency = 2; 
  private lastRequestTime = 0;
  private minInterval = 1000;

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrapper = async () => {
        const now = Date.now();
        const timeSinceLast = now - this.lastRequestTime;
        if (timeSinceLast < this.minInterval) {
          await delay(this.minInterval - timeSinceLast);
        }

        this.activeCount++;
        this.lastRequestTime = Date.now();
        try {
          const result = await task();
          resolve(result);
        } catch (e) {
          reject(e);
        } finally {
          this.activeCount--;
          this.next();
        }
      };
      
      if (this.activeCount < this.maxConcurrency) {
        wrapper();
      } else {
        this.queue.push(wrapper);
      }
    });
  }

  private next() {
    if (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      task?.();
    }
  }
}

const requestQueue = new RequestQueue();

async function generateContentWithRetry(
  params: any,
  useQueue = true
): Promise<GenerateContentResponse> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  if (params.config && !params.config.thinkingConfig && params.model.includes('flash')) {
    params.config.thinkingConfig = { thinkingBudget: 0 };
  }

  const apiCall = async () => {
    let lastError;
    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await ai.models.generateContent(params);
      } catch (error: any) {
        lastError = error;
        const status = error.status || error.code;
        if (status === 429) {
           const waitTime = (5000 * Math.pow(2, i)) + (Math.random() * 1000);
           await delay(waitTime);
           continue;
        }
        throw error;
      }
    }
    throw lastError;
  };

  return useQueue ? requestQueue.add(apiCall) : apiCall();
}

const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const updateAssetPrices = async (assets: Asset[]): Promise<PriceUpdateResult> => {
  const now = Date.now();
  const allUpdatedPrices: { id: string, price: number }[] = [];
  let latestExchangeRate: number | undefined;

  const needUpdate: Asset[] = [];
  assets.forEach(asset => {
    if (asset.type === AssetType.CASH) return;
    
    const cacheKey = `${asset.ticker || asset.name}_${asset.currency}`;
    const cached = PRICE_CACHE.get(cacheKey);
    
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      allUpdatedPrices.push({ id: asset.id, price: cached.price });
    } else {
      needUpdate.push(asset);
    }
  });

  if (needUpdate.length === 0) {
    return { 
      updatedAssets: assets.map(a => {
        const p = allUpdatedPrices.find(up => up.id === a.id);
        return p ? { ...a, currentPrice: p.price } : a;
      }),
      exchangeRate: undefined
    };
  }

  const assetChunks = chunkArray(needUpdate, 10);

  for (const chunk of assetChunks) {
    const chunkInfo = chunk.map(a => ({ id: a.id, name: a.name, ticker: a.ticker, currency: a.currency }));
    
    const prompt = `
      [실시간 금융 데이터 업데이트]
      1. 다음 자산 리스트에 대해 실시간 시장 가격을 조사하세요.
      2. 티커(Ticker)가 있다면 티커를 우선적으로 검색하세요.
      3. 미국 주식/ETF는 USD($), 한국 주식/ETF는 KRW(₩) 가격을 추출하세요.
      4. 실시간 USD/KRW 환율도 함께 조사하세요.

      조사 대상: ${JSON.stringify(chunkInfo)}
    `;

    try {
      const response = await generateContentWithRetry({
        model: 'gemini-3-pro-preview', 
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              prices: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { id: { type: Type.STRING }, price: { type: Type.NUMBER } },
                  required: ["id", "price"]
                }
              },
              exchangeRate: { type: Type.NUMBER }
            },
            required: ["prices", "exchangeRate"]
          }
        }
      });

      const parsed = safeJsonParse(response.text);
      if (parsed?.prices) {
        parsed.prices.forEach((p: any) => {
          allUpdatedPrices.push(p);
          const asset = assets.find(a => a.id === p.id);
          if (asset) {
            PRICE_CACHE.set(`${asset.ticker || asset.name}_${asset.currency}`, {
              price: p.price,
              timestamp: now
            });
          }
        });
      }
      if (parsed?.exchangeRate) latestExchangeRate = parsed.exchangeRate;
    } catch (error) {
      console.error("Batch update failed", error);
    }
  }

  const finalAssets = assets.map(asset => {
    const found = allUpdatedPrices.find(p => p.id === asset.id);
    return found ? { ...asset, currentPrice: found.price } : asset;
  });

  return { updatedAssets: finalAssets, exchangeRate: latestExchangeRate };
};

export const generateGoalPrompt = async (answers: {
  age: string,
  risk: string,
  purpose: string,
  horizon: string,
  preference: string
}): Promise<{ goal: string, prompt: string }> => {
  const prompt = `
    다음은 사용자의 투자 성향 및 목표에 관한 답변입니다:
    - 연령대: ${answers.age}
    - 위험 선호도: ${answers.risk}
    - 투자 목적: ${answers.purpose}
    - 투자 기간: ${answers.horizon}
    - 선호 자산/특이사항: ${answers.preference}

    위 정보를 바탕으로 이 사용자를 위한 **전문적인 자산관리 지침 프롬프트**를 생성하세요. 
    응답은 간결하고 명확해야 합니다.
  `;

  try {
    const response = await generateContentWithRetry({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            goal: { type: Type.STRING },
            prompt: { type: Type.STRING }
          },
          required: ["goal", "prompt"]
        }
      }
    });
    const parsed = safeJsonParse(response.text);
    return {
      goal: parsed?.goal || "맞춤형 자산 관리",
      prompt: parsed?.prompt || "성장과 안정을 동시에 고려한 분산 투자를 권장합니다."
    };
  } catch (error) {
    console.error(error);
    return { goal: "개별 목표 설정 필요", prompt: "사용자 정보가 부족하여 기본 전략을 적용합니다." };
  }
};

export const getAIAnalysis = async (
  assets: Asset[], 
  accounts: Account[], 
  exchangeRate: number,
  userProfile: UserProfile | null
): Promise<AnalysisResponse> => {
  let totalValueKRW = 0;
  let cashValueKRW = 0;

  const accountMap = new Map(accounts.map(a => [a.id, a]));

  const assetSummary = assets.length > 0 
    ? assets.map(a => {
        const price = a.currentPrice || 0;
        const qty = a.quantity || 0;
        const mult = a.currency === 'USD' ? exchangeRate : 1;
        const valKRW = price * qty * mult;
        
        totalValueKRW += valKRW;
        if (a.type === AssetType.CASH) cashValueKRW += valKRW;

        const acc = a.accountId ? accountMap.get(a.accountId) : null;
        const accType = acc ? acc.type : '종합(위탁)';

        return `- [${a.institution} | ${accType} | ${a.type}] ${a.name}(${a.ticker || 'N/A'}): ${qty}주, 평가액 ${Math.floor(valKRW).toLocaleString()}원`;
      }).join('\n')
    : "자산 없음";

  const goalInstruction = userProfile?.goalPrompt 
    ? `사용자의 맞춤 지침: ${userProfile.goalPrompt}`
    : "사용자의 목표: 2029년까지 자산 증식(Growth), 2030년부터 인컴 전환(Income).";

  const prompt = `
    당신은 대한민국 금융 규정과 세법에 정통한 **수석 자산관리 전문가(PB)**입니다.
    ${goalInstruction}

    [현재 포트폴리오 데이터]
    - 총 자산: 약 ${Math.floor(totalValueKRW).toLocaleString()} KRW
    - 가용 현금: 약 ${Math.floor(cashValueKRW).toLocaleString()} KRW
    - 상세 보유 내역:
    ${assetSummary}

    [계좌 유형별 필수 운용 규정 및 전략]
    1. 퇴직연금(IRP) 및 확정기여형(DC): 위험자산 70% 제한.
    2. 개인연금(연금저축): 개별 주식 매수 불가 (ETF 가능).
    3. ISA(중개형): 비과세 혜택 극대화.

    [출력 요구사항]
    - 한국어로 작성하고 JSON 형식을 엄격히 준수하십시오.
    - **중요: JSON 응답이 너무 길어지지 않도록 currentDiagnosis와 rationale를 핵심 요약 위주로 작성하여 응답이 중간에 잘리지 않게 하십시오.**
  `;

  try {
    const response = await generateContentWithRetry({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: { 
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            currentDiagnosis: { type: Type.STRING },
            marketConditions: { type: Type.STRING },
            bestStrategy: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                riskLevel: { type: Type.STRING },
                predictedReturnRate: { type: Type.NUMBER },
                rationale: { type: Type.STRING },
                targetSectorAllocation: { type: Type.STRING },
                executionGroups: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      institution: { type: Type.STRING },
                      accountName: { type: Type.STRING },
                      isPension: { type: Type.BOOLEAN },
                      items: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            assetName: { type: Type.STRING },
                            ticker: { type: Type.STRING },
                            action: { type: Type.STRING },
                            quantity: { type: Type.NUMBER },
                            estimatedPrice: { type: Type.NUMBER },
                            totalAmount: { type: Type.NUMBER },
                            reason: { type: Type.STRING }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          required: ["currentDiagnosis", "marketConditions", "bestStrategy"]
        }
      }
    });
    
    const parsed = safeJsonParse(response.text);
    const sources: { title: string; uri: string }[] = [];
    response.candidates?.[0]?.groundingMetadata?.groundingChunks?.forEach((c: any) => {
      if (c.web) sources.push({ title: c.web.title, uri: c.web.uri });
    });

    if (!parsed) {
      throw new Error("AI 분석 데이터 파싱에 실패했습니다. 응답이 너무 길어 처리할 수 없습니다.");
    }

    return { 
      currentDiagnosis: parsed.currentDiagnosis || "진단 데이터를 분석하는 중 오류가 발생했습니다.",
      marketConditions: parsed.marketConditions || "분석 완료",
      bestStrategy: parsed.bestStrategy,
      sources 
    };
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const searchStockList = async (query: string): Promise<StockInfo[]> => {
  const prompt = `"${query}" 관련 투자 자산 5개의 실시간 정보를 JSON으로 반환하세요.`;
  try {
    const response = await generateContentWithRetry({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              ticker: { type: Type.STRING },
              price: { type: Type.NUMBER },
              currency: { type: Type.STRING },
              type: { type: Type.STRING }
            }
          }
        }
      }
    });
    return (safeJsonParse(response.text) || []) as StockInfo[];
  } catch (error) { return []; }
};

export const getStockDeepDive = async (query: string): Promise<{ text: string, sources: { title: string; uri: string }[] }> => {
  const prompt = `"${query}" 종목의 최신 심층 분석 리포트 (마크다운). IRP/DC 위험자산 해당 여부 포함.`;
  try {
    const response = await generateContentWithRetry({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });
    const sources: { title: string; uri: string }[] = [];
    response.candidates?.[0]?.groundingMetadata?.groundingChunks?.forEach((c: any) => {
      if (c.web) sources.push({ title: c.web.title, uri: c.web.uri });
    });
    return { text: response.text || "분석 불가", sources };
  } catch (error) { return { text: "분석 중 오류 발생", sources: [] }; }
};

export const getAssetHistory = async (ticker: string, name: string): Promise<HistoryPoint[]> => {
  const prompt = `"${name}(${ticker})"의 지난 12개월 주간 종가 데이터.`;
  try {
    const response = await generateContentWithRetry({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { date: { type: Type.STRING }, price: { type: Type.NUMBER } }
          }
        }
      }
    });
    return (safeJsonParse(response.text) || []) as HistoryPoint[];
  } catch (error) { return []; }
};

export const classifyTransactionTypes = async (transactions: {id: string, name: string, institution: string}[]): Promise<any[]> => {
  const prompt = `다음 거래 내역들을 분류하세요: ${JSON.stringify(transactions)}`;
  try {
    const response = await generateContentWithRetry({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { id: { type: Type.STRING }, type: { type: Type.STRING } }
          }
        }
      }
    });
    return safeJsonParse(response.text) || [];
  } catch (error) { return []; }
};
