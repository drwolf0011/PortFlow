
import { AppData, UserProfile, UsersRegistry } from '../types';

const BIN_URL = 'https://api.jsonbin.io/v3/b';
const USERS_REGISTRY_BIN_ID = '6978542e43b1c97be94da269';

export class CloudAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudAuthError";
  }
}

// Helper to handle response and throw typed errors
const handleResponse = async (response: Response, defaultMessage: string) => {
  if (!response.ok) {
    let errorDetail = "";
    try {
      // Try to parse server error message (e.g. "Bin size limit exceeded" or "Daily request limit reached")
      const errorData = await response.json();
      if (errorData && errorData.message) {
        errorDetail = errorData.message;
      }
    } catch (e) {
      // Ignore JSON parse errors if response is not JSON
    }

    // 413: Payload Too Large (Explicit size limit error)
    if (response.status === 413) {
      throw new Error(`데이터 용량 초과 (413): ${errorDetail || "저장할 데이터가 너무 큽니다. 불필요한 데이터를 정리하거나 플랜을 확인해주세요."}`);
    }

    // 403: Forbidden (Can be Auth issue, or Quota/Size limit on some platforms)
    if (response.status === 403) {
       // If we have a specific message from server, show it. Otherwise generic.
       if (errorDetail.toLowerCase().includes("size") || errorDetail.toLowerCase().includes("limit")) {
          throw new Error(`저장 한도 초과 (403): ${errorDetail}`);
       }
       throw new CloudAuthError(`접근 거부 (403): ${errorDetail || "권한이 없거나 저장 용량이 초과되었습니다."}`);
    }

    // 401: Unauthorized (Wrong Key)
    if (response.status === 401) {
      throw new CloudAuthError("인증 실패 (401): API Key가 올바르지 않습니다.");
    }

    if (response.status === 404) {
      throw new Error("저장 공간(Bin)을 찾을 수 없습니다.");
    }

    throw new Error(errorDetail || `${defaultMessage} (${response.status})`);
  }
  return response.json();
};

// Robust fetcher that tries X-Master-Key first, then falls back to X-Access-Key
const fetchWithAuth = async (url: string, method: string, apiKey: string, body?: any, extraHeaders?: Record<string, string>) => {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  const bodyString = body ? JSON.stringify(body) : undefined;

  // 1. Try with X-Master-Key
  const res1 = await fetch(url, {
    method,
    headers: { ...headers, 'X-Master-Key': apiKey },
    body: bodyString
  });

  // If success, or if the error is NOT 401 (Unauthorized), return immediately.
  // We do NOT retry on 403 (Forbidden) because 403 usually means the key is valid but the action is denied 
  // (e.g., Quota Exceeded, Size Limit, Read-Only), so retrying with a different header won't help and might mask the real error.
  if (res1.ok || res1.status !== 401) {
    return res1;
  }

  // 2. Retry with X-Access-Key only if the first attempt was strictly 401 (Invalid Key)
  // This handles cases where users provide an Access Key in the "Master Key" field
  const res2 = await fetch(url, {
    method,
    headers: { ...headers, 'X-Access-Key': apiKey },
    body: bodyString
  });

  return res2;
};

// 중앙 사용자 디렉토리 가져오기
export const fetchUsersRegistry = async (apiKey: string): Promise<UsersRegistry> => {
  try {
    const response = await fetchWithAuth(`${BIN_URL}/${USERS_REGISTRY_BIN_ID}`, 'GET', apiKey, undefined, { 'X-Bin-Meta': 'false' });
    const data = await handleResponse(response, '사용자 목록 로드 실패');
    return data as UsersRegistry;
  } catch (error) {
    if (error instanceof CloudAuthError) throw error;
    return { users: [] };
  }
};

// 중앙 사용자 디렉토리 업데이트
export const updateUsersRegistry = async (apiKey: string, registry: UsersRegistry): Promise<void> => {
  // Versioning disabled to prevent history bloat on registry
  const response = await fetchWithAuth(`${BIN_URL}/${USERS_REGISTRY_BIN_ID}`, 'PUT', apiKey, registry, { 'X-Bin-Versioning': 'false' });
  await handleResponse(response, '사용자 정보 업데이트 실패');
};

export const createBin = async (apiKey: string, data: any): Promise<string> => {
  const response = await fetchWithAuth(BIN_URL, 'POST', apiKey, data, {
    'X-Bin-Private': 'true',
    'X-Bin-Name': `PortFlow_Data_${Date.now()}`
  });
  const result = await handleResponse(response, '데이터 저장소 생성 실패');
  return result.metadata ? result.metadata.id : result.id;
};

export const updateBin = async (apiKey: string, binId: string, data: AppData): Promise<void> => {
  if (!apiKey || !binId) return;
  // Note: Removed 'X-Bin-Versioning': 'false' to avoid permission issues if key doesn't support version control
  const response = await fetchWithAuth(`${BIN_URL}/${binId}`, 'PUT', apiKey, data);
  await handleResponse(response, '클라우드 업데이트 실패');
};

export const readBin = async (apiKey: string, binId: string): Promise<AppData> => {
  const response = await fetchWithAuth(`${BIN_URL}/${binId}`, 'GET', apiKey, undefined, { 'X-Bin-Meta': 'false' });
  const data = await handleResponse(response, '데이터 불러오기 실패');
  return data as AppData;
};
