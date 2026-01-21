
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Asset, AssetType } from "../types";

export interface RebalancingTarget {
  institution: string;
  targetWeight: number;
}

export interface AnalysisResponse {
  text: string;
  sources: { title: string; uri: string }[];
  rebalancingWeights?: RebalancingTarget[];
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

export interface ClassifiedTransaction {
  id: string;
  type: AssetType;
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

// --- Rate Limiting & Retry Logic ---

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class RequestQueue {
  private queue: (() => Promise<void>)[] = [];
  private activeCount = 0;
  private maxConcurrency = 1; 
  private lastRequestTime = 0;
  private minInterval = 2000; // Force at least 2 seconds between requests

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
  
  // Set thinkingBudget to 0 for non-complex tasks to save quota/tokens if not specified
  if (params.config && !params.config.thinkingConfig && params.model.includes('flash')) {
    params.config.thinkingConfig = { thinkingBudget: 0 };
  }

  const apiCall = async () => {
    let lastError;
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await ai.models.generateContent(params);
      } catch (error: any) {
        lastError = error;
        const status = error.status || error.code;
        const msg = error.message || '';
        const isRateLimit = status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
        const isNetworkError = msg.includes('Failed to fetch') || status === 503;

        if (isRateLimit || isNetworkError) {
           if (i === maxRetries - 1) break; 
           // Aggressive backoff for 429s: 4s, 8s, 16s, 32s...
           const waitTime = 4000 * Math.pow(2, i) + (Math.random() * 2000);
           console.warn(`Gemini API Quota/Network Error (${status || 'Fetch Fail'}). Attempt ${i+1}/${maxRetries}. Retrying in ${Math.round(waitTime)}ms...`);
           await delay(waitTime);
           continue;
        }
        throw error;
      }
    }
    throw lastError;
  };

  if (useQueue) {
    return requestQueue.add(apiCall);
  }
  return apiCall();
}

// --- API Functions ---

export const getAIAnalysis = async (assets: Asset[]): Promise<AnalysisResponse> => {
  const assetSummary = assets.length > 0 
    ? assets.map(a => `- ${a.name}(${a.ticker || 'N/A'}) [${a.type}, ${a.institution}]: 수량 ${a.quantity}, 평균단가 ${a.purchasePrice}, 현재가 ${a.currentPrice}${a.currency}`).join('\n')
    : "현재 등록된 자산이 없습니다.";

  const prompt = `
    당신은 대한민국 최고의 AI 자산관리사 'PortFlow AI'입니다. 
    구글 검색을 통해 최신 실시간 경제 뉴스, 금리, 환율, 시장 지표를 파악하고, 이를 바탕으로 사용자의 포트폴리오를 심층 분석한 리포트와 구체적인 리밸런싱 비중(기관별)을 제안하세요.

    [사용자 포트폴리오 데이터]
    ${assetSummary}
    
    [결과 요구사항]
    1. 'analysisReport': 마크다운 형식의 전문 리포트
    2. 'rebalancingWeights': 각 금융기관별로 제안하는 목표 비중 (%)의 목록 (합계는 100이 되도록 조정)
  `;

  try {
    const response = await generateContentWithRetry({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { 
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysisReport: { type: Type.STRING },
            rebalancingWeights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  institution: { type: Type.STRING },
                  targetWeight: { type: Type.NUMBER }
                },
                required: ["institution", "targetWeight"]
              }
            }
          },
          required: ["analysisReport", "rebalancingWeights"]
        }
      }
    });
    
    const parsed = safeJsonParse(response.text);
    const text = parsed?.analysisReport || "분석 결과를 생성할 수 없습니다.";
    const rebalancingWeights = parsed?.rebalancingWeights || [];
    
    const sources: { title: string; uri: string }[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web) sources.push({ title: chunk.web.title, uri: chunk.web.uri });
      });
    }
    return { text, sources, rebalancingWeights };
  } catch (error: any) {
    console.error("AI Analysis failed:", error);
    if (error?.message?.includes('quota') || error?.status === 429) {
        return { text: "⚠️ **사용량 제한 초과**: 현재 무료 티커 사용량이 모두 소진되었습니다. 잠시(약 1~2분) 후 다시 시도해주세요. 구글 검색 기능을 포함한 분석은 더 많은 할당량을 소모합니다.", sources: [] };
    }
    return { text: "일시적인 오류로 분석을 완료할 수 없습니다. 네트워크 상태를 확인하거나 잠시 후 다시 시도해주세요.", sources: [] };
  }
};

