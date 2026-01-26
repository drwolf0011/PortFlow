
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

// 시세 캐시 인터페이스 및 전역 캐시 객체
interface CachedPrice {
  price: number;
  timestamp: number;
}
const PRICE_CACHE = new Map<string, CachedPrice>();
const CACHE_TTL = 10 * 60 * 1000; // 10분 동안 캐시 유효

/**
 * JSON 응답이 중간에 잘린 경우(Truncation)를 대비한 복구형 파서
 */
const safeJsonParse = (text: string) => {
  if (!text) return null;
  
  // 마크다운 코드 블록 제거
  let cleaned = text.replace(/```json|```/g, "").trim();
  
  // JSON 시작 지점 찾기
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;
  let isArray = false;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    isArray = false;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    isArray = true;
  }

  if (startIdx === -1) return null;
  cleaned = cleaned.substring(startIdx);

  // 1차 시도: 표준 파싱
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn("표준 JSON 파싱 실패, 복구 시도 중...");
    
    // 2차 시도: 잘린 JSON 복구 로직
    try {
      let repaired = cleaned;
      
      // 1. 열린 따옴표 닫기 (문자열 도중 잘림 방지)
      const quoteCount = (repaired.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        repaired += '"';
      }

      // 2. 스택을 이용해 누락된 괄호 추적 및 보정
      const stack: string[] = [];
      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (char === '{') stack.push('}');
        else if (char === '[') stack.push(']');
        else if (char === '}') {
          if (stack[stack.length - 1] === '}') stack.pop();
        } else if (char === ']') {
          if (stack[stack.length - 1] === ']') stack.pop();
        }
      }

      // 역순으로 닫히지 않은 괄호 추가
      while (stack.length > 0) {
        repaired += stack.pop();
      }

      return JSON.parse(repaired);
    } catch (repairedError) {
      console.error("JSON 복구 파싱 최종 실패:", repairedError);
      return null;
    }
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

/**
 * 자산 시세를 일괄 업데이트합니다.
 * 중복 종목을 제거하고 캐싱을 적용하여 효율적으로 처리합니다.
 */
export const updateAssetPrices = async (assets: Asset[]): Promise<PriceUpdateResult> => {
  const now = Date.now();
  const allUpdatedPrices: Record<string, number> = {};
  let latestExchangeRate: number | undefined;

  // 1. 업데이트가 필요한 유니크한 종목 리스트 추출 (현금 제외)
  const uniqueItemsMap = new Map<string, { name: string; ticker?: string; currency: string }>();
  
  assets.forEach(asset => {
    if (asset.type === AssetType.CASH) return;
    
    // 유니크 키 생성 (티커 우선, 없으면 이름 + 통화)
    const key = `${asset.ticker || asset.name}_${asset.currency}`;
    const cached = PRICE_CACHE.get(key);
    
    // 캐시 확인 (10분 이내 데이터가 있으면 API 요청 대상에서 제외)
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      allUpdatedPrices[key] = cached.price;
    } else if (!uniqueItemsMap.has(key)) {
      uniqueItemsMap.set(key, { 
        name: asset.name, 
        ticker: asset.ticker, 
        currency: asset.currency 
      });
    }
  });

  const needUpdate = Array.from(uniqueItemsMap.entries());

  // 2. 조회가 필요한 항목이 있다면 AI에게 요청 (10개씩 배치 처리)
  if (needUpdate.length > 0) {
    const itemChunks = chunkArray(needUpdate, 10);

    for (const chunk of itemChunks) {
      const chunkData = chunk.map(([key, info]) => ({
        key,
        name: info.name,
        ticker: info.ticker,
        currency: info.currency
      }));

      const prompt = `
        [실시간 금융 데이터 업데이트]
        다음 자산 리스트에 대해 최신 시장 가격을 조사하세요.
        반드시 제시된 "key" 값을 JSON 응답의 키로 사용해야 합니다.
        미국 주식은 USD, 한국 주식은 KRW 단위 가격을 응답하세요.
        실시간 USD/KRW 환율 정보도 포함하세요.

        조사 대상: ${JSON.stringify(chunkData)}
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
                    properties: { 
                      key: { type: Type.STRING }, 
                      price: { type: Type.NUMBER } 
                    },
                    required: ["key", "price"]
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
            allUpdatedPrices[p.key] = p.price;
            // 내부 캐시 업데이트
            PRICE_CACHE.set(p.key, { price: p.price, timestamp: now });
          });
        }
        if (parsed?.exchangeRate) {
          latestExchangeRate = parsed.exchangeRate;
        }
      } catch (error) {
        console.error("Batch price update failed for chunk", error);
      }
    }
  }

  // 3. 기존 자산 목록에 결과 매핑 (동일 종목은 동일 시세 적용)
  const updatedAssets = assets.map(asset => {
    if (asset.type === AssetType.CASH) return asset;
    
    const key = `${asset.ticker || asset.name}_${asset.currency}`;
    const newPrice = allUpdatedPrices[key];
    
    return newPrice ? { ...asset, currentPrice: newPrice } : asset;
  });

  return { updatedAssets, exchangeRate: latestExchangeRate };
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
    - **중요: JSON 응답이 너무 길어지지 않도록 아래 글자 수를 준수하세요.**
    - currentDiagnosis: 250자 이내 핵심 요약
    - bestStrategy.description: 150자 이내
    - bestStrategy.rationale: 200자 이내
    - executionPlanItem.reason: 60자 이내
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
      throw new Error("AI 분석 데이터 파싱에 실패했습니다. 자산 내역이 너무 많거나 응답이 길어 처리할 수 없습니다. 핵심 자산 위주로 다시 시도해보세요.");
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

export const getAssetHistory = async (ticker: string, name: string): Promise<{ date: string, price: number }[]> => {
  const prompt = `Research the historical daily closing prices for the asset "${ticker || name}" for the last 30 days and return it in JSON format.
  Response format: [{"date": "YYYY-MM-DD", "price": 12345}, ...]`;

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
              date: { type: Type.STRING },
              price: { type: Type.NUMBER }
            },
            required: ["date", "price"]
          }
        }
      }
    });
    return (safeJsonParse(response.text) || []) as { date: string, price: number }[];
  } catch (error) {
    console.error("Failed to fetch asset history", error);
    return [];
  }
};
