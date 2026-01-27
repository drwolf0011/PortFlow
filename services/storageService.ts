
import { AppData, UserProfile, UsersRegistry } from '../types';

const BIN_URL = 'https://api.jsonbin.io/v3/b';
const USERS_REGISTRY_BIN_ID = '6978542e43b1c97be94da269';

const handleResponse = async (response: Response, defaultMessage: string) => {
  if (!response.ok) {
    let errorMessage = defaultMessage;
    if (response.status === 401 || response.status === 403) {
      throw new Error("클라우드 인증 권한이 없습니다.");
    }
    if (response.status === 404) {
      throw new Error("저장 공간을 찾을 수 없습니다.");
    }
    try {
      const errorData = await response.json();
      if (errorData && errorData.message) errorMessage = errorData.message;
    } catch (e) {
      errorMessage = `${defaultMessage} (${response.status})`;
    }
    throw new Error(errorMessage);
  }
  return response.json();
};

// 중앙 사용자 디렉토리 가져오기
export const fetchUsersRegistry = async (apiKey: string): Promise<UsersRegistry> => {
  try {
    const response = await fetch(`${BIN_URL}/${USERS_REGISTRY_BIN_ID}`, {
      method: 'GET',
      headers: { 'X-Master-Key': apiKey, 'X-Bin-Meta': 'false' }
    });
    const data = await handleResponse(response, '사용자 목록 로드 실패');
    return data as UsersRegistry;
  } catch (error) {
    // Bin이 비어있거나 없는 경우 초기 구조 반환
    return { users: [] };
  }
};

// 중앙 사용자 디렉토리 업데이트
export const updateUsersRegistry = async (apiKey: string, registry: UsersRegistry): Promise<void> => {
  const response = await fetch(`${BIN_URL}/${USERS_REGISTRY_BIN_ID}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': apiKey,
      'X-Bin-Versioning': 'false'
    },
    body: JSON.stringify(registry)
  });
  await handleResponse(response, '사용자 정보 업데이트 실패');
};

export const createBin = async (apiKey: string, data: any): Promise<string> => {
  const response = await fetch(BIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': apiKey,
      'X-Bin-Private': 'true',
      'X-Bin-Name': `PortFlow_Data_${Date.now()}`
    },
    body: JSON.stringify(data)
  });
  const result = await handleResponse(response, '데이터 저장소 생성 실패');
  return result.metadata ? result.metadata.id : result.id;
};

export const updateBin = async (apiKey: string, binId: string, data: AppData): Promise<void> => {
  if (!apiKey || !binId) return;
  const response = await fetch(`${BIN_URL}/${binId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': apiKey,
      'X-Bin-Versioning': 'false'
    },
    body: JSON.stringify(data)
  });
  await handleResponse(response, '클라우드 업데이트 실패');
};

export const readBin = async (apiKey: string, binId: string): Promise<AppData> => {
  const response = await fetch(`${BIN_URL}/${binId}`, {
    method: 'GET',
    headers: { 'X-Master-Key': apiKey, 'X-Bin-Meta': 'false' }
  });
  const data = await handleResponse(response, '데이터 불러오기 실패');
  return data as AppData;
};
