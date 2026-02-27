
import { createClient } from '@supabase/supabase-js';
import { AppData, UserProfile, UsersRegistry, Asset, Account, Transaction, SavedStrategy } from '../types';

// Singleton client cache
let supabaseInstance: any = null;
let currentUrl: string | null = null;
let currentKey: string | null = null;

// Helper to get Supabase client (Singleton)
const getClient = (url: string, key: string) => {
  if (!url || !key) throw new Error("Supabase credentials missing");
  
  // URL이나 Key가 바뀌지 않았다면 기존 인스턴스 반환
  if (supabaseInstance && currentUrl === url && currentKey === key) {
    return supabaseInstance;
  }
  
  // 새로운 인스턴스 생성 및 캐싱
  supabaseInstance = createClient(url, key);
  currentUrl = url;
  currentKey = key;
  
  return supabaseInstance;
};

export class CloudAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudAuthError";
  }
}

// --- Legacy JSONBin Support (Migration Only) ---
export const loadFromLegacyBin = async (binId: string, apiKey: string): Promise<AppData> => {
  try {
    const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: 'GET',
      headers: {
        'X-Master-Key': apiKey,
        'X-Bin-Meta': 'false' // Return raw JSON body
      }
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("API Key가 올바르지 않습니다.");
      if (response.status === 404) throw new Error("Bin ID를 찾을 수 없습니다.");
      throw new Error(`JSONBin 오류: ${response.status}`);
    }

    const data = await response.json();
    // Validate basic structure
    if (!data || (!data.assets && !data.user)) {
      throw new Error("유효하지 않은 데이터 형식입니다.");
    }
    return data as AppData;
  } catch (error: any) {
    throw new Error(`데이터 가져오기 실패: ${error.message}`);
  }
};

// --- Supabase Implementation ---

// 사용자 목록 가져오기 (Users 테이블 조회)
export const fetchUsersRegistry = async (url: string, key: string): Promise<UsersRegistry> => {
  try {
    const supabase = getClient(url, key);
    const { data, error } = await supabase.from('users').select('*');
    
    if (error) throw new Error(error.message);

    const users: UserProfile[] = (data || []).map((u: any) => ({
      id: u.user_id,
      name: u.name,
      pin: u.pin,
      investmentGoal: u.investment_goal,
      goalPrompt: u.goal_prompt,
      dataBinId: u.user_id, // Compatibility
      cloudSync: { supabaseUrl: url, supabaseKey: key }
    }));

    return { users };
  } catch (error: any) {
    throw new Error(`사용자 목록 로드 실패: ${error.message}`);
  }
};

// 신규 사용자 등록 (Register)
export const registerUser = async (url: string, key: string, user: UserProfile): Promise<void> => {
  const supabase = getClient(url, key);
  const { error } = await supabase.from('users').insert({
    user_id: user.id,
    name: user.name,
    pin: user.pin,
    investment_goal: user.investmentGoal,
    goal_prompt: user.goalPrompt
  });
  if (error) throw new Error(`사용자 등록 실패: ${error.message}`);
};

