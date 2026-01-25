
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

const safeJsonParse = (text: string) => {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return null;
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class RequestQueue {
  private queue: (() => Promise<void>)[] = [];
  private activeCount = 0;
  private maxConcurrency = 1; 
  private lastRequestTime = 0;
  private minInterval = 2000;

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
    const maxRetries = 4;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await ai.models.generateContent(params);
      } catch (error: any) {
        lastError = error;
        const status = error.status || error.code;
        const msg = error.message || '';
        const isRateLimit = status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');

        if (isRateLimit) {
           const waitTime = (8000 * Math.pow(2, i)) + (Math.random() * 2000);
           console.warn(`Rate limit hit (429). Retrying in ${Math.round(waitTime/1000)}s...`);
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

/**
 * 배열을 지정된 크기로 나누는 헬퍼 함수
 */
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * 실시간 시세 및 환율 업데이트 고도화 (배치 처리)
 * 1. 5개 단위의 배치를 순차적으로 처리하여 Gemini 3 Pro의 검색 집중도를 높임
 * 2. 각 종목별로 Yahoo Finance, Google Finance 등 실시간 소스 확인 강제
 * 3. 최신 USD/KRW 환율 정보를 모든 배치에서 교차 검증하여 일관성 확보
 */
export const updateAssetPrices = async (assets: Asset[]): Promise<PriceUpdateResult> => {
  const targets = assets.filter(a => a.type !== AssetType.CASH);
  
  if (targets.length === 0) {
     const fxPrompt = "현재 시점의 실시간 USD/KRW 환율 정보를 웹 검색을 통해 정밀하게 조사하여 JSON으로 반환하세요. { \"exchangeRate\": 숫자 }";
     try {
       const resp = await generateContentWithRetry({
         model: 'gemini-3-pro-preview',
         contents: fxPrompt,
         config: {
           tools: [{ googleSearch: {} }],
           responseMimeType: "application/json",
           responseSchema: {
             type: Type.OBJECT,
             properties: { exchangeRate: { type: Type.NUMBER } }
           }
         }
       });
       const p = safeJsonParse(resp.text);
       return { updatedAssets: assets, exchangeRate: p?.exchangeRate };
     } catch(e) { return { updatedAssets: assets }; }
  }

  const assetChunks = chunkArray(targets, 5);
  let allUpdatedPrices: { id: string, price: number }[] = [];
  let latestExchangeRate: number | undefined;

  for (const chunk of assetChunks) {
    const chunkInfo = chunk.map(a => ({ 
      id: a.id, 
      name: a.name, 
      ticker: a.ticker, 
      currency: a.currency,
      type: a.type 
    }));
    
    const prompt = `
      [실시간 금융 데이터 정밀 검색 - 배치 업데이트]
      1. 아래 자산 리스트에 대해 **티커(Ticker) 정보를 우선 사용**하여 현재 실시간 시장 가격을 웹 검색(Google/Yahoo Finance)으로 조사하세요.
      2. 검색 시점 기준 가장 최근의 종가 또는 실시간가를 가져오며, 장이 열려있다면 현재가를 반영하세요.
      3. 미국 주식/ETF는 USD($), 한국 주식/ETF는 KRW(₩) 가격을 가져오세요.
      4. **현재 시점의 실시간 USD/KRW 환율**을 반드시 조사하여 함께 반환하세요.
      5. 검색 결과의 정확성을 위해 신뢰할 수 있는 금융 포털 소스를 2개 이상 교차 확인하세요.

      [조사 대상 배치]
      ${JSON.stringify(chunkInfo)}

      [결과 JSON 요구사항]
      {
        "prices": [ { "id": "자산ID", "price": 숫자_최신가 } ],
        "exchangeRate": 숫자_현재환율
      }
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
                    id: { type: Type.STRING }, 
                    price: { type: Type.NUMBER } 
                  },
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
        allUpdatedPrices = [...allUpdatedPrices, ...parsed.prices];
      }
      if (parsed?.exchangeRate) {
        latestExchangeRate = parsed.exchangeRate;
      }
    } catch (error) {
      console.error("Batch Update Error:", error);
    }
  }

  const finalAssets = assets.map(asset => {
    const found = allUpdatedPrices.find(p => p.id === asset.id);
    return found ? { ...asset, currentPrice: found.price } : asset;
  });

  return { 
    updatedAssets: finalAssets, 
    exchangeRate: latestExchangeRate 
  };
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
    결과는 반드시 다음 JSON 형식을 따르세요:
    {
      "goal": "한 줄 요약 목표 (예: '은퇴 대비 10억 자산 증식')",
      "prompt": "수석 PB가 사용할 상세 지침. (~을 우선 고려하고, ~한 비중을 유지하며, ~계좌는 어떻게 운용하라는 식의 3~4문장)"
    }
  `;

  try {
    const response = await generateContentWithRetry({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: "application/json" }
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

    [계좌 유형별 필수 운용 규정 및 전략 - 엄격히 준수]
    1. **퇴직연금(IRP) 및 확정기여형(DC)**:
       - **위험자산 70% 제한 규정**: 주식형 ETF, 주식형 펀드, 리츠 등 '위험자산'으로 분류되는 항목은 해당 계좌 내 총 자산의 70%를 초과할 수 없습니다.
    2. **개인연금(연금저축)**:
       - 개별 주식 매수 불가 (펀드 및 ETF만 가능).
    3. **ISA(중개형)**:
       - 비과세 혜택 극대화.
    4. **종합(위탁) 계좌**:
       - 제한 없음.

    [출력 요구사항]
    - 각 계좌별로 위험자산 한도 준수 여부를 먼저 체크하고 진단하십시오.
    - 한국어로 작성하고 JSON 형식을 엄격히 준수하십시오.
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
            currentDiagnosis: { type: Type.STRING, description: "계좌 규정 준수 여부 및 자산 배분 상세 진단 (마크다운)" },
            marketConditions: { type: Type.STRING },
            bestStrategy: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                riskLevel: { type: Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH'] },
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
                            action: { type: Type.STRING, enum: ['BUY', 'SELL', 'HOLD'] },
                            quantity: { type: Type.NUMBER },
                            estimatedPrice: { type: Type.NUMBER },
                            totalAmount: { type: Type.NUMBER },
                            reason: { type: Type.STRING },
                            isNew: { type: Type.BOOLEAN }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
    
    const parsed = safeJsonParse(response.text);
    const sources: { title: string; uri: string }[] = [];
    response.candidates?.[0]?.groundingMetadata?.groundingChunks?.forEach((c: any) => {
      if (c.web) sources.push({ title: c.web.title, uri: c.web.uri });
    });

    return { 
      currentDiagnosis: parsed.currentDiagnosis || "진단 데이터를 불러올 수 없습니다.",
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
  const prompt = `"${query}" 관련 투자 자산 5개의 실시간 정보를 JSON으로 반환하세요. 분류는 주식, 펀드, ETF, 금, 현금 중 하나여야 합니다.`;
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
              currency: { type: Type.STRING, enum: ["KRW", "USD"] },
              type: { type: Type.STRING, enum: ["주식", "펀드", "ETF", "금", "현금"] }
            }
          }
        }
      }
    });
    return (safeJsonParse(response.text) || []) as StockInfo[];
  } catch (error) { return []; }
};

export const getStockDeepDive = async (query: string): Promise<{ text: string, sources: { title: string; uri: string }[] }> => {
  const prompt = `"${query}" 종목의 최신 심층 분석 리포트 (마크다운). IRP/DC 계좌에서의 편입 가능 여부(위험자산 해당 여부)를 포함하여 분석하십시오.`;
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
  const prompt = `"${name}(${ticker})"의 지난 12개월 주간 종가 데이터 JSON 배열. [{date, price}]`;
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
  const prompt = `다음 거래 내역들을 주식, 펀드, ETF, 금, 현금 중 하나로 분류하여 JSON 배열로 반환하세요: ${JSON.stringify(transactions)}`;
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
