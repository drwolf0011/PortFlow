
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
const CACHE_TTL = 30 * 60 * 1000; // 캐시 유효 시간을 30분으로 연장

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
  // 무료 티어 안전을 위해 동시 실행을 1개로 제한
  private maxConcurrency = 1; 
  private lastRequestTime = 0;
  // 요청 간 최소 간격을 2초로 늘려 안전성 확보
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

export const globalRequestQueue = new RequestQueue();

async function generateContentWithRetry(params: any, useQueue = true): Promise<GenerateContentResponse> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const apiCall = async () => {
    let lastError;
    const maxRetries = 1; // 사용자의 요청에 따라 재시도 횟수를 1회로 변경
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await ai.models.generateContent(params);
      } catch (error: any) {
        lastError = error;
        // 429(Quota Exceeded) 에러 대응
        const status = error.status || error.code || (error.message?.includes('429') ? 429 : 0);
        
        if (status === 429 || error.message?.includes('quota')) {
          // 지수 백오프: 5초, 10초, 20초, 40초... 점진적으로 대기 시간 증가
          const waitTime = (5000 * Math.pow(2, i)) + (Math.random() * 2000);
          console.warn(`Gemini API Quota Exceeded. Retrying in ${Math.round(waitTime/1000)}s... (Attempt ${i+1}/${maxRetries})`);
          await delay(waitTime);
          continue;
        }
        throw error;
      }
    }
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
    // 한 번에 최대 15개까지 묶어서 호출 (호출 횟수 최소화)
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
          model: 'gemini-3-flash-preview', // 가격 업데이트는 비용이 저렴한 Flash 모델 사용
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
    1. 'goal': 사용자의 정보를 관통하는 핵심 투자 목표를 10자 내외의 한국어 구절로 작성하십시오 (예: 노후 대비 안정 성장형).
    2. 'prompt': AI가 향후 이 사용자의 포트폴리오를 진단할 때 기준점으로 삼을 수 있는 구체적인 가이드라인을 작성하십시오. 특히 '추가 요청 사항'이 있다면 이를 최우선적으로 반영하여 지침을 구체화하십시오.
    
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
    return { goal: "목표 설정 필요", prompt: "기본 전략을 적용합니다." }; 
  }
};

export const getAIDiagnosis = async (
  assets: Asset[], 
  accounts: Account[], 
  exchangeRate: number,
  userProfile: UserProfile | null
): Promise<DiagnosisResponse> => {
  const assetSummary = assets.map(a => `${a.institution} | ${a.type} | ${a.name}: ${a.quantity}주, 평가액 ${(a.currentPrice * a.quantity * (a.currency === 'USD' ? exchangeRate : 1)).toLocaleString()}원`).join('\n');
  const prompt = `
    대한민국 상위 1%를 담당하는 자산관리 전문가(PB)로서 아래 포트폴리오를 정밀 진단하십시오.
    이 진단은 후속 리밸런싱 전략의 기초 데이터로 사용됩니다.

    ${userProfile?.goalPrompt ? `[사용자 투자 원칙 및 요청 사항]: ${userProfile.goalPrompt}` : ""}
    
    [자산 포트폴리오 현황]:
    ${assetSummary}
    
    [분석 요구사항]:
    1. 자산 배분 상태, 특정 종목/섹터 편중 리스크, 환율 노출도 등을 팩트 기반으로 분석하십시오.
    2. 현재 포트폴리오의 가장 치명적인 약점이나 개선이 시급한 '핵심 문제점'을 구체적으로 지적하십시오.
    3. 최근 글로벌 거시 경제 및 시장 상황과 연결하여 이 포트폴리오의 취약점을 설명하십시오.
    
    [출력 형식]:
    - JSON { "currentDiagnosis": "...", "marketConditions": "..." }
    - 'currentDiagnosis': 마크다운 형식. 핵심 문제점과 진단 내용을 한국어로 상세히 서술.
    - 'marketConditions': 현재 시장 상황 요약 (한국어).
  `;

  try {
    const response = await generateContentWithRetry({
      model: 'gemini-3-pro-preview', // 진단은 고성능 Pro 모델 사용
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
    const sources: { title: string; uri: string }[] = [];
    response.candidates?.[0]?.groundingMetadata?.groundingChunks?.forEach((c: any) => { 
      if (c.web) sources.push({ title: c.web.title, uri: c.web.uri }); 
    });
    return { 
      currentDiagnosis: parsed?.currentDiagnosis || "진단 생성 실패",
      marketConditions: parsed?.marketConditions || "정보 없음",
      sources 
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
    `- ${a.name}(${a.ticker || 'N/A'}): ${a.quantity}주 보유, 평단 ${a.purchasePrice} ${a.currency}, 현재가 ${a.currentPrice} ${a.currency} (${a.institution})`
  ).join('\n');

  const prompt = `
    당신은 수석 자산관리 전문가(PB)입니다. 
    앞서 수행된 [1단계 진단 결과]를 해결하기 위한 [2단계 리밸런싱 전략]을 수립하고, 이를 실행할 [3단계 구체적 매매 계획]을 작성하십시오.
    
    [1단계: 진단 결과 참조]
    "${diagnosis}"
    
    [사용자 프로필]
    투자 목표: ${userProfile?.investmentGoal || "자산 증식 및 리스크 관리"}
    ${userProfile?.goalPrompt ? `세부 지침 및 요청 사항: ${userProfile.goalPrompt}` : ""}

    [보유 자산 데이터]
    ${rawAssetData}
    환율: 1 USD = ${exchangeRate} KRW

    [작업 지시사항]:
    1. **일관성 필수 (Consistency Check)**: 
       - 상단의 전략 설명(description)과 하단의 구체적 실행 계획(executionGroups)은 완벽히 일치해야 합니다. 설명에는 "매도"한다고 하고 계획에 없으면 안 됩니다.
    2. **데이터 무결성 (Integrity)**:
       - **매도(SELL)**: 반드시 [보유 자산 데이터]에 존재하는 종목만 매도할 수 있습니다. (없는 종목 매도 금지)
       - **매수(BUY)**: 진단된 문제(예: 특정 섹터 부족)를 해결하는 구체적 종목(ETF 포함)을 제안하십시오.
       - 수량 및 금액 계산: 수량 * 현재가 = 총액.
    3. **연결성**: 각 실행 아이템(매수/매도)의 'reason' 필드에, 이것이 진단 결과의 어떤 문제를 해결하기 위함인지 한국어로 명확히 적으십시오.

    [JSON 응답 스키마 준수 (한국어 작성)]:
    - name: 전략 이름 (예: 리스크 분산형 성장 전략)
    - description: 전략 개요 (한국어)
    - rationale: 이 전략을 선택한 논리적 이유
    - executionGroups: 계좌별 실행 그룹 리스트
  `;

  try {
    const response = await generateContentWithRetry({
      model: 'gemini-3-pro-preview', 
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        // CRITICAL FIX: Increased maxOutputTokens to 8192 to prevent JSON truncation
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 1024 },
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
    const sources: { title: string; uri: string }[] = [];
    response.candidates?.[0]?.groundingMetadata?.groundingChunks?.forEach((c: any) => { 
      if (c.web) sources.push({ title: c.web.title, uri: c.web.uri }); 
    });
    return { text: response.text || "분석 불가", sources };
  } catch (error) { return { text: "분석 중 오류 발생", sources: [] }; }
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

export const getAssetHistory = async (ticker: string, name: string): Promise<{ date: string, price: number }[]> => {
  const prompt = `Return daily closing prices for the last 30 days for "${ticker || name}" as JSON.`;
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
  } catch (error) { return []; }
};