// 데이터 불러오기 (Load & Reconstruct AppData)
export const loadUserData = async (url: string, key: string, userId: string): Promise<AppData> => {
  const supabase = getClient(url, key);

  // Parallel Fetch
  const [
    userRes,
    accountsRes,
    assetsRes,
    txRes,
    historyRes,
    strategiesRes
  ] = await Promise.all([
    supabase.from('users').select('*').eq('user_id', userId).single(),
    supabase.from('accounts').select('*').eq('user_id', userId),
    supabase.from('assets').select('*').eq('user_id', userId),
    supabase.from('transactions').select('*').eq('user_id', userId),
    supabase.from('portfolio_history').select('*').eq('user_id', userId).order('date', { ascending: true }),
    supabase.from('saved_strategies').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  ]);

  if (userRes.error) throw new Error(`사용자 정보 로드 실패: ${userRes.error.message}`);

  // Reconstruct AppData
  const user: UserProfile = {
    id: userRes.data.user_id,
    name: userRes.data.name,
    pin: userRes.data.pin,
    investmentGoal: userRes.data.investment_goal,
    goalPrompt: userRes.data.goal_prompt,
    dataBinId: userRes.data.user_id,
    cloudSync: { supabaseUrl: url, supabaseKey: key },
    kisConfig: {
      appKey: userRes.data.kis_app_key,
      appSecret: userRes.data.kis_app_secret
    }
  };

  const accounts: Account[] = (accountsRes.data || []).map((row: any) => ({
    id: row.id,
    institution: row.institution,
    accountNumber: row.account_number,
    nickname: row.nickname,
    type: row.type,
    isHidden: row.is_hidden
  }));

  const assets: Asset[] = (assetsRes.data || []).map((row: any) => ({
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    ticker: row.ticker,
    exchange: row.exchange,
    type: row.type,
    institution: row.institution,
    quantity: parseFloat(row.quantity),
    purchasePrice: parseFloat(row.purchase_price),
    purchasePriceKRW: row.purchase_price_krw ? parseFloat(row.purchase_price_krw) : undefined,
    currentPrice: parseFloat(row.current_price),
    currency: row.currency,
    managementType: row.management_type
  }));

  const transactions: Transaction[] = (txRes.data || []).map((row: any) => ({
    id: row.id,
    assetId: row.asset_id,
    accountId: row.account_id,
    date: row.date,
    type: row.type,
    assetType: row.asset_type,
    institution: row.institution,
    name: row.name,
    quantity: parseFloat(row.quantity),
    price: parseFloat(row.price),
    currency: row.currency,
    exchangeRate: row.exchange_rate ? parseFloat(row.exchange_rate) : 1350,
    ticker: row.ticker,
    exchange: row.exchange
  }));

  const history = (historyRes.data || []).map((row: any) => ({
    date: row.date,
    value: parseFloat(row.value),
    exchangeRate: row.exchange_rate ? parseFloat(row.exchange_rate) : undefined
  }));

  const savedStrategies: SavedStrategy[] = (strategiesRes.data || []).map((row: any) => ({
    id: row.id,
    createdAt: parseInt(row.created_at) || Date.now(),
    name: row.name,
    diagnosis: row.diagnosis,
    strategy: row.strategy
  }));

  // Find the most recent exchange rate from history records to avoid 1350 hardcoding
  let restoredExchangeRate = 1350;
  if (history.length > 0) {
    const sortedHistory = [...history].sort((a, b) => b.date.localeCompare(a.date));
    if (sortedHistory[0].exchangeRate) {
      restoredExchangeRate = sortedHistory[0].exchangeRate;
    }
  }

  // Use the database's updated_at as the official lastUpdated string
  const dbUpdatedTime = userRes.data.updated_at;
  const lastUpdatedStr = dbUpdatedTime ? new Date(dbUpdatedTime).toLocaleString() : new Date().toLocaleString();

  return {
    user,
    accounts,
    assets,
    transactions,
    history,
    savedStrategies,
    lastUpdated: lastUpdatedStr,
    exchangeRate: restoredExchangeRate,
    timestamp: dbUpdatedTime ? new Date(dbUpdatedTime).getTime() : Date.now(),
    marketBriefing: userRes.data.market_briefing
  };
};

