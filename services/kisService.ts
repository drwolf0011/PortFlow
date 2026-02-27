
import { Asset, KisConfig, AssetType } from '../types';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { loadKisToken, saveKisToken } from './storageService';

const BASE_URL_REAL = "https://openapi.koreainvestment.com:9443";
const BASE_URL_VIRTUAL = "https://openapivts.koreainvestment.com:29443";

const PROXY_URL_REAL = "/api/kis/real";
const PROXY_URL_VIRTUAL = "/api/kis/virtual";

export type DataSource = 'KIS_REAL' | 'KIS_VIRTUAL' | 'FALLBACK_MOCK' | 'FAILED';

export interface KisDebugLog {
  url: string;
  method: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body: any;
  response: any;
  status: number;
  timestamp: number;
  env: 'REAL' | 'VIRTUAL';
}

let lastDebugLog: KisDebugLog | null = null;
export const getLastKisDebugLog = () => lastDebugLog;

/**
 * 안전한 API 요청 래퍼 함수 (Hybrid Implementation)
 */
async function request(url: string, options: RequestInit, mockDataFallback: any): Promise<{ data: any, source: DataSource }> {
  const isNative = Capacitor.isNativePlatform();
  
  // Parse query params for logging
  const queryParams: Record<string, string> = {};
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });
  } catch (e) {}

  // 브라우저 환경에서는 로컬 프록시 URL로 변환 (절대 경로 권장)
  let targetUrl = url;
  if (!isNative) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    if (url.startsWith(BASE_URL_REAL)) {
      targetUrl = `${origin}${url.replace(BASE_URL_REAL, PROXY_URL_REAL)}`;
    } else if (url.startsWith(BASE_URL_VIRTUAL)) {
      targetUrl = `${origin}${url.replace(BASE_URL_VIRTUAL, PROXY_URL_VIRTUAL)}`;
    }
  }

  // Debug Log Helper
  const logDebug = (status: number, responseData: any, headers: any, body: any) => {
    // Mask sensitive info
    const maskedHeaders = { ...headers };
    if (maskedHeaders['appkey']) maskedHeaders['appkey'] = maskedHeaders['appkey'].substring(0, 4) + '****';
    if (maskedHeaders['appsecret']) maskedHeaders['appsecret'] = maskedHeaders['appsecret'].substring(0, 4) + '****';
    if (maskedHeaders['authorization']) maskedHeaders['authorization'] = 'Bearer ****';

    lastDebugLog = {
      url,
      method: options.method || 'GET',
      headers: maskedHeaders,
      queryParams,
      body: body,
      response: responseData,
      status,
      timestamp: Date.now(),
      env: url.includes('openapivts') ? 'VIRTUAL' : 'REAL'
    };
  };

  // 재시도 로직을 포함한 실행 함수
  const executeFetch = async (retries = 2): Promise<{ data: any, source: DataSource }> => {
    let lastStatus = 0;
    let lastData = null;
    try {
      const response = await fetch(targetUrl, {
        ...options,
        headers: {
          ...options.headers,
          'Connection': 'keep-alive'
        }
      });
      
      lastStatus = response.status;
      const text = await response.text();
      try {
        lastData = JSON.parse(text);
      } catch (e) {
        lastData = text;
      }

      logDebug(lastStatus, lastData, options.headers, options.body);

      if (!response.ok) {
          if (response.status >= 500 || response.status === 403) {
            console.warn(`[KIS API Error] ${response.status}: ${text.substring(0, 100)}...`);
            // 토큰 발급 요청인 경우 fallback하지 않고 에러를 던짐
            if (targetUrl.includes('/oauth2/tokenP')) {
              throw new Error(`[토큰 발급 실패] ${response.status}: ${text}`);
            }
            return { data: mockDataFallback, source: 'FALLBACK_MOCK' };
          }
          throw new Error(`KIS API Error (${response.status}): ${text}`);
      }
      return { data: lastData, source: url.includes('openapivts') ? 'KIS_VIRTUAL' : 'KIS_REAL' };
    } catch (error: any) {
      if (retries > 0 && error.name !== 'AbortError') {
        console.warn(`[Web Proxy] Fetch failed, retrying... (${retries} left)`, error.message);
        await new Promise(resolve => setTimeout(resolve, 500)); // 0.5초 후 재시도
        return executeFetch(retries - 1);
      }
      console.error("[Web Proxy] Request Failed after retries:", error);
      logDebug(lastStatus || 0, error.message || "Network Error", options.headers, options.body);
      
      if (targetUrl.includes('/oauth2/tokenP')) {
        throw new Error(`[토큰 발급 네트워크 오류] ${error.message}`);
      }
      return { data: mockDataFallback, source: 'FALLBACK_MOCK' };
    }
  };

  // --- [Case 1] Native App Environment (Real API Call) ---
  if (isNative) {
    try {
      // CapacitorHttp는 body가 객체여야 자동으로 JSON 처리됨 (fetch는 문자열)
      let requestData = undefined;
      if (options.body && typeof options.body === 'string') {
        try {
          requestData = JSON.parse(options.body);
        } catch (e) {
          requestData = options.body;
        }
      }

      // Headers 변환 (Headers 객체일 경우 일반 객체로 변환)
      const headers: any = {};
      if (options.headers) {
        if (options.headers instanceof Headers) {
          options.headers.forEach((value, key) => { headers[key] = value; });
        } else if (Array.isArray(options.headers)) {
           options.headers.forEach(([key, value]) => { headers[key] = value; });
        } else {
           Object.assign(headers, options.headers);
        }
      }

      const response = await CapacitorHttp.request({
        method: options.method || 'GET',
        url: url,
        headers: headers,
        data: requestData,
        // 타임아웃 설정 (10초)
        connectTimeout: 10000,
        readTimeout: 10000
      });

      if (response.status >= 400) {
          // 에러 응답인 경우
          const errorMsg = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          throw new Error(`KIS API Error (${response.status}): ${errorMsg}`);
      }

      // CapacitorHttp는 data가 이미 파싱된 객체일 수 있음
      return { 
        data: response.data, 
        source: url.includes('openapivts') ? 'KIS_VIRTUAL' : 'KIS_REAL' 
      };

    } catch (error: any) {
      console.error("[Native HTTP] Request Failed:", error);
      // 네이티브에서도 실패하면 에러를 던져서 상위에서 처리(Gemini Fallback 등)하게 함
      throw error;
    }
  } 
  
  // --- [Case 2] Browser / Web Preview Environment (Fetch with Proxy) ---
  else {
    return executeFetch();
  }
}

