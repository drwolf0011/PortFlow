
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
const { HashRouter, Routes, Route, Link, useLocation, useNavigate } = ReactRouterDOM;
import { 
  Home, Wallet, LineChart, Cpu, PlusCircle, Settings,
  CheckCircle2, LogOut, RotateCcw, X,
  History, Download, Upload, Trash2, Database, ChevronRight, ChevronDown, ChevronUp,
  Globe, CreditCard, Loader2, CloudCog, Cloud, Sparkles, ArrowRightLeft,
  Zap, AlertTriangle, FileJson, CloudUpload, CloudCheck
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import Dashboard from './components/Dashboard';
import AssetList from './components/AssetList';
import AIAdvisor from './components/AIAdvisor';
import TransactionHistory from './components/TransactionHistory';
import AnalyticsView from './components/AnalyticsView';
import AccountManager from './components/AccountManager';
import ManualAssetEntry from './components/ManualAssetEntry';
import ManualTransactionEntry from './components/ManualTransactionEntry';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import EnrichmentModal from './components/EnrichmentModal';
import AuthScreen from './components/AuthScreen';
import { EXCHANGE_RATE as DEFAULT_EXCHANGE_RATE, SUPABASE_URL, SUPABASE_KEY } from './constants';
import { Asset, Transaction, TransactionType, AssetType, Account, SyncConfig, AppData, RebalancingStrategy, UserProfile, DiagnosisResponse, SavedStrategy, AccountType, KisConfig } from './types';
import { updateAssetPrices, enrichAssetData } from './services/geminiService';
import { updateAssetsWithKis, getLastKisDebugLog, KisDebugLog } from './services/kisService';
import { loadUserData, saveUserData, loadFromLegacyBin } from './services/storageService';
import { triggerHaptic } from './utils/mobile';

const NavLink: React.FC<{ to: string; icon: React.ReactNode; label: string }> = ({ to, icon, label }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link 
      to={to} 
      onClick={() => triggerHaptic('light')}
      className="flex flex-col items-center gap-1.5 pb-1 group"
    >
      <div className={`transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-300 group-hover:text-indigo-600'}`}>
        {icon}
      </div>
      <span className={`text-[9px] font-black ${isActive ? 'text-indigo-600' : 'text-slate-300 group-hover:text-indigo-600'}`}>
        {label}
      </span>
    </Link>
  );
};

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Data State ---
  const [assets, setAssets] = useState<Asset[]>(() => {
    try {
      const saved = localStorage.getItem('portflow_assets');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('portflow_transactions');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const [accounts, setAccounts] = useState<Account[]>(() => {
    try {
      const saved = localStorage.getItem('portflow_accounts');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const [history, setHistory] = useState<{date: string, value: number, exchangeRate?: number}[]>(() => {
    try {
      const saved = localStorage.getItem('portflow_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('portflow_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });

  const [dynamicExchangeRate, setDynamicExchangeRate] = useState<number>(() => {
    try {
      const historySaved = localStorage.getItem('portflow_history');
      if (historySaved) {
        const hist = JSON.parse(historySaved);
        if (Array.isArray(hist) && hist.length > 0) {
          const lastEntry = hist[hist.length - 1];
          if (lastEntry.exchangeRate) return lastEntry.exchangeRate;
        }
      }
    } catch (e) {}
    const saved = localStorage.getItem('portflow_exchange_rate');
    return saved ? parseFloat(saved) : DEFAULT_EXCHANGE_RATE;
  });

  const [lastUpdated, setLastUpdated] = useState<string>(() => localStorage.getItem('portflow_last_updated') || '-');
  
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number>(0);

  // Load lastSyncTimestamp based on current user
  useEffect(() => {
    if (user?.id) {
      const saved = localStorage.getItem(`portflow_last_sync_timestamp_${user.id}`);
      if (saved) setLastSyncTimestamp(Number(saved));
    }
  }, [user?.id]);

  const [savedStrategies, setSavedStrategies] = useState<SavedStrategy[]>(() => {
    try {
      const saved = localStorage.getItem('portflow_saved_strategies');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => {
    try {
      const saved = localStorage.getItem('portflow_sync_config');
      const baseConfig = saved ? JSON.parse(saved) : { apiKey: '', binId: '', lastSynced: '', autoSync: false };
      const finalUrl = SUPABASE_URL || baseConfig.supabaseUrl;
      const finalKey = SUPABASE_KEY || baseConfig.supabaseKey;
      return { ...baseConfig, supabaseUrl: finalUrl, supabaseKey: finalKey, autoSync: !!(finalUrl && finalKey) };
    } catch (e) { return { apiKey: '', binId: '', lastSynced: '', autoSync: false }; }
  });

  const [kisConfig, setKisConfig] = useState<KisConfig>(() => {
    try {
      const saved = localStorage.getItem('portflow_kis_config');
      const baseConfig = saved ? JSON.parse(saved) : { useKis: false, serverType: 'REAL', appKey: '', appSecret: '', accountNo: '' };
      
      // user 정보에서 KIS 설정 불러오기 (우선순위)
      const userSaved = localStorage.getItem('portflow_user');
      if (userSaved) {
        const parsedUser = JSON.parse(userSaved);
        if (parsedUser.kisConfig) {
          return {
            ...baseConfig,
            appKey: parsedUser.kisConfig.appKey || baseConfig.appKey,
            appSecret: parsedUser.kisConfig.appSecret || baseConfig.appSecret
          };
        }
      }
      return baseConfig;
    } catch (e) { return { useKis: false, serverType: 'REAL', appKey: '', appSecret: '', accountNo: '' }; }
  });

  // KIS 설정 변경 시 UserProfile에도 저장
  useEffect(() => {
    localStorage.setItem('portflow_kis_config', JSON.stringify(kisConfig));
    if (user && (kisConfig.appKey || kisConfig.appSecret)) {
      setUser(prev => {
        if (!prev) return prev;
        const updatedUser = {
          ...prev,
          kisConfig: {
            appKey: kisConfig.appKey,
            appSecret: kisConfig.appSecret
          }
        };
        localStorage.setItem('portflow_user', JSON.stringify(updatedUser));
        return updatedUser;
      });
    }
  }, [kisConfig, user?.id]);

  const [localUpdateTimestamp, setLocalUpdateTimestamp] = useState<number>(() => Date.now());
  const [isDirty, setIsDirty] = useState(false);

  // --- UI State ---
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [deletingAsset, setDeletingAsset] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | undefined>(undefined);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [priceUpdateStatus, setPriceUpdateStatus] = useState<{ api: string, current: number, total: number } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  
  const [isLegacyMigrationOpen, setIsLegacyMigrationOpen] = useState(false);
  const [isLocalDataOpen, setIsLocalDataOpen] = useState(false);
  const [kisDebugLog, setKisDebugLog] = useState<KisDebugLog | null>(null);
  const [isKisDebugOpen, setIsKisDebugOpen] = useState(false);
  
  const [inputSupaUrl, setInputSupaUrl] = useState('');
  const [inputSupaKey, setInputSupaKey] = useState('');
  const [inputLegacyBinId, setInputLegacyBinId] = useState('');
  const [inputLegacyApiKey, setInputLegacyApiKey] = useState('');
  
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{current: number, total: number} | null>(null);
  const [enrichTargets, setEnrichTargets] = useState<Asset[]>([]);
  const [isEnrichModalOpen, setIsEnrichModalOpen] = useState(false);

  useEffect(() => {
    if (syncConfig.binId) setInputLegacyBinId(syncConfig.binId);
    if (syncConfig.apiKey) setInputLegacyApiKey(syncConfig.apiKey);
  }, [syncConfig]);

  const showToast = useCallback((msg: string) => {
    triggerHaptic('light');
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const [marketBriefing, setMarketBriefing] = useState<{content: string, timestamp: number} | undefined>(() => {
    try {
      const saved = localStorage.getItem('portflow_market_briefing');
      if (!saved) return undefined;
      const parsed: any = JSON.parse(saved);
      return (parsed && typeof parsed.content === 'string' && parsed.content.trim().length > 0) ? parsed : undefined;
    } catch (e) { return undefined; }
  });

  useEffect(() => {
    if (marketBriefing) {
      localStorage.setItem('portflow_market_briefing', JSON.stringify(marketBriefing));
    }
  }, [marketBriefing]);

  const getCurrentAppData = useCallback((): AppData => ({
    assets, transactions, accounts, user, history, lastUpdated, 
    exchangeRate: dynamicExchangeRate, 
    timestamp: localUpdateTimestamp,
    savedStrategies,
    marketBriefing
  }), [assets, transactions, accounts, user, history, lastUpdated, dynamicExchangeRate, localUpdateTimestamp, savedStrategies, marketBriefing]);

  const applyAppData = useCallback((data: AppData) => {
    if (!data) return;
    const incomingTxs = Array.isArray(data.transactions) ? data.transactions : [];
    const syncedAssets = recalculateAssets(incomingTxs, Array.isArray(data.assets) ? data.assets : []);
    setTransactions(incomingTxs);
    setAssets(syncedAssets);
    if (Array.isArray(data.accounts)) setAccounts([...data.accounts]);
    if (Array.isArray(data.history)) setHistory([...data.history]);
    if (Array.isArray(data.savedStrategies)) setSavedStrategies(data.savedStrategies);
    if (data.user) {
      setUser({ ...data.user });
      if (data.user.kisConfig?.appKey || data.user.kisConfig?.appSecret) {
        setKisConfig(prev => ({
          ...prev,
          appKey: data.user!.kisConfig!.appKey || prev.appKey,
          appSecret: data.user!.kisConfig!.appSecret || prev.appSecret,
          useKis: !!(data.user!.kisConfig!.appKey && data.user!.kisConfig!.appSecret)
        }));
      }
    }
    if (data.lastUpdated) setLastUpdated(data.lastUpdated);
    if (data.exchangeRate) setDynamicExchangeRate(data.exchangeRate);
    if (data.marketBriefing) {
      let mb: any = data.marketBriefing;
      
      // Handle case where marketBriefing is stored as a stringified JSON string
      if (typeof mb === 'string') {
        try {
          mb = JSON.parse(mb);
        } catch (e) {
          console.warn("Failed to parse marketBriefing string:", e);
        }
      }

      // Handle case where marketBriefing is stored as an array-like object (e.g. {"0":"{", "1":"\"" ...})
      if (mb && typeof mb === 'object' && !mb.content && !mb.timestamp) {
        const keys = Object.keys(mb);
        if (keys.length > 0 && keys.every(k => !isNaN(Number(k)))) {
          try {
            const str = Object.values(mb).join('');
            const parsed = JSON.parse(str);
            if (parsed && (parsed.content || parsed.timestamp)) {
              mb = parsed;
            }
          } catch (e) {
            console.warn("Failed to reconstruct marketBriefing from array-like object:", e);
          }
        }
      }

      // Ensure timestamp is a number
      const timestamp = typeof mb.timestamp === 'string' 
        ? new Date(mb.timestamp).getTime() 
        : (typeof mb.timestamp === 'number' ? mb.timestamp : Date.now());
      
      const validTimestamp = isNaN(timestamp) ? Date.now() : timestamp;
      
      if (mb && typeof mb === 'object' && typeof mb.content === 'string' && mb.content.trim().length > 0) {
        setMarketBriefing({ 
          content: mb.content, 
          timestamp: validTimestamp 
        });
      }
    }
    
    const dbTimestamp = data.timestamp || Date.now();
    setLocalUpdateTimestamp(dbTimestamp);
    
    // Sync Cooldown from cloud data timestamp
    if (user?.id) {
       setLastSyncTimestamp(dbTimestamp);
       localStorage.setItem(`portflow_last_sync_timestamp_${user.id}`, dbTimestamp.toString());
    }

    setIsDirty(false);
  }, [user?.id]); // recalculateAssets dependency removed because it's defined within useCallback or as constant helper

  const handleSync = useCallback(async (mode: 'AUTO' | 'FORCE_PUSH' | 'FORCE_PULL' | 'SMART' = 'SMART', overrideData?: AppData) => {
    if (isSyncingRef.current) return;
    const url = syncConfig.supabaseUrl;
    const key = syncConfig.supabaseKey;
    const userId = user?.id;

    if (!url || !key || !userId) {
      if (mode !== 'AUTO') showToast("Supabase 설정이 필요합니다.");
      return;
    }
    
    isSyncingRef.current = true;
    setIsSyncing(true);
    
    try {
      const localData = overrideData || getCurrentAppData();

      if (mode === 'FORCE_PUSH' || mode === 'AUTO') {
        await saveUserData(url, key, localData);
        const now = new Date().toLocaleString();
        setSyncConfig(prev => ({ ...prev, lastSynced: now, lastSyncedDataTimestamp: localData.timestamp }));
        setIsDirty(false);
        if (mode === 'FORCE_PUSH') {
           showToast("클라우드 저장 완료");
           triggerHaptic('success');
        }
        return;
      }

      const cloudData = await loadUserData(url, key, userId);

      if (mode === 'FORCE_PULL') {
        applyAppData(cloudData);
        setSyncConfig(prev => ({ ...prev, lastSynced: new Date().toLocaleString(), lastSyncedDataTimestamp: cloudData.timestamp }));
        setIsDirty(false);
        showToast("최신 데이터 동기화 완료");
        triggerHaptic('success');
        return;
      }

      const localTime = localData.timestamp;
      const cloudTime = cloudData.timestamp || 0;
      const lastSyncedTime = syncConfig.lastSyncedDataTimestamp || 0;

      if (cloudTime > localTime && cloudTime > lastSyncedTime) {
        applyAppData(cloudData);
        setSyncConfig(prev => ({ ...prev, lastSynced: new Date().toLocaleString(), lastSyncedDataTimestamp: cloudTime }));
        setIsDirty(false);
      } else if (localTime > cloudTime) {
        await saveUserData(url, key, localData);
        setSyncConfig(prev => ({ ...prev, lastSynced: new Date().toLocaleString(), lastSyncedDataTimestamp: localTime }));
        setIsDirty(false);
      }
    } catch (e: any) {
      console.error(e);
      if (mode !== 'AUTO') showToast(`동기화 오류: ${e.message}`);
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [syncConfig, user, getCurrentAppData, applyAppData]);

  useEffect(() => {
    if (isDirty && syncConfig.autoSync) {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        handleSync('AUTO');
      }, 2000); 
    }
    return () => { if (syncTimerRef.current) clearTimeout(syncTimerRef.current); };
  }, [isDirty, syncConfig.autoSync, handleSync]);

  const markDirty = () => {
    setLocalUpdateTimestamp(Date.now());
    setIsDirty(true);
  };

  useEffect(() => { localStorage.setItem('portflow_assets', JSON.stringify(assets)); markDirty(); }, [assets]);
  useEffect(() => { localStorage.setItem('portflow_transactions', JSON.stringify(transactions)); markDirty(); }, [transactions]);
  useEffect(() => { localStorage.setItem('portflow_accounts', JSON.stringify(accounts)); markDirty(); }, [accounts]);
  useEffect(() => { localStorage.setItem('portflow_saved_strategies', JSON.stringify(savedStrategies)); markDirty(); }, [savedStrategies]);
  useEffect(() => { localStorage.setItem('portflow_user', JSON.stringify(user)); markDirty(); }, [user]);
  useEffect(() => { localStorage.setItem('portflow_history', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('portflow_sync_config', JSON.stringify(syncConfig)); }, [syncConfig]);
  useEffect(() => { localStorage.setItem('portflow_kis_config', JSON.stringify(kisConfig)); }, [kisConfig]);
  useEffect(() => { localStorage.setItem('portflow_exchange_rate', dynamicExchangeRate.toString()); }, [dynamicExchangeRate]);
  useEffect(() => { localStorage.setItem('portflow_last_updated', lastUpdated); }, [lastUpdated]);

  const recalculateAssets = useCallback((txs: Transaction[], currentAssets: Asset[]) => {
    const groups: Record<string, Transaction[]> = {};
    txs.forEach(t => {
      const key = t.assetId || `${t.name}|${t.institution}|${t.accountId || 'none'}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });

    const assetMetaMap: Record<string, Asset> = {};
    currentAssets.forEach(a => {
      assetMetaMap[a.id] = a;
      assetMetaMap[`${a.name}|${a.institution}|${a.accountId || 'none'}`] = a;
    });

    const newAssets: Asset[] = [];
    Object.entries(groups).forEach(([key, groupTxs]) => {
      const meta = assetMetaMap[key]; 
      let totalQty = 0, totalCostKRW = 0, totalCostUSD = 0; 
      const sortedTxs = [...groupTxs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      const firstTx = sortedTxs[0];
      const accId = firstTx.accountId;
      const linkedAccount = accId ? accounts.find(a => a.id === accId) : null;

      sortedTxs.forEach(tx => {
        const effectiveRate = tx.currency === 'USD' ? (tx.exchangeRate || dynamicExchangeRate) : 1;
        if (tx.type === TransactionType.BUY) {
          totalCostKRW += (tx.quantity * tx.price * effectiveRate);
          totalCostUSD += (tx.quantity * tx.price);
          totalQty += tx.quantity;
        } else if (tx.type === TransactionType.SELL) {
          const avgKRW = totalQty > 0 ? totalCostKRW / totalQty : 0;
          const avgUSD = totalQty > 0 ? totalCostUSD / totalQty : 0;
          totalQty = Math.max(0, totalQty - tx.quantity);
          totalCostKRW = totalQty * avgKRW; 
          totalCostUSD = totalQty * avgUSD;
        }
      });

      if (totalQty > 0) {
        // ID 생성 로직 개선: 기존 메타데이터 ID가 있으면 사용, 없으면 랜덤 ID 생성 (이름 사용 X)
        // 기존 로직에서 key가 이름|기관|계좌 조합일 경우, 이를 ID로 사용하는 문제가 있었음.
        const newId = meta?.id || Math.random().toString(36).substr(2, 9);
        
        // [Bug Fix] 트랜잭션에 자산 ID가 없는 경우(신규 등록 등) 생성된/찾은 자산 ID를 주입하여 DB 저장 시 누락 방지
        sortedTxs.forEach(tx => {
           if (!tx.assetId) tx.assetId = newId;
        });

        newAssets.push({
          id: newId,
          name: meta?.name || firstTx.name, 
          institution: meta?.institution || firstTx.institution, 
          ticker: meta?.ticker || firstTx.ticker || (firstTx.assetType === AssetType.STOCK ? firstTx.name : undefined),
          exchange: meta?.exchange || firstTx.exchange, 
          type: meta?.type || firstTx.assetType, 
          quantity: totalQty,
          purchasePrice: totalCostUSD / totalQty, 
          purchasePriceKRW: totalCostKRW / totalQty,
          currentPrice: meta?.currentPrice || sortedTxs[sortedTxs.length - 1].price, 
          currency: firstTx.currency,
          accountId: accId || undefined, 
          managementType: linkedAccount?.type || meta?.managementType || firstTx.managementType || AccountType.GENERAL
        });
      }
    });
    return newAssets;
  }, [dynamicExchangeRate, accounts]);

  /**
   * 거래 변경 시 상태를 업데이트하고 즉시 클라우드로 전송합니다.
   */
  const performDataUpdateAndSync = useCallback(async (newTxs: Transaction[]) => {
    const newAssets = recalculateAssets(newTxs, assets);
    const now = Date.now();
    
    // 로컬 상태 즉시 반영
    setTransactions(newTxs);
    setAssets(newAssets);
    setLocalUpdateTimestamp(now);
    
    // 현재 총 자산 가치 재계산 (히스토리 업데이트용)
    const totalValue = newAssets.reduce((acc, a) => {
      const mult = a.currency === 'USD' ? dynamicExchangeRate : 1;
      return acc + (a.currentPrice * a.quantity * mult);
    }, 0);
    
    const todayStr = new Date().toLocaleDateString('en-CA');
    const newHistory = [...history].filter(h => h.date !== todayStr);
    newHistory.push({ date: todayStr, value: totalValue, exchangeRate: dynamicExchangeRate });
    setHistory(newHistory);

    // 즉시 클라우드 반영
    const appDataToSync: AppData = {
      assets: newAssets,
      transactions: newTxs,
      accounts,
      user,
      history: newHistory,
      lastUpdated: new Date().toLocaleString(),
      exchangeRate: dynamicExchangeRate,
      timestamp: now,
      savedStrategies,
      marketBriefing
    };
    
    await handleSync('FORCE_PUSH', appDataToSync);
  }, [assets, history, accounts, user, dynamicExchangeRate, savedStrategies, marketBriefing, handleSync, recalculateAssets]);

  const handleUpdateBriefing = useCallback(async (briefing: { content: string, timestamp: number }) => {
    setMarketBriefing(briefing);
    const now = Date.now();
    setLocalUpdateTimestamp(now);
    
    // 즉시 클라우드 반영
    const appDataToSync: AppData = {
      assets,
      transactions,
      accounts,
      user,
      history,
      lastUpdated,
      exchangeRate: dynamicExchangeRate,
      timestamp: now,
      savedStrategies,
      marketBriefing: briefing
    };
    
    await handleSync('FORCE_PUSH', appDataToSync);
  }, [assets, transactions, accounts, user, history, lastUpdated, dynamicExchangeRate, savedStrategies, handleSync]);

  const handleSaveTransaction = (tx: Transaction) => {
    if (!tx.assetId) {
      const existingAsset = assets.find(a => 
        a.name === tx.name && 
        a.institution === tx.institution && 
        a.accountId === tx.accountId
      );
      if (existingAsset) {
        tx.assetId = existingAsset.id;
        if (!tx.ticker && existingAsset.ticker) tx.ticker = existingAsset.ticker;
        if (!tx.exchange && existingAsset.exchange) tx.exchange = existingAsset.exchange;
      }
    }

    const exists = transactions.find(t => t.id === tx.id);
    const nextTxs = exists ? transactions.map(t => t.id === tx.id ? tx : t) : [...transactions, tx];
    
    performDataUpdateAndSync(nextTxs);
    setIsTransactionModalOpen(false); 
    setEditingTransaction(undefined); 
    showToast("거래 내역이 저장 및 동기화되었습니다.");
  };

  const handleDeleteTransaction = (id: string) => {
    const nextTxs = transactions.filter(t => t.id !== id);
    performDataUpdateAndSync(nextTxs);
    showToast("거래 내역이 삭제 및 동기화되었습니다.");
  };

  const handleSaveAsset = (asset: Asset) => {
    setAssets(prev => {
      const exists = prev.find(a => a.id === asset.id);
      return exists ? prev.map(a => a.id === asset.id ? asset : a) : [...prev, asset];
    });
    setIsManualModalOpen(false); setEditingAsset(undefined); showToast("저장되었습니다.");
  };

  const handleLegacyPull = async () => {
    if (!inputLegacyBinId || !inputLegacyApiKey) return showToast("Bin ID와 API Key를 입력해주세요.");
    if (isSyncingRef.current) return;
    setIsSyncing(true); isSyncingRef.current = true;
    try {
      showToast("JSONBin 데이터를 불러옵니다...");
      const data = await loadFromLegacyBin(inputLegacyBinId, inputLegacyApiKey);
      applyAppData(data);
      showToast("JSONBin 데이터 적재 완료");
      setSyncConfig(prev => ({ ...prev, binId: inputLegacyBinId, apiKey: inputLegacyApiKey }));
    } catch (e: any) { showToast(`실패: ${e.message}`); } finally { setIsSyncing(false); isSyncingRef.current = false; }
  };

  useEffect(() => {
    if (isAuthenticated && syncConfig.supabaseUrl && syncConfig.supabaseKey) {
      // 앱 실행 시 클라우드 강제 동기화 (FORCE_PULL)
      // 약간의 지연을 두어 초기 렌더링 후 실행되도록 함
      const timer = setTimeout(() => {
        handleSync('FORCE_PULL');
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, syncConfig.supabaseUrl, syncConfig.supabaseKey]); // handleSync dependency removed to avoid infinite loop if handleSync changes often, though useCallback should be stable. Added syncConfig.supabaseKey for completeness.

  /**
   * 고유 종목 기반 배치 시세 업데이트 수행
   */
  const handleUpdatePrices = useCallback(async () => {
    if (assets.length === 0) return showToast("갱신할 자산이 없습니다.");
    
    const now = Date.now();
    const COOLDOWN_TIME = 10 * 1000; // 10 seconds
    const lastTime = lastSyncTimestamp || 0;
    
    if (now - lastTime < COOLDOWN_TIME) {
      const remainingSeconds = Math.ceil((COOLDOWN_TIME - (now - lastTime)) / 1000);
      showToast(`최근 10초 이내에 갱신되었습니다. ${remainingSeconds}초 후 다시 가능합니다.`);
      return;
    }

    setIsUpdatingPrices(true);
    try {
      let updatedAssets = [...assets];
      let newRate = dynamicExchangeRate;
      let successMsg = "시세가 갱신되었습니다.";
      let fetchedItemsCount = 0;

      if (kisConfig.useKis && kisConfig.appKey && kisConfig.appSecret) {
        try {
          const kisEligible = assets.filter(a => a.type !== AssetType.CASH && a.ticker && (a.currency === 'USD' || (a.currency === 'KRW' && a.ticker.length === 6)));
          const geminiEligible = assets.filter(a => a.type !== AssetType.CASH && (!a.ticker || (a.currency === 'KRW' && a.ticker.length !== 6)));

          if (kisEligible.length > 0) {
            setPriceUpdateStatus({ api: '한국투자증권 API', current: 0, total: kisEligible.length });
            const kisResult = await updateAssetsWithKis(
              kisEligible, 
              kisConfig, 
              (c, t) => setPriceUpdateStatus({ api: '한국투자증권 API', current: c, total: t }),
              syncConfig.supabaseUrl,
              syncConfig.supabaseKey,
              user?.id
            );
            
            kisResult.updatedAssets.forEach(ka => {
              const idx = updatedAssets.findIndex(a => a.id === ka.id);
              if (idx !== -1) updatedAssets[idx] = ka;
            });
            if (kisResult.exchangeRate) newRate = kisResult.exchangeRate;
            successMsg = kisResult.dataSource === 'FALLBACK_MOCK' ? "⚠️ 가상 시세 적용됨" : "실시간 시세 갱신 완료";
          }

          if (geminiEligible.length > 0) {
            setPriceUpdateStatus({ api: 'Gemini AI API (펀드/기타)', current: 0, total: geminiEligible.length });
            const geminiResult = await updateAssetPrices(geminiEligible, (c, t) => setPriceUpdateStatus({ api: 'Gemini AI API', current: c, total: t }));
            geminiResult.updatedAssets.forEach(ga => {
              const idx = updatedAssets.findIndex(a => a.id === ga.id);
              if (idx !== -1) updatedAssets[idx] = ga;
            });
            if (geminiResult.exchangeRate) newRate = geminiResult.exchangeRate;
            fetchedItemsCount += geminiResult.fetchedCount;
            successMsg += kisEligible.length > 0 ? ` + AI 갱신(${fetchedItemsCount}종목)` : `AI 갱신 완료 (${fetchedItemsCount}종목 갱신)`;
          }
        } catch (e: any) {
          console.error("KIS Update failed, falling back to Gemini entirely", e);
          showToast(`KIS API 오류: ${e.message}`);
          setPriceUpdateStatus({ api: 'Gemini AI API', current: 0, total: assets.filter(a => a.type !== AssetType.CASH).length });
          const geminiResult = await updateAssetPrices(assets, (c, t) => setPriceUpdateStatus({ api: 'Gemini AI API', current: c, total: t }));
          updatedAssets = geminiResult.updatedAssets;
          if (geminiResult.exchangeRate) newRate = geminiResult.exchangeRate;
          fetchedItemsCount = geminiResult.fetchedCount;
          successMsg = `AI 갱신 완료 (${fetchedItemsCount}종목 갱신)`;
        }
      } else {
        setPriceUpdateStatus({ api: 'Gemini AI API', current: 0, total: assets.filter(a => a.type !== AssetType.CASH).length });
        const result = await updateAssetPrices(assets, (c, t) => setPriceUpdateStatus({ api: 'Gemini AI API', current: c, total: t }));
        updatedAssets = result.updatedAssets;
        if (result.exchangeRate) newRate = result.exchangeRate;
        fetchedItemsCount = result.fetchedCount;
        successMsg = `AI 시세 갱신 완료 (${fetchedItemsCount}종목 갱신)`;
      }
      
      const newLastUpdated = new Date().toLocaleString();
      const totalValue = updatedAssets.reduce((acc, a) => {
        const mult = a.currency === 'USD' ? newRate : 1;
        return acc + (a.currentPrice * a.quantity * mult);
      }, 0);
      
      const today = new Date().toLocaleDateString('en-CA');
      let newHistory = [...history];
      const filteredHistory = newHistory.filter(h => h.date !== today);
      newHistory = [...filteredHistory, { date: today, value: totalValue, exchangeRate: newRate }];

      // 상태 업데이트
      setAssets(updatedAssets); 
      setDynamicExchangeRate(newRate); 
      setLastUpdated(newLastUpdated);
      setHistory(newHistory);
      
      // 사용자별 쿨다운 갱신
      if (user?.id) {
        setLastSyncTimestamp(now);
        localStorage.setItem(`portflow_last_sync_timestamp_${user.id}`, now.toString());
      }

      // 즉시 DB 반영을 위한 AppData 구성
      const latestAppData: AppData = {
        assets: updatedAssets,
        transactions,
        accounts,
        user,
        history: newHistory,
        lastUpdated: newLastUpdated,
        exchangeRate: newRate,
        timestamp: now,
        savedStrategies
      };
      
      // 즉시 클라우드 푸시
      handleSync('FORCE_PUSH', latestAppData);

      const reportMsg = `${successMsg} | 반영: ${updatedAssets.length}건 | 환율: ${newRate.toLocaleString()}원`;
      setKisDebugLog(getLastKisDebugLog());
      showToast(reportMsg);
    } catch (e: any) { 
      showToast(`오류: ${e.message}`); 
    } finally { 
      setIsUpdatingPrices(false); 
      setPriceUpdateStatus(null);
    }
  }, [assets, kisConfig, dynamicExchangeRate, lastSyncTimestamp, transactions, accounts, user, history, savedStrategies, handleSync, showToast]);

  const handleEnrichData = useCallback(async () => {
      if (isEnriching) return;
      const targets = assets.filter(a => !a.ticker || a.ticker.trim() === '' || (a.currency === 'USD' && (!a.exchange || a.exchange.trim() === '')));
      if (targets.length === 0) return showToast("보정할 대상이 없습니다.");
      setEnrichTargets(targets); setIsEnrichModalOpen(true);
  }, [assets, isEnriching, showToast]);

  const handleConfirmEnrichment = useCallback(async () => {
      setIsEnrichModalOpen(false); setIsEnriching(true);
      setEnrichProgress({ current: 0, total: enrichTargets.length });
      let currentAssetsState = [...assets];
      try {
          await enrichAssetData(assets, async (processed, total, updatedChunk) => {
              setEnrichProgress({ current: processed, total });
              updatedChunk.forEach(updated => {
                  const idx = currentAssetsState.findIndex(a => a.id === updated.id);
                  if(idx !== -1) currentAssetsState[idx] = updated;
              });
              setAssets([...currentAssetsState]);
          });
          showToast("자산 정보 보정 완료");
      } catch (e: any) { showToast("실패: " + e.message); } finally { setIsEnriching(false); setEnrichProgress(null); }
  }, [enrichTargets, assets, showToast]);

  const handleSaveAIStrategy = useCallback((data: { type: 'DIAGNOSIS' | 'STRATEGY', name: string, diagnosis?: DiagnosisResponse, strategy?: RebalancingStrategy }) => {
    const newSaved: SavedStrategy = { id: Date.now().toString() + Math.random().toString(36).substr(2, 9), createdAt: Date.now(), name: data.name, diagnosis: data.diagnosis, strategy: data.strategy };
    setSavedStrategies(prev => [newSaved, ...prev]);
    showToast("전략 보관함에 저장되었습니다.");
  }, [showToast]);

  const handleDeleteAIStrategy = useCallback((id: string) => {
    setSavedStrategies(prev => prev.filter(s => s.id !== id));
    showToast("삭제되었습니다.");
  }, [showToast]);

  const handleLogout = async () => { 
    if (isSyncingRef.current) return;
    if (syncConfig.supabaseUrl) await handleSync('FORCE_PUSH');
    setIsAuthenticated(false); setUser(null); localStorage.removeItem('portflow_user');
    setIsSettingsOpen(false); navigate('/'); showToast("로그아웃 되었습니다.");
  };

  const handleSupabaseConnect = async () => {
    const url = inputSupaUrl || SUPABASE_URL, key = inputSupaKey || SUPABASE_KEY;
    if (!url || !key) return showToast("URL과 Key를 입력해주세요.");
    setIsSyncing(true); isSyncingRef.current = true;
    try {
      if (user?.id) await loadUserData(url, key, user.id);
      setSyncConfig(prev => ({ ...prev, supabaseUrl: url, supabaseKey: key, lastSynced: new Date().toLocaleString(), autoSync: true, lastSyncedDataTimestamp: localUpdateTimestamp }));
      setUser(prev => prev ? { ...prev, cloudSync: { supabaseUrl: url, supabaseKey: key } } : null);
      setInputSupaUrl(''); setInputSupaKey(''); showToast("연결 성공. 데이터를 동기화합니다.");
      handleSync('FORCE_PULL');
    } catch (e: any) { showToast(`연결 실패: ${e.message}`); } finally { setIsSyncing(false); isSyncingRef.current = false; }
  };

  if (!isAuthenticated) {
    return <AuthScreen onLoginSuccess={(u) => { 
      setUser(u); setIsAuthenticated(true); 
      const url = u.cloudSync?.supabaseUrl || SUPABASE_URL, key = u.cloudSync?.supabaseKey || SUPABASE_KEY;
      if(url && key) setSyncConfig(p => ({ ...p, supabaseUrl: url, supabaseKey: key, autoSync: true }));
      navigate('/');
    }} />;
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#F4F7FB] overflow-hidden max-w-md mx-auto shadow-2xl relative font-sans">
      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        <Routes>
          <Route path="/" element={<Dashboard assets={assets} accounts={accounts} transactions={transactions} user={user} history={history} onRefresh={handleUpdatePrices} isUpdating={isUpdatingPrices} updateStatus={priceUpdateStatus} lastUpdated={lastUpdated} exchangeRate={dynamicExchangeRate} marketBriefing={marketBriefing} onUpdateBriefing={handleUpdateBriefing} />} />
          <Route path="/assets" element={<AssetList assets={assets} setAssets={setAssets} onAddAsset={() => setIsManualModalOpen(true)} onDeleteAsset={(id) => setDeletingAsset(assets.find(a=>a.id===id)||null)} onEditAsset={(a) => { setEditingAsset(a); setIsManualModalOpen(true); }} onSync={() => handleSync('SMART')} onRefreshPrices={handleUpdatePrices} isRefreshing={isUpdatingPrices} exchangeRate={dynamicExchangeRate} accounts={accounts} />} />
          <Route path="/advisor" element={<AIAdvisor assets={assets} accounts={accounts} onApplyRebalancing={() => {}} exchangeRate={dynamicExchangeRate} user={user} onUpdateUser={setUser} savedStrategies={savedStrategies} onSaveStrategy={handleSaveAIStrategy} onDeleteStrategy={handleDeleteAIStrategy} showToast={showToast} />} />
          <Route path="/history" element={<TransactionHistory transactions={transactions} accounts={accounts} onDelete={handleDeleteTransaction} onEdit={(tx) => { setEditingTransaction(tx); setIsTransactionModalOpen(true); }} onUpdate={performDataUpdateAndSync} onAdd={() => setIsTransactionModalOpen(true)} exchangeRate={dynamicExchangeRate} />} />
          <Route path="/analytics" element={<AnalyticsView history={history} assets={assets} exchangeRate={dynamicExchangeRate} />} />
          <Route path="/accounts" element={<AccountManager accounts={accounts} setAccounts={setAccounts} assets={assets} exchangeRate={dynamicExchangeRate} />} />
        </Routes>
      </main>

      {isManualModalOpen && <ManualAssetEntry onClose={() => { setIsManualModalOpen(false); setEditingAsset(undefined); }} onSave={handleSaveAsset} asset={editingAsset} accounts={accounts} exchangeRate={dynamicExchangeRate} />}
      {isTransactionModalOpen && <ManualTransactionEntry onClose={() => { setIsTransactionModalOpen(false); setEditingTransaction(undefined); }} onSave={handleSaveTransaction} transaction={editingTransaction} assets={assets} accounts={accounts} exchangeRate={dynamicExchangeRate} />}
      {deletingAsset && <DeleteConfirmModal asset={deletingAsset} onClose={() => setDeletingAsset(null)} onConfirm={() => { setAssets(prev => prev.filter(a => a.id !== deletingAsset.id)); setDeletingAsset(null); }} />}
      {isEnrichModalOpen && <EnrichmentModal targets={enrichTargets} onClose={() => setIsEnrichModalOpen(false)} onConfirm={handleConfirmEnrichment} />}

      <nav className="h-20 bg-white/90 backdrop-blur-xl border-t border-slate-100 flex items-center justify-around px-2 pb-safe shadow-top shrink-0 relative z-40">
        <NavLink to="/" icon={<Home size={22} />} label="홈" />
        <NavLink to="/assets" icon={<Wallet size={22} />} label="자산" />
        <NavLink to="/history" icon={<History size={22} />} label="거래" />
        <NavLink to="/advisor" icon={<Cpu size={22} />} label="AI 비서" />
        <NavLink to="/analytics" icon={<LineChart size={22} />} label="분석" />
        <button onClick={() => setIsSettingsOpen(true)} className="flex flex-col items-center gap-1.5 pb-1 text-slate-300 relative">
          <Settings size={22} />
          <span className="text-[9px] font-black uppercase">설정</span>
          {isDirty && <div className="absolute top-0 right-2 w-2 h-2 bg-indigo-600 rounded-full border-2 border-white animate-pulse"></div>}
        </button>
      </nav>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)}></div>
          <div className="relative w-80 bg-white h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col pt-safe">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div><h3 className="text-xl font-black text-slate-800">설정</h3><p className="text-[10px] font-black text-indigo-600 uppercase mt-0.5">Configuration</p></div>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 bg-slate-50 rounded-xl text-slate-400"><X size={20}/></button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8 pb-safe">
              <section className="space-y-4">
                 <div className="flex items-center justify-between"><h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2"><Zap size={14} className="text-amber-500" /> 실시간 시세 연동</h4><button onClick={() => setKisConfig(p => ({ ...p, useKis: !p.useKis }))} className={`w-10 h-6 rounded-full p-1 transition-all ${kisConfig.useKis ? 'bg-indigo-600' : 'bg-slate-200'}`}><div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-all ${kisConfig.useKis ? 'translate-x-4' : ''}`}></div></button></div>
                 {kisConfig.useKis && <div className="bg-slate-50 p-5 rounded-[2rem] border border-slate-100 space-y-4 animate-in slide-in-from-top-2"><div className="bg-white p-1 rounded-xl flex shadow-sm border border-slate-200"><button onClick={() => setKisConfig(p => ({ ...p, serverType: 'REAL' }))} className={`flex-1 py-2 text-[10px] font-black rounded-lg ${kisConfig.serverType !== 'VIRTUAL' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>실전투자</button><button onClick={() => setKisConfig(p => ({ ...p, serverType: 'VIRTUAL' }))} className={`flex-1 py-2 text-[10px] font-black rounded-lg ${kisConfig.serverType === 'VIRTUAL' ? 'bg-amber-500 text-white' : 'text-slate-400'}`}>모의투자</button></div><input type="text" value={kisConfig.appKey} onChange={e => setKisConfig(p => ({ ...p, appKey: e.target.value }))} placeholder="App Key" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" /><input type="text" value={kisConfig.appSecret} onChange={e => setKisConfig(p => ({ ...p, appSecret: e.target.value }))} placeholder="App Secret" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" /></div>}
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                   <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2"><CloudCog size={14} className="text-indigo-400" /> Supabase 클라우드 동기화</h4>
                   {isSyncing ? <Loader2 size={14} className="animate-spin text-indigo-500" /> : isDirty ? <CloudUpload size={14} className="text-indigo-500 animate-bounce" /> : <CloudCheck size={14} className="text-emerald-500" />}
                </div>
                <div className="bg-slate-50 p-5 rounded-[2rem] border border-slate-100 space-y-4">
                  {(syncConfig.supabaseUrl || SUPABASE_URL) ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3"><div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center"><CheckCircle2 size={20}/></div><div><p className="text-xs font-black text-slate-800">동기화 활성화됨</p><p className="text-[9px] font-bold text-slate-400">{(syncConfig.supabaseUrl || SUPABASE_URL).substring(0, 20)}...</p></div></div>
                      <div className="grid grid-cols-2 gap-2"><button onClick={() => handleSync('FORCE_PUSH')} disabled={isSyncing} className="py-2.5 bg-white border border-slate-200 text-indigo-600 rounded-xl text-[10px] font-black hover:bg-indigo-50">지금 올리기</button><button onClick={() => handleSync('FORCE_PULL')} disabled={isSyncing} className="py-2.5 bg-white border border-slate-200 text-indigo-600 rounded-xl text-[10px] font-black hover:bg-indigo-50">지금 내리기</button></div>
                    </div>
                  ) : (
                    <div className="space-y-3"><input type="text" placeholder="Project URL" value={inputSupaUrl} onChange={e => setInputSupaUrl(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" /><input type="password" placeholder="Anon Key" value={inputSupaKey} onChange={e => setInputSupaKey(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" /><button onClick={handleSupabaseConnect} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg">연결 저장</button></div>
                  )}
                </div>
              </section>

              <section className="space-y-2">
                <button onClick={() => setIsLegacyMigrationOpen(!isLegacyMigrationOpen)} className="w-full flex items-center justify-between px-1"><h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FileJson size={14} className="text-amber-500" /> Legacy Migration (JSONBin)</h4>{isLegacyMigrationOpen ? <ChevronUp size={14} className="text-slate-300"/> : <ChevronDown size={14} className="text-slate-300"/>}</button>
                {isLegacyMigrationOpen && <div className="bg-amber-50 p-5 rounded-[2rem] border border-amber-100 space-y-3 animate-in slide-in-from-top-2"><p className="text-[9px] font-bold text-amber-700">이전 데이터를 LocalStorage로 내립니다. 이후 'Supabase 올리기'를 실행하세요.</p><input type="text" placeholder="Bin ID" value={inputLegacyBinId} onChange={e => setInputLegacyBinId(e.target.value)} className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500" /><input type="password" placeholder="API Key" value={inputLegacyApiKey} onChange={e => setInputLegacyApiKey(e.target.value)} className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500" /><button onClick={handleLegacyPull} disabled={isSyncing} className="w-full py-3 bg-white border border-amber-200 text-amber-600 rounded-xl text-[10px] font-black">JSONBin 데이터 내리기</button></div>}
              </section>

              <section className="space-y-2">
                <button onClick={() => { setIsKisDebugOpen(!isKisDebugOpen); setKisDebugLog(getLastKisDebugLog()); }} className="w-full flex items-center justify-between px-1"><h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Zap size={14} className="text-amber-500" /> KIS API 디버그 로그</h4>{isKisDebugOpen ? <ChevronUp size={14} className="text-slate-300"/> : <ChevronDown size={14} className="text-slate-300"/>}</button>
                {isKisDebugOpen && (
                  <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-3 animate-in slide-in-from-top-2 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-slate-500 uppercase">Last Request Info</p>
                      <button onClick={() => setKisDebugLog(getLastKisDebugLog())} className="text-[9px] font-black text-indigo-400 hover:text-indigo-300">새로고침</button>
                    </div>
                    {kisDebugLog ? (
                      <div className="space-y-3 text-[10px] font-mono">
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${kisDebugLog.env === 'REAL' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {kisDebugLog.env} ENVIRONMENT
                          </span>
                          <span className="text-slate-500">{new Date(kisDebugLog.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="space-y-1">
                          <p className="text-emerald-400 font-bold">[{kisDebugLog.method}] URL</p>
                          <div className="text-slate-300 break-all bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                            {kisDebugLog.url}
                          </div>
                          <p className="text-slate-400 mt-1">Status: <span className={kisDebugLog.status >= 400 ? 'text-rose-400' : 'text-emerald-400'}>{kisDebugLog.status}</span></p>
                        </div>
                        {Object.keys(kisDebugLog.queryParams).length > 0 && (
                          <div className="space-y-1">
                            <p className="text-indigo-400 font-bold">Query Parameters:</p>
                            <pre className="text-slate-300 whitespace-pre-wrap break-all bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">{JSON.stringify(kisDebugLog.queryParams, null, 2)}</pre>
                          </div>
                        )}
                        <div className="space-y-1">
                          <p className="text-indigo-400 font-bold">Headers:</p>
                          <pre className="text-slate-300 whitespace-pre-wrap break-all bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">{JSON.stringify(kisDebugLog.headers, null, 2)}</pre>
                        </div>
                        {kisDebugLog.body && (
                          <div className="space-y-1">
                            <p className="text-indigo-400 font-bold">Body:</p>
                            <pre className="text-slate-300 whitespace-pre-wrap break-all bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">{typeof kisDebugLog.body === 'string' ? kisDebugLog.body : JSON.stringify(kisDebugLog.body, null, 2)}</pre>
                          </div>
                        )}
                        <div className="space-y-1">
                          <p className="text-amber-400 font-bold">Response:</p>
                          <pre className="text-slate-300 whitespace-pre-wrap break-all bg-slate-800/50 p-2 rounded-lg border border-slate-700/50 max-h-40 overflow-y-auto">{JSON.stringify(kisDebugLog.response, null, 2)}</pre>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] font-bold text-slate-600 italic py-4 text-center">로그가 없습니다. 시세 갱신을 실행하세요.</p>
                    )}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <button onClick={() => setIsLocalDataOpen(!isLocalDataOpen)} className="w-full flex items-center justify-between px-1"><h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Database size={14} className="text-indigo-400" /> 로컬 데이터 관리</h4>{isLocalDataOpen ? <ChevronUp size={14} className="text-slate-300"/> : <ChevronDown size={14} className="text-slate-300"/>}</button>
                {isLocalDataOpen && <div className="space-y-4 animate-in slide-in-from-top-2"><div className="grid grid-cols-2 gap-3"><button onClick={() => { const blob = new Blob([JSON.stringify(getCurrentAppData(), null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'portflow_backup.json'; link.click(); }} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center gap-2 hover:bg-white transition-all"><Download size={18} className="text-indigo-500" /><span className="text-[10px] font-black">내보내기</span></button><button onClick={() => fileInputRef.current?.click()} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center gap-2 hover:bg-white transition-all"><Upload size={18} className="text-indigo-500" /><span className="text-[10px] font-black">불러오기</span></button></div><button onClick={handleEnrichData} disabled={isEnriching} className="w-full p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center gap-2">{isEnriching ? <Loader2 size={18} className="animate-spin text-indigo-600" /> : <Sparkles size={18} className="text-indigo-600" />}<span className="text-[10px] font-black text-indigo-700">자산 정보 자동 보정 (Ticker)</span></button><input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={e => { const file = e.target.files?.[0]; if(!file)return; const reader = new FileReader(); reader.onload = (ev) => { try { const data = JSON.parse(ev.target?.result as string); if(window.confirm("데이터를 복원하시겠습니까?")) applyAppData(data); } catch { showToast("유효하지 않은 파일"); } }; reader.readAsText(file); }} /></div>}
              </section>

              <section className="space-y-3 pt-4 border-t border-slate-100"><button onClick={handleLogout} className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all"><LogOut size={16} /> 로그아웃</button><button onClick={() => { if(window.confirm("초기화하시겠습니까?")) { localStorage.clear(); window.location.reload(); } }} className="w-full py-4 bg-rose-50 text-rose-500 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all"><Trash2 size={16} /> 전체 초기화</button></section>
            </div>
            <div className="p-8 border-t border-slate-50 bg-slate-50 flex flex-col gap-2 pb-safe text-center"><p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">PortFlow Mobile</p><p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">v2.3.1 (Atomic Sync Enabled)</p></div>
          </div>
        </div>
      )}

      {toast && <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[300] bg-slate-900 text-white px-6 py-3 rounded-2xl text-xs font-black shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-2"><Sparkles size={16} className="text-indigo-400" /> {toast}</div>}
    </div>
  );
};

const App: React.FC = () => <HashRouter><AppContent /></HashRouter>;
export default App;
