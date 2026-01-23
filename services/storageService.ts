
import { AppData } from '../types';

const BIN_URL = 'https://api.jsonbin.io/v3/b';

const handleResponse = async (response: Response, defaultMessage: string) => {
  if (!response.ok) {
    let errorMessage = defaultMessage;
    
    if (response.status === 401 || response.status === 403) {
      throw new Error("API Key가 유효하지 않거나 권한이 없습니다 (JSONBin 401/403).");
    }
    if (response.status === 404) {
      throw new Error("저장 공간(Bin ID)을 찾을 수 없습니다. 새로운 Bin을 생성하거나 ID를 확인하세요.");
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
        'X-Bin-Name': 'PortFlow_Cloud_Backup'
      },
      body: JSON.stringify(data)
    });
    
    const result = await handleResponse(response, '클라우드 저장소 생성 실패');
    // JSONBin v3 returns id inside metadata if successful
    return result.metadata ? result.metadata.id : (result.id || '');
  } catch (error: any) {
    throw error;
  }
};

export const updateBin = async (apiKey: string, binId: string, data: AppData): Promise<void> => {
  if (!apiKey || !binId) return;

  try {
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
  } catch (error: any) {
    throw error;
  }
};

export const readBin = async (apiKey: string, binId: string): Promise<AppData> => {
  try {
    const response = await fetch(`${BIN_URL}/${binId}`, {
      method: 'GET',
      headers: {
        'X-Master-Key': apiKey,
        'X-Bin-Meta': 'false' // Get record directly
      }
    });
    
    const data = await handleResponse(response, '데이터 불러오기 실패');
    // data is directly the AppData object because of X-Bin-Meta: false
    if (!data || typeof data !== 'object') {
       throw new Error("클라우드 데이터 형식이 올바르지 않습니다.");
    }
    return data as AppData;
  } catch (error: any) {
    throw error;
  }
};

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  // Simple validation, actual validation happens during create/read
  return apiKey.trim().length > 20;
};
