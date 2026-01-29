
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Asset, AssetType, RebalancingStrategy, Account, AccountType, UserProfile, DiagnosisResponse } from "../types";

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

interface CachedPrice {
  price: number;
  timestamp: number;
}
const PRICE_CACHE = new Map<string, CachedPrice>();
const CACHE_TTL = 60 * 60 * 1000; 

const safeJsonParse = (text: string) => {
  if (!text) return null;
  let cleaned = text.replace(/```json|```/g, "").trim();
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }
  if (startIdx === -1) return null;
  cleaned = cleaned.substring(startIdx);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    try {
      let repaired = cleaned;
      const quoteCount = (repaired.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) repaired += '"';
      const stack: string[] = [];
      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (char === '{') stack.push('}');
        else if (char === '[') stack.push(']');
        else if (char === '}') { if (stack[stack.length - 1] === '}') stack.pop(); }
        else if (char === ']') { if (stack[stack.length - 1] === ']') stack.pop(); }
      }
      while (stack.length > 0) repaired += stack.pop();
      return JSON.parse(repaired);
    } catch (repairedError) {
      return null;
    }
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class RequestQueue {
  private queue: (() => Promise<void>)[] = [];
  private activeCount = 0;
  private maxConcurrency = 1; 
  private lastRequestTime = 0;
  private minInterval = 3000; 

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

export const globalRequestQueue = new RequestQueue();

async function generateContentWithRetry(params: any, useQueue = true): Promise<GenerateContentResponse> {
  const apiCall = async () => {
    let lastError;
    const maxRetries = 3; 
    for (let i = 0; i < maxRetries; i++) {
      // API Key가 갱신될 수 있으므로 매번 새로 인스턴스화
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      try {
        return await ai.models.generateContent(params);
      } catch (error: any) {
        lastError = error;
        const status = error.status || error.code || (error.message?.includes('429') ? 429 : 0);
        
        // 429 에러는 지수 백오프로 재시도
        if (status === 429 || error.message?.includes('quota')) {
          const waitTime = (5000 * Math.pow(2.2, i)) + (Math.random() * 2000);
          console.warn(`[Gemini API] Quota exceeded. Retrying in ${Math.round(waitTime/1000)}s...`);
          await delay(waitTime);
          continue;
        }
        throw error;
      }
    }
    // 재시도 끝에 실패하면 마지막 에러 전달
    throw lastError;
  };
  
  return useQueue ? globalRequestQueue.add(apiCall) : apiCall();
}

export const updateAssetPrices = async (assets: Asset[]): Promise<PriceUpdateResult> => {
  const now = Date.now();
  const allUpdatedPrices: Record<string, number> = {};
  let latestExchangeRate: number | undefined;
  
  const uniqueItemsMap = new Map<string, { name: string; ticker?: string; currency: string }>();
  
  assets.forEach(asset => {
    if (asset.type === AssetType.CASH) return;
    const key = `${asset.ticker || asset.name}_${asset.currency}`;
    const cached = PRICE_CACHE.get(key);
    
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      allUpdatedPrices[key] = cached.price;
    } else if (!uniqueItemsMap.has(key)) {
      uniqueItemsMap.set(key, { name: asset.name, ticker: asset.ticker, currency: asset.currency });
    }
  });

  const needUpdate = Array.from(uniqueItemsMap.entries());
  if (needUpdate.length > 0) {
    const itemChunks = [];
    for (let i = 0; i < needUpdate.length; i += 15) {
      itemChunks.push(needUpdate.slice(i, i + 15));
    }

    for (const chunk of itemChunks) {
      const chunkData = chunk.map(([key, info]) => ({ 
        key, 
        name: info.name, 
        ticker: info.ticker, 
        currency: info.currency 
      }));
      
      const prompt = `Investigate the latest market prices for these assets and provide the current USD/KRW exchange rate: ${JSON.stringify(chunkData)}. Return results as JSON with "prices" array containing {key, price} and an "exchangeRate" number.`;
      
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
            PRICE_CACHE.set(p.key, { price: p.price, timestamp: now });
          });
        }
        if (parsed?.exchangeRate) {
          latestExchangeRate = parsed.exchangeRate;
        }
      } catch (error) {
        console.error("Price update failed for chunk:", error);
      }
    }
  }

  const updatedAssets = assets.map(asset => {
    if (asset.type === AssetType.CASH) return asset;
    const key = `${asset.ticker || asset.name}_${asset.currency}`;
    const newPrice = allUpdatedPrices[key];
    return newPrice ? { ...asset, currentPrice: newPrice } : asset;
  });

  return { updatedAssets, exchangeRate: latestExchangeRate };
};