// 1. 접근 토큰 발급 (DB 캐싱 적용)
export const getAccessToken = async (appKey: string, appSecret: string, baseUrl: string, supabaseUrl?: string, supabaseKey?: string, userId?: string): Promise<string> => {
  const isVirtual = baseUrl.includes('openapivts');
  
  // 1. DB 캐시 확인
  if (supabaseUrl && supabaseKey && userId) {
    try {
      const cached = await loadKisToken(supabaseUrl, supabaseKey, userId, isVirtual);
      if (cached && cached.token) {
        const expiresAt = new Date(cached.expiresAt).getTime();
        const now = Date.now();
        // 만료 1시간 전이면 재발급 (안전마진)
        if (expiresAt > now + 3600 * 1000) {
          console.log(`[KIS] Using cached ${isVirtual ? 'VIRTUAL' : 'REAL'} token from DB`);
          return cached.token;
        }
      }
    } catch (e) {
      console.warn("[KIS] Failed to load cached token", e);
    }
  }

  const mockResponse = { 
    access_token: "MOCK_ACCESS_TOKEN_FOR_PREVIEW_MODE_" + Date.now(),
    expires_in: 86400 
  };

  const { data } = await request(`${baseUrl}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: appKey,
      appsecret: appSecret
    })
  }, mockResponse);

  const token = data.access_token;
  const expiresIn = data.expires_in || 86400;

  // 2. DB에 토큰 저장
  if (supabaseUrl && supabaseKey && userId && token && !token.startsWith('MOCK')) {
    try {
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      await saveKisToken(supabaseUrl, supabaseKey, userId, token, expiresAt, isVirtual);
      console.log(`[KIS] New ${isVirtual ? 'VIRTUAL' : 'REAL'} token saved to DB`);
    } catch (e) {
      console.warn("[KIS] Failed to save token to DB", e);
    }
  }

  return token;
};

// 2. 국내 주식 현재가 조회
export const getDomesticPrice = async (symbol: string, token: string, appKey: string, appSecret: string, baseUrl: string, isVirtual: boolean = false) => {
  if (!symbol || symbol.length !== 6) {
    console.warn(`Skipping invalid domestic symbol: ${symbol}`);
    return { price: 0, source: isVirtual ? 'KIS_VIRTUAL' : 'KIS_REAL' as DataSource };
  }
  
  // 프리뷰용 랜덤 가격 생성
  const randomPrice = Math.floor(Math.random() * 40000) + 50000;
  const mockResponse = {
    rt_cd: '0',
    msg1: '모의 조회 성공',
    output: { stck_prpr: String(randomPrice) }
  };

  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'authorization': `Bearer ${token}`,
    'appkey': appKey,
    'appsecret': appSecret,
    'trid': 'FHKST01010100',
    'custtype': 'P'
  };

  const { data, source } = await request(`${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${symbol}`, {
    method: 'GET',
    headers
  }, mockResponse);
  
  if (data.rt_cd !== '0') {
    const errorMsg = `[${data.msg_cd || 'NoCode'}] ${data.msg1 || '국내 주식 조회 실패'}`;
    console.error(`[KIS Domestic Price Error]`, data);
    throw new Error(errorMsg);
  }
  return { price: parseInt(data.output.stck_prpr, 10), source };
};

// 3. 해외 주식 현재가 조회
export const getOverseasPrice = async (symbol: string, exchange: string, token: string, appKey: string, appSecret: string, baseUrl: string, isVirtual: boolean = false) => {
  let excd = exchange || 'NAS';
  if (['NASDAQ', '나스닥'].includes(excd)) excd = 'NAS';
  if (['NYSE', '뉴욕'].includes(excd)) excd = 'NYS';
  if (['AMEX', '아멕스'].includes(excd)) excd = 'AMS';

  // 프리뷰용 랜덤 가격 생성
  const randomPrice = (Math.random() * 100 + 100).toFixed(2);
  const mockResponse = {
    rt_cd: '0',
    msg1: '모의 조회 성공',
    output: { last: String(randomPrice) }
  };

  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'authorization': `Bearer ${token}`,
    'appkey': appKey,
    'appsecret': appSecret,
    'trid': 'HHDFS00000300',
    'custtype': 'P'
  };

  const { data, source } = await request(`${baseUrl}/uapi/overseas-price/v1/quotations/price?AUTH=&EXCD=${excd}&SYMB=${symbol}`, {
    method: 'GET',
    headers
  }, mockResponse);

  if (data.rt_cd !== '0') {
    const errorMsg = `[${data.msg_cd || 'NoCode'}] ${data.msg1 || '해외 주식 조회 실패'}`;
    console.error(`[KIS Overseas Price Error]`, data);
    throw new Error(errorMsg);
  }
  return { price: parseFloat(data.output.last), source };
};

// 4. 통합 업데이트 함수
export const updateAssetsWithKis = async (
  assets: Asset[], 
  config: KisConfig, 
  onProgress?: (current: number, total: number) => void,
  supabaseUrl?: string,
  supabaseKey?: string,
  userId?: string
): Promise<{ updatedAssets: Asset[]; exchangeRate?: number; dataSource: DataSource }> => {
  const isVirtual = config.serverType === 'VIRTUAL';
  const baseUrl = isVirtual ? BASE_URL_VIRTUAL : BASE_URL_REAL;
  const token = await getAccessToken(config.appKey, config.appSecret, baseUrl, supabaseUrl, supabaseKey, userId);
  
  const updatedAssets = [...assets];
  let finalSource: DataSource = isVirtual ? 'KIS_VIRTUAL' : 'KIS_REAL';
  
  const targetAssets = updatedAssets.filter(a => a.type !== AssetType.CASH && a.ticker);
  const total = targetAssets.length;
  let processed = 0;

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  for (const asset of updatedAssets) {
    if (asset.type === AssetType.CASH || !asset.ticker) continue;

    // KIS API TPS 제한을 고려하여 요청 간 100ms 지연 추가
    if (processed > 0) await sleep(100);

    try {
      let result;
      if (asset.currency === 'KRW') {
        if (asset.ticker.length !== 6) continue;
        result = await getDomesticPrice(asset.ticker, token, config.appKey, config.appSecret, baseUrl, isVirtual);
      } else {
        result = await getOverseasPrice(asset.ticker, asset.exchange || 'NAS', token, config.appKey, config.appSecret, baseUrl, isVirtual);
      }
      
      if (result && result.price > 0) {
        asset.currentPrice = result.price;
        finalSource = result.source;
      }
    } catch (e) {
      console.error(`KIS Update Failed for ${asset.name}:`, e);
    } finally {
      processed++;
      if (onProgress) onProgress(processed, total);
    }
  }
  
  return { updatedAssets, exchangeRate: undefined, dataSource: finalSource };
};