// 데이터 저장하기 (Upsert Normalized Data)
export const saveUserData = async (url: string, key: string, data: AppData): Promise<void> => {
  const supabase = getClient(url, key);
  const userId = data.user?.id;
  if (!userId) throw new Error("User ID missing");

  const syncTimestamp = new Date().toISOString();

  // 1. Upsert User
  const { error: userError } = await supabase.from('users').upsert({
    user_id: userId,
    name: data.user?.name,
    pin: data.user?.pin,
    investment_goal: data.user?.investmentGoal,
    goal_prompt: data.user?.goalPrompt,
    // Ensure marketBriefing is stored as a proper JSON object, and has content
    market_briefing: (data.marketBriefing && data.marketBriefing.content) ? data.marketBriefing : null,
    kis_app_key: data.user?.kisConfig?.appKey,
    kis_app_secret: data.user?.kisConfig?.appSecret,
    updated_at: syncTimestamp
  });
  if (userError) throw new Error(`User Save Error: ${userError.message}`);

  // 2. Sync Accounts (Delete missing, Upsert existing)
  const incomingAccountIds = data.accounts.map(a => a.id);
  if (incomingAccountIds.length > 0) {
    await supabase.from('accounts').delete().eq('user_id', userId).not('id', 'in', `(${incomingAccountIds.join(',')})`);
    const { error } = await supabase.from('accounts').upsert(
      data.accounts.map(a => ({
        id: a.id,
        user_id: userId,
        institution: a.institution,
        account_number: a.accountNumber,
        nickname: a.nickname,
        type: a.type,
        is_hidden: a.isHidden,
        updated_at: syncTimestamp
      }))
    );
    if (error) console.error("Accounts Save Error", error);
  } else {
    await supabase.from('accounts').delete().eq('user_id', userId);
  }

  // 3. Sync Assets (Delete missing, Upsert existing)
  const incomingAssetIds = data.assets.map(a => a.id);
  if (incomingAssetIds.length > 0) {
    await supabase.from('assets').delete().eq('user_id', userId).not('id', 'in', `(${incomingAssetIds.join(',')})`);
    const { error } = await supabase.from('assets').upsert(
      data.assets.map(a => ({
        id: a.id,
        user_id: userId,
        account_id: a.accountId,
        name: a.name,
        ticker: a.ticker,
        exchange: a.exchange,
        type: a.type,
        institution: a.institution,
        quantity: a.quantity,
        purchase_price: a.purchasePrice,
        purchase_price_krw: a.purchasePriceKRW,
        current_price: a.currentPrice,
        currency: a.currency,
        management_type: a.managementType,
        updated_at: syncTimestamp
      }))
    );
    if (error) console.error("Assets Save Error", error);
  } else {
    await supabase.from('assets').delete().eq('user_id', userId);
  }

  // 4. Sync Transactions (Delete missing, Upsert existing)
  const incomingTxIds = data.transactions.map(t => t.id);
  if (incomingTxIds.length > 0) {
    await supabase.from('transactions').delete().eq('user_id', userId).not('id', 'in', `(${incomingTxIds.join(',')})`);
    const { error } = await supabase.from('transactions').upsert(
      data.transactions.map(t => ({
        id: t.id,
        user_id: userId,
        asset_id: t.assetId,
        account_id: t.accountId,
        date: t.date,
        type: t.type,
        asset_type: t.assetType,
        institution: t.institution,
        name: t.name,
        quantity: t.quantity,
        price: t.price,
        currency: t.currency,
        exchange_rate: t.exchangeRate,
        ticker: t.ticker,
        exchange: t.exchange,
        updated_at: syncTimestamp
      }))
    );
    if (error) console.error("Transactions Save Error", error);
  } else {
    await supabase.from('transactions').delete().eq('user_id', userId);
  }

  // 5. Upsert History
  if (data.history.length > 0) {
    const { error } = await supabase.from('portfolio_history').upsert(
      data.history.map(h => ({
        user_id: userId,
        date: h.date,
        value: h.value,
        exchange_rate: h.exchangeRate,
        updated_at: syncTimestamp // Record the precise time of this data point update
      })),
      { onConflict: 'user_id,date' }
    );
    if (error) console.error("History Save Error", error);
  }

  // 6. Sync Strategies
  const incomingStrategyIds = (data.savedStrategies || []).map(s => s.id);
  if (incomingStrategyIds.length > 0) {
    await supabase.from('saved_strategies').delete().eq('user_id', userId).not('id', 'in', `(${incomingStrategyIds.join(',')})`);
    const { error } = await supabase.from('saved_strategies').upsert(
      data.savedStrategies!.map(s => ({
        id: s.id,
        user_id: userId,
        name: s.name,
        created_at: s.createdAt,
        diagnosis: s.diagnosis,
        strategy: s.strategy
      }))
    );
    if (error) console.error("Strategies Save Error", error);
  } else {
    await supabase.from('saved_strategies').delete().eq('user_id', userId);
  }
};

// --- KIS Token Management ---

export const saveKisToken = async (url: string, key: string, userId: string, token: string, expiresAt: string, isVirtual: boolean): Promise<void> => {
  const supabase = getClient(url, key);
  
  // 1. Get existing tokens first to preserve the other environment's token
  const { data: userData } = await supabase.from('users').select('kis_token').eq('user_id', userId).single();
  
  let tokenData: any = {};
  if (userData?.kis_token) {
    try {
      // If it's already a JSON string, parse it
      tokenData = typeof userData.kis_token === 'string' && userData.kis_token.startsWith('{') 
        ? JSON.parse(userData.kis_token) 
        : {};
    } catch (e) {
      tokenData = {};
    }
  }

  const envKey = isVirtual ? 'VIRTUAL' : 'REAL';
  tokenData[envKey] = { token, expiresAt };

  const { error } = await supabase.from('users').update({
    kis_token: JSON.stringify(tokenData),
    kis_token_expires_at: expiresAt // Keep this for backward compatibility or simple checks
  }).eq('user_id', userId);
  
  if (error) console.error("KIS Token Save Error", error);
};

export const loadKisToken = async (url: string, key: string, userId: string, isVirtual: boolean): Promise<{ token: string, expiresAt: string } | null> => {
  const supabase = getClient(url, key);
  const { data, error } = await supabase.from('users').select('kis_token').eq('user_id', userId).single();
  
  if (error || !data || !data.kis_token) return null;
  
  try {
    const tokenData = typeof data.kis_token === 'string' && data.kis_token.startsWith('{')
      ? JSON.parse(data.kis_token)
      : null;
      
    if (!tokenData) return null;
    
    const envKey = isVirtual ? 'VIRTUAL' : 'REAL';
    const envToken = tokenData[envKey];
    
    if (!envToken || !envToken.token) return null;
    
    return {
      token: envToken.token,
      expiresAt: envToken.expiresAt
    };
  } catch (e) {
    return null;
  }
};
