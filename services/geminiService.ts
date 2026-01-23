
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Asset, AssetType, RebalancingStrategy } from "../types";

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
        const msg = error.message || '';
        const isRateLimit = status === 429 || msg.includes('429') || msg.includes('quota');

        if (isRateLimit) {
           const waitTime = 5000 * Math.pow(2, i);
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

export const getAIAnalysis = async (assets: Asset[], exchangeRate: number): Promise<AnalysisResponse> => {
  let totalValueKRW = 0;
  let cashValueKRW = 0;

  const assetSummary = assets.length > 0 
    ? assets.map(a => {
        const price = a.currentPrice || 0;
        const qty = a.quantity || 0;
        const mult = a.currency === 'USD' ? exchangeRate : 1;
        const valKRW = price * qty * mult;
        
        totalValueKRW += valKRW;
        if (a.type === AssetType.CASH) cashValueKRW += valKRW;

        return `- [${a.institution} | ${a.type}] ${a.name}(${a.ticker || 'N/A'}): ${qty}주, 평가액 ${Math.floor(valKRW).toLocaleString()}원, 계좌ID: ${a.accountId || '미지정'}`;
      }).join('\n')
    : "자산 없음";

  const prompt = `
    당신은 대한민국 금융 규정에 정통한 **수석 자산관리 전문가(PB)**입니다.
    사용자의 목표: **2029년까지 자산 증식(Growth)**, **2030년부터 인컴 전환(Income)**.

    [현재 포트폴리오 데이터]
    - 총 자산: 약 ${Math.floor(totalValueKRW).toLocaleString()} KRW
    - 가용 현금: 약 ${Math.floor(cashValueKRW).toLocaleString()} KRW
    - 상세 보유 내역:
    ${assetSummary}

    [분석 및 제안 핵심 규칙]
    1. **자산 유형별 특성 고려**: 
       - **주식**: 성장성 중심, 높은 변동성 용인.
       - **채권**: 안정적인 이자 수익, 포트폴리오 방어.
       - **현금**: 유동성 확보 및 저가 매수 기회 대기.
    2. **대한민국 연금 규정 엄수 (매우 중요)**:
       - 자산 타입이 '연금'(Pension)인 경우, **대한민국 IRP/DC형 퇴직연금 운용 규정**을 기준으로 액션 플랜을 짜야 합니다.
       - **위험자산 한도 70% 룰**: 주식형 자산 비중이 계좌 내 70%를 넘지 않도록 조정하십시오.
       - **상품 제한**: 개별 주식 직접 투자 불가(ETF만 가능), 레버리지/인버스 ETF 매수 금지, 파생상품 위험평가액 40% 초과 금지.
       - 위반 소지가 있는 상품 추천 시 **"연금 계좌 매수 불가 상품"**으로 간주하고 안전한 대안(TDF, 채권형 ETF, 예금 등)을 제시하십시오.
    3. **계좌별/기관별 실행 계획 그룹화**:
       - 매매 제안은 반드시 **기관(Institution) 및 계좌(Account)** 단위로 묶어서 제시해야 합니다. 

    [출력 요구사항]
    - 'bestStrategy.executionGroups' 배열에 기관/계좌별로 그룹화된 실행 계획을 담아주세요.
    - 한국어로 작성하고 JSON 형식을 엄격히 준수하십시오.
  `;

  try {
    const response = await generateContentWithRetry({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { 
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            currentDiagnosis: { type: Type.STRING, description: "자산 유형별 특성과 비중을 분석한 진단 리포트 (마크다운)" },
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
                          },
                          required: ["assetName", "ticker", "action", "quantity", "estimatedPrice", "totalAmount", "reason", "isNew"]
                        }
                      }
                    },
                    required: ["institution", "accountName", "isPension", "items"]
                  }
                }
              },
              required: ["name", "description", "riskLevel", "predictedReturnRate", "rationale", "targetSectorAllocation", "executionGroups"]
            }
          },
          required: ["currentDiagnosis", "marketConditions", "bestStrategy"]
        }
      }
    });
    
    const parsed = safeJsonParse(response.text);
    if (!parsed) throw new Error("Parsing Failed");

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
              currency: { type: Type.STRING, enum: ["KRW", "USD"] },
              type: { type: Type.STRING, enum: ["주식", "채권", "연금", "현금"] }
            }
          }
        }
      }
    });
    return (safeJsonParse(response.text) || []) as StockInfo[];
  } catch (error) { return []; }
};

export const updateAssetPrices = async (assets: Asset[]): Promise<PriceUpdateResult> => {
  if (assets.length === 0) {
     // 자산이 없어도 환율 정보는 필요할 수 있으므로 구글 검색으로 환율만이라도 가져오도록 유도
     const fallbackPrompt = "현재 USD/KRW 실시간 환율 정보를 JSON으로 반환하세요. { \"exchangeRate\": 1350.0 }";
     try {
       const resp = await generateContentWithRetry({
         model: 'gemini-3-flash-preview',
         contents: fallbackPrompt,
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

  const targets = assets.filter(a => a.type !== AssetType.CASH);
  try {
    const assetInfo = targets.map(a => ({ id: a.id, name: a.name, ticker: a.ticker, currency: a.currency }));
    const prompt = `다음 자산들의 현재 시장 가격과 현재 실시간 USD/KRW 환율을 구글 검색을 통해 정확히 조사하여 JSON으로 반환하세요: ${JSON.stringify(assetInfo)}`;
    const response = await generateContentWithRetry({
      model: 'gemini-3-flash-preview',
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
                properties: { id: { type: Type.STRING }, price: { type: Type.NUMBER } }
              }
            },
            exchangeRate: { type: Type.NUMBER, description: "최신 USD/KRW 환율 (예: 1385.5)" }
          },
          required: ["prices", "exchangeRate"]
        }
      }
    });
    const parsed = safeJsonParse(response.text);
    const updatedAssets = assets.map(asset => {
      const mapping = parsed?.prices?.find((m: any) => m.id === asset.id);
      return mapping ? { ...asset, currentPrice: mapping.price } : asset;
    });
    return { updatedAssets, exchangeRate: parsed?.exchangeRate };
  } catch (error) { 
    console.error("Price Update Error:", error);
    return { updatedAssets: assets }; 
  }
};

export const getStockDeepDive = async (query: string): Promise<{ text: string, sources: { title: string; uri: string }[] }> => {
  const prompt = `"${query}" 종목의 최신 심층 분석 리포트 (마크다운).`;
  try {
    const response = await generateContentWithRetry({
      model: 'gemini-3-flash-preview',
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
  const prompt = `자산 분류 JSON: ${JSON.stringify(transactions)}`;
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
