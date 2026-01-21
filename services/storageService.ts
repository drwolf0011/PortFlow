
import { AppData } from '../types';

const BIN_URL = 'https://api.jsonbin.io/v3/b';

const handleResponse = async (response: Response, defaultMessage: string) => {
  if (!response.ok) {
    let errorMessage = defaultMessage;
    
    if (response.status === 401 || response.status === 403) {
      throw new Error("API Key가 유효하지 않거나 권한이 없습니다 (401/403).");
    }
    if (response.status === 404) {
      throw new Error("Bin ID를 찾을 수 없습니다 (404).");
    }

    try {
      const errorData = await response.json();
      if (errorData && errorData.message) {
        errorMessage = errorData.message;
      }
    } catch (e) {
      errorMessage = `${defaultMessage} (${response.status} ${response.statusText})`;
    }
    throw new Error(errorMessage);
  }
  return response.json();
};

export const createBin = async (apiKey: string, data: AppData): Promise<string> => {
  if (!apiKey || apiKey.length < 10) throw new Error("유효하지 않은 API Key 형식입니다.");

  try {
    const response = await fetch(BIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': apiKey,
        'X-Bin-Private': 'true',
        'X-Bin-Name': 'PortFlow_Backup'
      },
      body: JSON.stringify(data)
    });
    
    const result = await handleResponse(response, '클라우드 저장소 생성 실패');
    return result.metadata ? result.metadata.id : result.id;
  } catch (error: any) {
    if (error.message === 'Failed to fetch') {
      throw new Error("네트워크 오류: 인터넷 연결을 확인해주세요.");
    }
    throw error;
  }
};

export const updateBin = async (apiKey: string, binId: string, data: AppData): Promise<void> => {
  if (!apiKey) throw new Error("API Key가 필요합니다.");
  if (!binId) throw new Error("Bin ID가 필요합니다.");

  try {
    const response = await fetch(`${BIN_URL}/${binId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': apiKey,
        'X-Bin-Versioning': 'false' // Disable versioning to save space if not needed
      },
      body: JSON.stringify(data)
    });
    
    await handleResponse(response, '클라우드 저장 실패');
  } catch (error: any) {
    if (error.message === 'Failed to fetch') {
      throw new Error("네트워크 오류: 인터넷 연결을 확인해주세요.");
    }
    throw error;
  }
};

export const readBin = async (apiKey: string, binId: string): Promise<AppData> => {
  if (!apiKey) throw new Error("API Key가 필요합니다.");
  if (!binId) throw new Error("Bin ID가 필요합니다.");

  try {
    const response = await fetch(`${BIN_URL}/${binId}`, {
      method: 'GET',
      headers: {
        'X-Master-Key': apiKey,
        'X-Bin-Meta': 'false'
      }
    });
    
    const data = await handleResponse(response, '클라우드 데이터 로드 실패');
    // Ensure we are returning valid AppData
    const record = data.record ? data.record : data;
    if (!record || (typeof record === 'object' && Object.keys(record).length === 0)) {
       throw new Error("저장된 데이터가 비어있거나 올바르지 않습니다.");
    }
    return record;
  } catch (error: any) {
    if (error.message === 'Failed to fetch') {
      throw new Error("네트워크 오류: 인터넷 연결을 확인해주세요.");
    }
    throw error;
  }
};

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  return apiKey.length > 10;
};

export const generateTransferCode = (data: AppData): string => {
  try {
    const json = JSON.stringify(data);
    return btoa(encodeURIComponent(json));
  } catch (e) {
    console.error("Export failed", e);
    return "";
  }
};

export const parseTransferCode = (code: string): AppData | null => {
  try {
    const json = decodeURIComponent(atob(code));
    return JSON.parse(json);
  } catch (e) {
    console.error("Import failed", e);
    return null;
  }
};