export const generateGoalPrompt = async (answers: any): Promise<{ goal: string, prompt: string }> => {
  const prompt = `
    당신은 세계 최고의 자산관리 전문가입니다. 사용자의 정보를 바탕으로 요약된 '투자 목표 한 줄'과 AI가 자산 진단 시 참고할 '상세 투자 지침 프롬프트'를 한국어로 생성하십시오.
    
    [사용자 입력 정보]:
    - 연령: ${answers.age}
    - 투자 성향: ${answers.risk}
    - 투자 목적: ${answers.purpose}
    - 투자 기간: ${answers.horizon}
    - 선호 자산: ${answers.preference}
    - 추가 요청 사항: ${answers.customRequest || "없음"}
    
    [작업 지침]:
    1. 'goal': 핵심 투자 목표를 10자 내외의 한국어 구절로 작성.
    2. 'prompt': 향후 진단 기준이 될 가이드라인. 특히 ISA, IRP 등 한국 특유의 절세 계좌 활용법을 고려하여 지침을 구체화하십시오.
    
    [출력]: JSON 형식 { "goal": "...", "prompt": "..." }
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
      goal: parsed?.goal || "맞춤형 관리", 
      prompt: parsed?.prompt || "분산 투자를 권장합니다." 
    };
  } catch (error) { 
    throw error;
  }
};

export const getAIDiagnosis = async (
  assets: Asset[], 
  accounts: Account[], 
  exchangeRate: number,
  userProfile: UserProfile | null
): Promise<DiagnosisResponse> => {
  const assetSummary = assets.map(a => 
    `- [${a.managementType || '일반'}] ${a.institution} | ${a.type} | ${a.name}: ${a.quantity}주, 평가액 ${(a.currentPrice * a.quantity * (a.currency === 'USD' ? exchangeRate : 1)).toLocaleString()}원`
  ).join('\n');

  const prompt = `
    대한민국 상위 1%를 담당하는 자산관리 전문가(PB)로서 아래 포트폴리오를 정밀 진단하십시오.
    각 자산이 담긴 **계좌유형(ISA, IRP, 개인연금 등)**의 법적/세제적 특성을 반드시 반영해야 합니다.

    ${userProfile?.goalPrompt ? `[사용자 투자 원칙 및 요청 사항]: ${userProfile.goalPrompt}` : ""}
    
    [자산 포트폴리오 현황]:
    ${assetSummary}
    
    [중점 분석 요구사항]:
    1. **계좌별 규제 준수**: 특히 IRP/DC형 계좌의 경우, 주식형 자산 비중이 법적 한도(70%)를 초과했는지 확인하십시오.
    2. **세제 효율성(Asset Location)**: ISA나 연금계좌에 담기에 부적절한 자산이 있는지 분석하십시오.
    3. **리스크 분석**: 자산 배분 상태, 섹터 편중 리스크, 환율 노출도.
    
    [출력 형식]:
    - JSON { "currentDiagnosis": "...", "marketConditions": "..." }
    - 'currentDiagnosis': 마크다운 형식. 핵심 문제점과 진단 내용을 한국어로 상세히 서술.
    - 'marketConditions': 현재 시장 상황 요약 (한국어).
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
            marketConditions: { type: Type.STRING }
          },
          required: ["currentDiagnosis", "marketConditions"]
        }
      }
    });
    const parsed = safeJsonParse(response.text);
    return { 
      currentDiagnosis: parsed?.currentDiagnosis || "진단 생성 실패",
      marketConditions: parsed?.marketConditions || "정보 없음",
      sources: [] 
    };
  } catch (error) { throw error; }
};