export const searchStockList = async (query: string): Promise<StockInfo[]> => {
  if (!query.trim()) return [];
  
  const prompt = `
    "${query}"에 해당하는 실제 투자 자산(주식, 채권, 펀드, ETF 등)의 실시간 정보를 검색하여 최대 5개까지 목록으로 제공하세요.
    반드시 현재 가격과 통화(KRW 또는 USD)를 정확히 확인해야 합니다. 
  `;

  try {
    const response = await generateContentWithRetry({
      model: "gemini-3-flash-preview",
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
              type: { type: Type.STRING, enum: ["주식", "채권", "연금", "현금"] },
              market: { type: Type.STRING }
            },
            required: ["name", "ticker", "price", "currency", "type"]
          }
        }
      }
    });

    const parsed = safeJsonParse(response.text);
    return (parsed || []) as StockInfo[];
  } catch (error) {
    console.error("Stock search failed:", error);
    return [];
  }
};

export const updateAssetPrices = async (assets: Asset[]): Promise<PriceUpdateResult> => {
  if (assets.length === 0) return { updatedAssets: assets };
  
  const targets = assets.filter(a => a.type !== AssetType.CASH);
  const chunkSize = 5; // Further reduced chunk size for more granular requests
  const chunks = [];
  for (let i = 0; i < targets.length; i += chunkSize) {
    chunks.push(targets.slice(i, i + chunkSize));
  }

  const allPriceMappings: any[] = [];
  let finalExchangeRate = 0;

  try {
    for (const chunk of chunks) {
      const assetInfo = chunk.map(a => ({
        id: a.id,
        name: a.name,
        ticker: a.ticker || "",
        type: a.type,
        currency: a.currency
      }));

      const prompt = `
        다음 투자 자산들의 '현재 실시간 시장 가격'을 검색하여 JSON 객체로 반환하세요.
        
        [대상 자산 목록]
        ${JSON.stringify(assetInfo)}

        [환율 정보]
        - 현재 KRW/USD 환율도 'exchangeRate' 필드에 포함하세요.
      `;

      const response = await generateContentWithRetry({
        model: "gemini-3-flash-preview",
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
            required: ["prices"]
          }
        }
      });

      const parsed = safeJsonParse(response.text);
      if (parsed) {
        if (parsed.prices) allPriceMappings.push(...parsed.prices);
        if (parsed.exchangeRate) finalExchangeRate = parsed.exchangeRate;
      }
      
      // Wait between chunks to avoid hitting RPM limits
      await delay(2000);
    }
    
    const updatedAssets = assets.map(asset => {
      if (asset.type === AssetType.CASH) return { ...asset, currentPrice: asset.purchasePrice };
      const mapping = allPriceMappings.find((m: any) => m.id === asset.id);
      if (mapping && typeof mapping.price === 'number' && mapping.price > 0) {
        return { ...asset, currentPrice: mapping.price };
      }
      return asset;
    });

    return { updatedAssets, exchangeRate: finalExchangeRate || undefined };
  } catch (error) {
    console.error("Price update failed:", error);
    return { updatedAssets: assets };
  }
};

export const getStockDeepDive = async (query: string): Promise<AnalysisResponse> => {
  const prompt = `
    "${query}" 종목에 대해 구글 검색 기반 실시간 심층 분석 리포트를 마크다운으로 작성하세요. 
    최신 뉴스, 실시간 주가 추이, 목표가, 리스크를 포함하세요.
  `;
  try {
    const response = await generateContentWithRetry({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });
    
    const text = response.text || "결과를 생성할 수 없습니다.";
    const sources: { title: string; uri: string }[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web) sources.push({ title: chunk.web.title, uri: chunk.web.uri });
      });
    }
    return { text, sources };
  } catch (error) {
    return { text: "분석 정보를 가져올 수 없습니다. 사용량 제한을 확인해주세요.", sources: [] };
  }
};

export const getAssetHistory = async (ticker: string, name: string): Promise<HistoryPoint[]> => {
  const prompt = `
    "${name}(${ticker})" 종목의 지난 52주간의 대략적인 주간 종가 데이터(약 12개 지점)를 JSON 배열로 생성하세요.
  `;

  try {
    const response = await generateContentWithRetry({
      model: "gemini-3-flash-preview",
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

    const parsed = safeJsonParse(response.text);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p: any) => ({
      date: p.date || new Date().toISOString().split('T')[0],
      price: Number(p.price) || 0
    }));
  } catch (error) {
    return [];
  }
};

export const classifyTransactionTypes = async (transactions: {id: string, name: string, institution: string}[]): Promise<ClassifiedTransaction[]> => {
  if (transactions.length === 0) return [];
  
  const prompt = `
    다음 거래 내역 리스트를 보고 각 거래의 '자산 유형'을 분류하세요. ("주식", "채권", "연금", "현금")
    
    [거래 리스트]
    ${JSON.stringify(transactions)}
  `;

  try {
    const response = await generateContentWithRetry({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["주식", "채권", "연금", "현금"] }
            },
            required: ["id", "type"]
          }
        }
      }
    });

    const parsed = safeJsonParse(response.text);
    return (parsed || []) as ClassifiedTransaction[];
  } catch (error) {
    console.error("Classification failed:", error);
    return [];
  }
};
