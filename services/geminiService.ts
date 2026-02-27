
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
  fetchedCount: number; // 실제 API 조회를 요청한 고유 종목 수
}

interface CachedPrice {
  price: number;
  timestamp: number;
}
const PRICE_CACHE = new Map<string, CachedPrice>();
const CACHE_TTL = 30 * 60 * 1000; // 30분 캐시

// 로컬 스토리지에서 캐시 불러오기
const loadCacheFromStorage = () => {
  try {
    const stored = localStorage.getItem('PRICE_CACHE');
    if (stored) {
      const parsed = JSON.parse(stored);
      Object.entries(parsed).forEach(([key, value]) => {
        PRICE_CACHE.set(key, value as CachedPrice);
      });
    }
  } catch (e) {
    console.warn('Failed to load price cache from storage', e);
  }
};
loadCacheFromStorage();

const saveCacheToStorage = () => {
  try {
    const obj = Object.fromEntries(PRICE_CACHE.entries());
    localStorage.setItem('PRICE_CACHE', JSON.stringify(obj));
  } catch (e) {
    console.warn('Failed to save price cache to storage', e);
  }
};

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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      try {
        return await ai.models.generateContent(params);
      } catch (error: any) {
        lastError = error;
        const status = error.status || error.code || 0;
        if (status === 429 || status === 500 || status === 503 || error.message?.includes('xhr') || error.message?.includes('quota')) {
          const waitTime = (5000 * Math.pow(2.2, i)) + (Math.random() * 2000);
          console.warn(`[Gemini API] Request failed (${status}). Retrying in ${Math.round(waitTime/1000)}s...`);
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

export const getMarketBriefing = async (): Promise<string> => {
  const prompt = `Provide a concise 3-line market briefing in Korean. Include latest S&P 500, KOSPI, and KRW/USD exchange rate trends. No emojis.`;
  try {
    const response = await generateContentWithRetry({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });
    return response.text || "시황 정보를 가져올 수 없습니다.";
  } catch (error) {
    return "현재 시장 정보를 불러오는 중 오류가 발생했습니다.";
  }
};

/**
 * 효율적인 시세 조회를 위해 중복을 제거하고 Ticker 우선 조회를 수행합니다.
 */
export const updateAssetPrices = async (assets: Asset[], onProgress?: (current: number, total: number) => void): Promise<PriceUpdateResult> => {
  const now = Date.now();
  const allUpdatedPrices: Record<string, number> = {};
  let latestExchangeRate: number | undefined;
  
  // Unique Query Map: Ticker가 있으면 Ticker를, 없으면 Name을 키로 사용
  const uniqueItemsMap = new Map<string, { ticker?: string; name: string; currency: string }>();
  
  assets.forEach(asset => {
    if (asset.type === AssetType.CASH) return;
    
    // Ticker가 있으면 Ticker가 메인 키, 없으면 Name이 메인 키
    const queryKey = asset.ticker ? asset.ticker : asset.name;
    const mapKey = `${queryKey}_${asset.currency}`;
    
    const cached = PRICE_CACHE.get(mapKey);
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      allUpdatedPrices[mapKey] = cached.price;
    } else if (!uniqueItemsMap.has(mapKey)) {
      uniqueItemsMap.set(mapKey, { 
        ticker: asset.ticker, 
        name: asset.name, 
        currency: asset.currency 
      });
    }
  });

  const needUpdate = Array.from(uniqueItemsMap.entries());
  let totalFetchedItems = 0;
  
  // 전체 대상 자산 개수 (현금 제외)
  const totalAssetsToUpdate = assets.filter(a => a.type !== AssetType.CASH).length;

  if (needUpdate.length > 0) {
    totalFetchedItems = needUpdate.length;
    const itemChunks = [];
    for (let i = 0; i < needUpdate.length; i += 20) {
      itemChunks.push(needUpdate.slice(i, i + 20));
    }

    let processed = 0;
    for (const chunk of itemChunks) {
      const chunkData = chunk.map(([mapKey, info]) => ({ 
        mapKey, 
        ticker: info.ticker, 
        name: info.name, 
        currency: info.currency 
      }));
      
      const prompt = `Find current market prices for these assets and the USD/KRW exchange rate. Use ticker if available.
      Input: ${JSON.stringify(chunkData)}
      Return ONLY valid JSON with "prices" array containing {mapKey, price} and an "exchangeRate" number.`;
      
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
                      mapKey: { type: Type.STRING }, 
                      price: { type: Type.NUMBER } 
                    }, 
                    required: ["mapKey", "price"] 
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
            allUpdatedPrices[p.mapKey] = p.price;
            PRICE_CACHE.set(p.mapKey, { price: p.price, timestamp: now });
          });
          saveCacheToStorage();
        }
        if (parsed?.exchangeRate) {
          latestExchangeRate = parsed.exchangeRate;
        }
      } catch (error) {
        console.error("Price update failed for chunk:", error);
      } finally {
        processed += chunk.length;
        if (onProgress) {
          // 고유 종목 처리 비율을 전체 자산 개수에 비례하여 계산
          const processedRatio = processed / totalFetchedItems;
          const currentAssetsProcessed = Math.floor(totalAssetsToUpdate * processedRatio);
          onProgress(currentAssetsProcessed, totalAssetsToUpdate);
        }
      }
    }
  } else {
    // 모든 항목이 캐시된 경우 바로 100% 완료 처리
    if (onProgress) onProgress(totalAssetsToUpdate, totalAssetsToUpdate);
  }

  // 매핑 로직: Ticker로 먼저 찾고, 없으면 Name으로 찾음 (User의 요청사항 반영)
  const updatedAssets = assets.map(asset => {
    if (asset.type === AssetType.CASH) return asset;
    
    let foundPrice: number | undefined;
    
    // 1순위: Ticker 기반 매칭
    if (asset.ticker) {
      foundPrice = allUpdatedPrices[`${asset.ticker}_${asset.currency}`];
    }
    
    // 2순위: Ticker 결과가 없거나 Ticker가 원래 없는 경우 Name 기반 매칭
    if (foundPrice === undefined) {
      foundPrice = allUpdatedPrices[`${asset.name}_${asset.currency}`];
    }
    
    return foundPrice !== undefined ? { ...asset, currentPrice: foundPrice } : asset;
  });

  return { updatedAssets, exchangeRate: latestExchangeRate, fetchedCount: totalAssetsToUpdate };
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
  const assetSummary = assets.map(a => {
    const mult = a.currency === 'USD' ? exchangeRate : 1;
    const currentVal = a.currentPrice * a.quantity * mult;
    const purchaseUnitKRW = a.purchasePriceKRW || (a.purchasePrice * mult);
    const totalCost = purchaseUnitKRW * a.quantity;
    
    let profitRate = 0;
    if (totalCost > 0) {
      profitRate = ((currentVal - totalCost) / totalCost) * 100;
    }

    const profitStr = `(수익률: ${profitRate > 0 ? '+' : ''}${profitRate.toFixed(1)}%)`;
    
    return `- [${a.managementType || '일반'}] ${a.institution} | ${a.type} | ${a.name}: ${a.quantity}주, 평가액 ${Math.floor(currentVal).toLocaleString()}원 ${profitStr}`;
  }).join('\n');

  const prompt = `
    대한민국 상위 1%를 담당하는 워런버핏 스타일의 짐사이먼스같은 냉철한 자산관리 전문가(PB)로서 아래 포트폴리오를 정밀 진단하십시오.
    단순한 칭찬보다는 **개선점, 리스크, 비효율성**을 찾아내는 데 집중하십시오.

    ${userProfile?.goalPrompt ? `[사용자 투자 원칙]: ${userProfile.goalPrompt}` : ""}
    
    [자산 포트폴리오 현황 (수익률 포함)]:
    ${assetSummary}
    
    [필수 선행 분석 (시장 상황 파악)]:
    본격적인 진단에 앞서 제공된 **googleSearch** 도구를 사용하여 다음 정보를 반드시 먼저 파악하십시오:
    1. **미국 증시 (S&P500, NASDAQ)**: 최근 1주일간의 등락 추세와 주요 이슈.
    2. **한국 증시 (KOSPI, KOSDAQ)**: 최근 1주일간의 시장 분위기와 외국인/기관 수급 동향.
    3. **시장 국면**: 현재가 '상승장', '하락장', '횡보장' 중 어디에 해당하는지 정의하십시오.

    [중점 분석 요구사항]:
    1. **시장 상황과 개별 자산의 연동성 분석 (핵심)**:
       - 파악된 '시장 상황'과 개별 자산의 '현재 수익률'을 연계하여 분석하십시오.
       - 예: "시장 하락세에도 수익률이 방어되고 있는 종목은 유지를, 시장 상승 대비 소외되어 손실 중인 종목은 교체를 권고"하는 식의 구체적 판단을 내리십시오.
    2. **계좌별 규제 및 효율성**: IRP/DC형 계좌 내 위험자산 한도(70%) 준수 여부와 ISA 계좌의 절세 활용도가 떨어지는 자산(예: 채권형을 일반계좌에 보유 등)을 지적하십시오.
    3. **리스크 분석**: 특정 섹터나 종목에 자산이 20% 이상 집중되어 있다면 강력히 경고하십시오.
    4. **현금 비중**: 현금성 자산이 너무 많거나 적으면 지적하십시오.
    
    [언어 요구사항]:
    모든 분석 결과와 시장 상황 요약은 **반드시 한국어**로 작성되어야 합니다.

    [가독성 및 포맷팅 지침 (중요)]:
    - **이모지 사용 금지**: 전문성을 위해 이모지는 절대 사용하지 마십시오.
    - **구조화된 출력**: 긴 문단 대신 **소제목(###)**과 **글머리 기호(-)**를 사용하여 내용을 명확히 구분하십시오.
    - **강조**: 중요한 숫자, 자산명, 핵심 경고 문구는 **볼드체**로 처리하십시오.
    - **섹션 구성 예시**:
      ### 시장 상황 요약 (최근 1주)
      - (미국/한국 증시 요약 및 국면 판단)
      ### 핵심 리스크 진단
      - (내용...)
      ### 계좌 효율성 및 절세 분석
      - (내용...)
      ### 포트폴리오 재조정 제언 (시장 상황 반영)
      - (내용...)

    [출력 형식]:
    - JSON { "currentDiagnosis": "...", "marketConditions": "..." }
    - 'currentDiagnosis': 위 포맷팅 지침을 준수한 마크다운 형식의 상세 진단 내용.
    - 'marketConditions': 위에서 파악한 시장 상황 요약 텍스트.
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
    `- [${a.managementType || '일반'}] ${a.name}(${a.ticker || 'N/A'}): ${a.quantity}주 보유, 현재가 ${a.currency === 'KRW' ? Math.floor(a.currentPrice) : a.currentPrice} ${a.currency} (${a.institution})`
  ).join('\n');

  const prompt = `
    당신은 **매우 적극적이고 실행 중심적인** 수석 포트폴리오 매니저입니다. 
    단순히 '관망'하는 것은 고객의 자산 증식에 도움이 되지 않는다고 믿습니다.
    앞서 수행된 [진단 결과]를 바탕으로, 즉시 실행 가능한 리밸런싱 매매 전략을 수립하십시오.
    
    [진단 결과]: "${diagnosis}"
    [사용자 목표]: ${userProfile?.investmentGoal || "적극적인 자산 증식"}
    [보유 자산]: ${rawAssetData}
    [시장 데이터]:
    - 현재 적용 환율: 1 USD = ${exchangeRate} KRW

    [계산 지침]:
    - USD 자산의 매수/매도 금액(\`totalAmount\`) 산출 시, 반드시 위 [시장 데이터]의 환율을 적용하여 원화(KRW)로 환산하십시오.

    [강력한 실행 지침 (Critical)]:
    1. **적극적 매매 제안**: 모든 항목을 '관망(HOLD)'으로 채우지 마십시오. 포트폴리오 수익률과 안정성을 높이기 위해 반드시 **'매수(BUY)' 또는 '매도(SELL)'** 액션을 포함해야 합니다.
    2. **과감한 교체**: 성과가 저조하거나 계좌 성격(ISA, IRP 등)에 맞지 않는 자산은 과감히 'SELL'을 제안하고, 그 자금으로 더 나은 대안을 'BUY' 하도록 제안하십시오.
    3. **신규 종목 발굴**: 현재 보유 자산 리스트에 없더라도, 포트폴리오에 필요한 종목(예: S&P500 ETF, 국채, 배당주 등)이 있다면 구체적인 종목명으로 **신규 'BUY'**를 제안하십시오.
    4. **비중 조절**: 특정 종목 비중이 너무 높으면 일부 'SELL', 너무 낮으면 추가 'BUY'를 제안하십시오.

    [계좌별 최적화 가이드]:
    - **IRP/DC**: 위험자산 70% 초과시 매도, 안전자산(TDF/채권ETF) 신규 매수.
    - **ISA**: 배당주, 리츠, 해외지수추종 ETF(국내상장) 적극 매수 권장.

    [언어 요구사항]:
    전략 이름, 설명, 리스크 수준, 근거, 그리고 각 실행 아이템의 이유 등 **모든 텍스트 필드는 반드시 한국어**로 작성하십시오.

    [JSON 응답 스키마]:
    - executionGroups: 계좌/기관별 그룹화.
    - items.action: 반드시 'BUY', 'SELL', 'HOLD' 중 하나여야 함.
    - items.reason: 왜 이 매매를 해야 하는지 구체적인 근거 제시 (한국어).
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
  const prompt = `Search for 5 investment assets related to "${query}" and return info as JSON. Include the market/exchange name (e.g., NASDAQ, NYSE, KRX).`;
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
              type: { type: Type.STRING },
              market: { type: Type.STRING }
            } 
          } 
        }
      }
    });
    const results = (safeJsonParse(response.text) || []) as any[];
    return results.map(item => {
      let normalizedType = AssetType.STOCK; 
      const t = item.type ? item.type.toUpperCase() : '';
      if (t.includes('ETF')) normalizedType = AssetType.ETF;
      else if (t.includes('FUND')) normalizedType = AssetType.FUND;
      else if (t.includes('GOLD')) normalizedType = AssetType.GOLD;
      else if (t.includes('CASH')) normalizedType = AssetType.CASH;
      else if (t.includes('BOND') || t.includes('채권')) normalizedType = AssetType.BOND;
      
      return { ...item, type: normalizedType } as StockInfo;
    });
  } catch (error) { return []; }
};

export const getStockDeepDive = async (query: string): Promise<{ text: string, sources: { title: string; uri: string }[] }> => {
  const prompt = `Write a comprehensive deep-dive investment analysis report for "${query}" in Korean (Markdown format). Focus on recent performance, future outlook, and key risks.`;
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

export const enrichAssetData = async (
  assets: Asset[],
  onProgress?: (processedCount: number, totalCount: number, updatedChunk: Asset[]) => Promise<void>
): Promise<Asset[]> => {
  const targets = assets.filter(a => 
    !a.ticker || a.ticker.trim() === '' || 
    (a.currency === 'USD' && (!a.exchange || a.exchange.trim() === ''))
  );
  if (targets.length === 0) return assets;

  const assetMap = new Map(assets.map(a => [a.id, a]));
  const totalTargets = targets.length;
  let processedCount = 0;
  
  const chunkSize = 5;
  for (let i = 0; i < totalTargets; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize);
    const simplifiedInput = chunk.map(a => ({
      id: a.id,
      name: a.name,
      currency: a.currency
    }));

    const prompt = `
      Identify the Ticker Symbol and Exchange Code for these assets.
      - South Korean stocks: Ticker is 6 digits. Exchange is usually 'KRX' or omitted.
      - US stocks: Ticker (e.g. AAPL). Exchange must be one of: 'NAS' (Nasdaq), 'NYS' (NYSE), 'AMS' (Amex).
      - If unsure, leave blank.
      
      Input: ${JSON.stringify(simplifiedInput)}
    `;

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
                id: { type: Type.STRING },
                ticker: { type: Type.STRING },
                exchange: { type: Type.STRING }
              }
            }
          }
        }
      });
      
      const results = safeJsonParse(response.text) as any[];
      const updatedChunk: Asset[] = [];

      if (results) {
         results.forEach(res => {
            const original = assetMap.get(res.id);
            if (original) {
               let modified = false;
               if (res.ticker) { original.ticker = res.ticker; modified = true; }
               if (res.exchange) { original.exchange = res.exchange; modified = true; }
               if (modified) updatedChunk.push(original);
            }
         });
      }
      
      processedCount += Math.min(chunk.length, totalTargets - processedCount);
      if (onProgress) {
        await onProgress(processedCount, totalTargets, updatedChunk);
      }

    } catch (e) {
      console.warn("Enrichment chunk failed", e);
    }
  }

  return Array.from(assetMap.values());
};