export const getAIStrategy = async (
  assets: Asset[], 
  accounts: Account[], 
  exchangeRate: number,
  diagnosis: string,
  userProfile: UserProfile | null
): Promise<RebalancingStrategy> => {
  const rawAssetData = assets.map(a => 
    `- [${a.managementType || '일반'}] ${a.name}(${a.ticker || 'N/A'}): ${a.quantity}주 보유, 현재가 ${a.currentPrice} ${a.currency} (${a.institution})`
  ).join('\n');

  const prompt = `
    당신은 수석 자산관리 전문가(PB)입니다. 
    앞서 수행된 [진단 결과]를 바탕으로, 각 **계좌유형별 특성**을 고려한 리밸런싱 전략을 수립하십시오.
    
    [진단 결과]: "${diagnosis}"
    
    [사용자 프로필]: ${userProfile?.investmentGoal || "자산 증식"}
    [보유 자산]: ${rawAssetData}

    [전략 수립 지침]:
    1. **IRP/DC 계좌**: 위험자산 비중이 70%를 넘지 않도록 안전자산 편입 비중을 정확히 계산하여 제안하십시오.
    2. **ISA 계좌**: 비과세 및 저율과세 혜택을 위해 배당주, 해외 주식형 ETF(국내상장) 위주로 재편하십시오.
    3. **일반 계좌**: 직접 투자나 우량주 위주로 배치하십시오.
    4. **언어**: 모든 설명(description), 근거(rationale, reason), 조치(action) 등 텍스트 데이터는 반드시 **한국어**로 작성하십시오.

    [JSON 응답 스키마]:
    - executionGroups: 계좌별/관리유형별로 그룹화하여 실행 단계 작성.
  `;

  try {
    const response = await generateContentWithRetry({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 2048 },
        responseSchema: {
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
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        assetName: { type: Type.STRING },
                        ticker: { type: Type.STRING },
                        action: { type: Type.STRING },
                        quantity: { type: Type.NUMBER },
                        totalAmount: { type: Type.NUMBER },
                        reason: { type: Type.STRING }
                      },
                      required: ["assetName", "action", "quantity", "totalAmount"]
                    }
                  }
                },
                required: ["institution", "items"]
              }
            }
          },
          required: ["name", "description", "executionGroups"]
        }
      }
    });
    const parsed = safeJsonParse(response.text);
    if (!parsed) throw new Error("전략 생성 실패");
    return parsed as RebalancingStrategy;
  } catch (error) { throw error; }
};

export const searchStockList = async (query: string): Promise<StockInfo[]> => {
  const prompt = `Search for 5 investment assets related to "${query}" and return info as JSON.`;
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
  const prompt = `Latest deep-dive report (Markdown) for "${query}".`;
  try {
    const response = await generateContentWithRetry({ 
      model: 'gemini-3-pro-preview', 
      contents: prompt, 
      config: { tools: [{ googleSearch: {} }] } 
    });
    return { text: response.text || "분석 불가", sources: [] };
  } catch (error) { throw error; }
};

export const classifyTransactionTypes = async (transactions: any[]): Promise<any[]> => {
  const prompt = `Classify transaction categories: ${JSON.stringify(transactions)}`;
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
            properties: { 
              id: { type: Type.STRING }, 
              type: { type: Type.STRING } 
            } 
          } 
        }
      }
    });
    return safeJsonParse(response.text) || [];
  } catch (error) { return []; }
};
