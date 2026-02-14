
import { Asset, KisConfig, AssetType } from '../types';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

const BASE_URL_REAL = "https://openapi.koreainvestment.com:9443";
// const BASE_URL_VIRTUAL = "https://openapivts.koreainvestment.com:29443";
const BASE_URL_VIRTUAL = "http://localhost:3000"; // 내 PC에서 돌고 있는 프록시로 전송

export type DataSource = 'KIS_REAL' | 'KIS_VIRTUAL' | 'FALLBACK_MOCK' | 'FAILED';

/**
 * 안전한 API 요청 래퍼 함수 (Hybrid Implementation)
 * 1. Native App: CapacitorHttp를 사용하여 CORS 우회 및 실제 통신
 * 2. Browser/Preview: fetch를 사용하되 CORS 에러 시 Mock 데이터 반환
 */
async function request(url: string, options: RequestInit, mockDataFallback: any): Promise<{ data: any, source: DataSource }> {
  const isNative = Capacitor.isNativePlatform();

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
  
  // --- [Case 2] Browser / Web Preview Environment (Fetch with Mock Fallback) ---
  else {
    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`KIS API Error (${response.status}): ${errorText}`);
      }
      const json = await response.json();
      return { data: json, source: url.includes('openapivts') ? 'KIS_VIRTUAL' : 'KIS_REAL' };
    } catch (error: any) {
      // CORS 또는 네트워크 오류 감지
      const isNetworkError = error.message && (
        error.message.includes('Failed to fetch') || 
        error.message.includes('NetworkError') ||
        error.name === 'TypeError' // fetch CORS errors are often TypeErrors
      );
      
      if (isNetworkError) {
         console.warn(`[CORS/Preview] 브라우저 환경 제약으로 인해 API 호출이 차단되었습니다. 개발용 가상 데이터(Mock)를 반환합니다.\nTarget: ${url}`);
         return { data: mockDataFallback, source: 'FALLBACK_MOCK' };
      }
      throw error;
    }
  }
}

// 1. 접근 토큰 발급
export const getAccessToken = async (appKey: string, appSecret: string, baseUrl: string): Promise<string> => {
  const mockResponse = { 
    access_token: "MOCK_ACCESS_TOKEN_FOR_PREVIEW_MODE_" + Date.now(),
    expires_in: 86400 
  };

  const { data } = await request(`${baseUrl}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: appKey,
      appsecret: appSecret
    })
  }, mockResponse);

  return data.access_token;
};

// 2. 국내 주식 현재가 조회
export const getDomesticPrice = async (symbol: string, token: string, appKey: string, appSecret: string, baseUrl: string) => {
  if (!symbol || symbol.length !== 6) throw new Error(`Invalid Domestic Symbol: ${symbol}`);
  
  // 프리뷰용 랜덤 가격 생성
  const randomPrice = Math.floor(Math.random() * 40000) + 50000;
  const mockResponse = {
    rt_cd: '0',
    msg1: '모의 조회 성공',
    output: { stck_prpr: String(randomPrice) }
  };

  const headers = {
    'Content-Type': 'application/json',
    'authorization': `Bearer ${token}`,
    'appkey': appKey,
    'appsecret': appSecret,
    'tr_id': 'FHKST01010100'
  };

  const { data, source } = await request(`${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price?fid_cond_mrkt_div_code=J&fid_input_iscd=${symbol}`, {
    method: 'GET',
    headers
  }, mockResponse);
  
  if (data.rt_cd !== '0') throw new Error(data.msg1 || '국내 주식 조회 실패');
  return { price: parseInt(data.output.stck_prpr, 10), source };
};

// 3. 해외 주식 현재가 조회
export const getOverseasPrice = async (symbol: string, exchange: string, token: string, appKey: string, appSecret: string, baseUrl: string) => {
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
    'Content-Type': 'application/json',
    'authorization': `Bearer ${token}`,
    'appkey': appKey,
    'appsecret': appSecret,
    'tr_id': 'HHDFS00000300'
  };

  const { data, source } = await request(`${baseUrl}/uapi/overseas-price/v1/quotations/price?AUTH=&EXCD=${excd}&SYMB=${symbol}`, {
    method: 'GET',
    headers
  }, mockResponse);

  if (data.rt_cd !== '0') throw new Error(data.msg1 || '해외 주식 조회 실패');
  return { price: parseFloat(data.output.last), source };
};

// 4. 통합 업데이트 함수
export const updateAssetsWithKis = async (assets: Asset[], config: KisConfig): Promise<{ updatedAssets: Asset[]; exchangeRate?: number; dataSource: DataSource }> => {
  const baseUrl = config.serverType === 'VIRTUAL' ? BASE_URL_VIRTUAL : BASE_URL_REAL;
  const token = await getAccessToken(config.appKey, config.appSecret, baseUrl);
  
  const updatedAssets = [...assets];
  let finalSource: DataSource = 'KIS_REAL';
  
  const promises = updatedAssets.map(async (asset) => {
    if (asset.type === AssetType.CASH || !asset.ticker) return;

    try {
      let result;
      if (asset.currency === 'KRW') {
        result = await getDomesticPrice(asset.ticker, token, config.appKey, config.appSecret, baseUrl);
      } else {
        result = await getOverseasPrice(asset.ticker, asset.exchange || 'NAS', token, config.appKey, config.appSecret, baseUrl);
      }
      
      if (result.price > 0) {
        asset.currentPrice = result.price;
        finalSource = result.source;
      }
    } catch (e) {
      console.error(`KIS Update Failed for ${asset.name}:`, e);
    }
  });

  await Promise.all(promises);
  
  return { updatedAssets, exchangeRate: undefined, dataSource: finalSource };
};
