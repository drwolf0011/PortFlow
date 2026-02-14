
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
const { HashRouter, Routes, Route, Link, useLocation, useNavigate } = ReactRouterDOM;
import { 
  Home, Wallet, LineChart, Cpu, PlusCircle, Settings,
  CheckCircle2, LogOut, RotateCcw, X,
  History, Download, Upload, Trash2, Database, ChevronRight,
  Globe, CreditCard, Loader2, CloudCog, Cloud, Sparkles, ArrowRightLeft,
  Zap, AlertTriangle
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
import { EXCHANGE_RATE as DEFAULT_EXCHANGE_RATE, CLOUD_MASTER_KEY } from './constants';
import { Asset, Transaction, TransactionType, AssetType, Account, SyncConfig, AppData, RebalancingStrategy, UserProfile, DiagnosisResponse, SavedStrategy, AccountType, KisConfig } from './types';
import { updateAssetPrices, enrichAssetData } from './services/geminiService';
import { updateAssetsWithKis } from './services/kisService';
import { createBin, updateBin, readBin } from './services/storageService';
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
  const [history, setHistory] = useState<{date: string, value: number}[]>(() => {
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
    const saved = localStorage.getItem('portflow_exchange_rate');
    return saved ? parseFloat(saved) : DEFAULT_EXCHANGE_RATE;
  });
  const [lastUpdated, setLastUpdated] = useState<string>(() => localStorage.getItem('portflow_last_updated') || '-');
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategy[]>(() => {
    try {
      const saved = localStorage.getItem('portflow_saved_strategies');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => {
    try {
      const saved = localStorage.getItem('portflow_sync_config');
      return saved ? JSON.parse(saved) : { apiKey: '', binId: '', lastSynced: '', autoSync: false };
    } catch (e) { return { apiKey: '', binId: '', lastSynced: '', autoSync: false }; }
  });

  const [kisConfig, setKisConfig] = useState<KisConfig>(() => {
    try {
      const saved = localStorage.getItem('portflow_kis_config');
      return saved ? JSON.parse(saved) : { useKis: false, serverType: 'REAL', appKey: '', appSecret: '', accountNo: '' };
    } catch (e) { return { useKis: false, serverType: 'REAL', appKey: '', appSecret: '', accountNo: '' }; }
  });

  const [localUpdateTimestamp, setLocalUpdateTimestamp] = useState<number>(() => Date.now());

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
  const [isSyncing, setIsSyncing] = useState(false);
  // Ref for immediate guard against double clicks
  const isSyncingRef = useRef(false);
  const [inputApiKey, setInputApiKey] = useState('');
  const [inputBinId, setInputBinId] = useState('');
  
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{current: number, total: number} | null>(null);
  
  // Enrichment Modal State
  const [enrichTargets, setEnrichTargets] = useState<Asset[]>([]);
  const [isEnrichModalOpen, setIsEnrichModalOpen] = useState(false);

  const showToast = useCallback((msg: string) => {
    triggerHaptic('light');
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- Persistence Hooks ---
  useEffect(() => { 
    localStorage.setItem('portflow_assets', JSON.stringify(assets));
    setLocalUpdateTimestamp(Date.now());
  }, [assets]);

  useEffect(() => { 
    localStorage.setItem('portflow_transactions', JSON.stringify(transactions));
    setLocalUpdateTimestamp(Date.now());
  }, [transactions]);

  useEffect(() => { 
    localStorage.setItem('portflow_accounts', JSON.stringify(accounts));
    setLocalUpdateTimestamp(Date.now());
  }, [accounts]);

  useEffect(() => { 
    localStorage.setItem('portflow_saved_strategies', JSON.stringify(savedStrategies));
    setLocalUpdateTimestamp(Date.now());
  }, [savedStrategies]);

  useEffect(() => { localStorage.setItem('portflow_history', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('portflow_sync_config', JSON.stringify(syncConfig)); }, [syncConfig]);
  useEffect(() => { localStorage.setItem('portflow_kis_config', JSON.stringify(kisConfig)); }, [kisConfig]);
  useEffect(() => { localStorage.setItem('portflow_user', JSON.stringify(user)); }, [user]);
  useEffect(() => { localStorage.setItem('portflow_exchange_rate', dynamicExchangeRate.toString()); }, [dynamicExchangeRate]);
  useEffect(() => { localStorage.setItem('portflow_last_updated', lastUpdated); }, [lastUpdated]);

  const recalculateAssets = useCallback((txs: Transaction[], currentAssets: Asset[]) => {
    const groups: Record<string, Transaction[]> = {};
    txs.forEach(t => {
      const key = `${t.name}|${t.institution}|${t.accountId || 'none'}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    const assetMetaMap: Record<string, Asset> = {};
    currentAssets.forEach(a => {
      assetMetaMap[`${a.name}|${a.institution}|${a.accountId || 'none'}`] = a;
    });
    const newAssets: Asset[] = [];
    Object.entries(groups).forEach(([key, groupTxs]) => {
      const meta = assetMetaMap[key];
      const [name, inst, accId] = key.split('|');
      let totalQty = 0;
      let totalCostKRW = 0; 
      let totalCostUSD = 0; 
      const sortedTxs = [...groupTxs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      const linkedAccount = accId !== 'none' ? accounts.find(a => a.id === accId) : null;

      sortedTxs.forEach(tx => {
        const effectiveRate = tx.currency === 'USD' ? (tx.exchangeRate || dynamicExchangeRate) : 1;
        const txPriceKRW = tx.price * effectiveRate;
        if (tx.type === TransactionType.BUY) {
          totalCostKRW += (tx.quantity * txPriceKRW);
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
        newAssets.push({
          id: meta?.id || Math.random().toString(36).substr(2, 9),
          name,
          institution: inst,
          ticker: meta?.ticker || (sortedTxs[0].assetType === AssetType.STOCK ? name : undefined),
          exchange: meta?.exchange,
          type: meta?.type || sortedTxs[0].assetType,
          quantity: totalQty,
          purchasePrice: totalCostUSD / totalQty,
          purchasePriceKRW: totalCostKRW / totalQty,
          currentPrice: meta?.currentPrice || sortedTxs[sortedTxs.length - 1].price,
          currency: sortedTxs[0].currency,
          accountId: accId === 'none' ? undefined : accId,
          managementType: linkedAccount?.type || meta?.managementType || sortedTxs[0].managementType || AccountType.GENERAL
        });
      }
    });
    return newAssets;
  }, [dynamicExchangeRate, accounts]);

  const getCurrentAppData = useCallback((): AppData => {
    return {
      assets, transactions, accounts, user, history, lastUpdated, 
      exchangeRate: dynamicExchangeRate, 
      timestamp: localUpdateTimestamp,
      savedStrategies
    };
  }, [assets, transactions, accounts, user, history, lastUpdated, dynamicExchangeRate, localUpdateTimestamp, savedStrategies]);

  const applyAppData = useCallback((data: AppData) => {
    if (!data) return;
    const incomingTxs = Array.isArray(data.transactions) ? data.transactions : [];
    const syncedAssets = recalculateAssets(incomingTxs, Array.isArray(data.assets) ? data.assets : []);
    
    setTransactions(incomingTxs);
    setAssets(syncedAssets);
    if (Array.isArray(data.accounts)) setAccounts([...data.accounts]);
    if (Array.isArray(data.history)) setHistory([...data.history]);
    
    if (Array.isArray(data.savedStrategies)) {
      setSavedStrategies(data.savedStrategies);
    }

    if (data.user) setUser({ ...data.user });
    if (data.lastUpdated) setLastUpdated(data.lastUpdated);
    if (data.exchangeRate) setDynamicExchangeRate(data.exchangeRate);
    setLocalUpdateTimestamp(data.timestamp || Date.now());
  }, [recalculateAssets]);

  const handleSync = useCallback(async (mode: 'AUTO' | 'FORCE_PUSH' | 'FORCE_PULL' | 'SMART' = 'SMART') => {
    // Guard clause: Check ref to see if sync is already in progress
    if (isSyncingRef.current) return;
    if (!syncConfig.apiKey || !syncConfig.binId) return;
    
    // Set lock
    isSyncingRef.current = true;
    setIsSyncing(true);
    
    if (mode !== 'AUTO') triggerHaptic('medium');
    
    try {
      const localData = getCurrentAppData();
      if (mode === 'FORCE_PUSH') {
        await updateBin(syncConfig.apiKey, syncConfig.binId, localData);
        const now = new Date().toLocaleString();
        setSyncConfig(prev => ({ ...prev, lastSynced: now, lastSyncedDataTimestamp: localData.timestamp }));
        showToast("클라우드에 데이터를 덮어썼습니다.");
        triggerHaptic('success');
        return;
      }
      const cloudData = await readBin(syncConfig.apiKey, syncConfig.binId);
      if (mode === 'FORCE_PULL') {
        applyAppData(cloudData);
        const now = new Date().toLocaleString();
        setSyncConfig(prev => ({ ...prev, lastSynced: now, lastSyncedDataTimestamp: cloudData.timestamp }));
        showToast("클라우드 데이터를 불러왔습니다.");
        triggerHaptic('success');
        return;
      }
      const localTime = localData.timestamp;
      const cloudTime = cloudData.timestamp || 0;
      const lastSyncedTime = syncConfig.lastSyncedDataTimestamp || 0;
      if (cloudTime > localTime && cloudTime > lastSyncedTime) {
        if (mode === 'AUTO') {
          applyAppData(cloudData);
          setSyncConfig(prev => ({ ...prev, lastSynced: new Date().toLocaleString(), lastSyncedDataTimestamp: cloudTime }));
        } else if (window.confirm("클라우드에 새로운 데이터가 있습니다. 불러오시겠습니까?")) {
          applyAppData(cloudData);
          setSyncConfig(prev => ({ ...prev, lastSynced: new Date().toLocaleString(), lastSyncedDataTimestamp: cloudTime }));
          showToast("최신 데이터를 불러왔습니다.");
          triggerHaptic('success');
        }
      } else if (localTime > cloudTime && localTime > lastSyncedTime) {
        await updateBin(syncConfig.apiKey, syncConfig.binId, localData);
        setSyncConfig(prev => ({ ...prev, lastSynced: new Date().toLocaleString(), lastSyncedDataTimestamp: localTime }));
        if (mode !== 'AUTO') {
          showToast("클라우드 백업 완료");
          triggerHaptic('success');
        }
      } else if (mode !== 'AUTO') {
        showToast("데이터가 최신 상태입니다.");
        triggerHaptic('light');
      }
    } catch (e: any) {
      console.error(e);
      if (mode !== 'AUTO') {
        showToast(`동기화 오류: ${e.message}`);
        triggerHaptic('error');
      }
    } finally {
      // Release lock
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [syncConfig, getCurrentAppData, applyAppData, showToast]);

  // 로그인 성공 1초 후 클라우드에서 최신 데이터를 자동으로 가져오는 로직
  useEffect(() => {
    if (isAuthenticated && syncConfig.binId && syncConfig.apiKey) {
      const autoSyncTimer = setTimeout(() => {
        handleSync('FORCE_PULL');
      }, 1000);
      return () => clearTimeout(autoSyncTimer);
    }
  }, [isAuthenticated]);

  const handleUpdatePrices = useCallback(async () => {
    if (assets.length === 0) {
      showToast("갱신할 자산이 없습니다.");
      return;
    }
    setIsUpdatingPrices(true);
    triggerHaptic('medium');
    try {
      let updatedAssets = assets;
      let newRate = dynamicExchangeRate;
      let successMsg = "시세가 갱신되었습니다.";

      // KIS API 우선 시도 (설정 활성화 시)
      if (kisConfig.useKis && kisConfig.appKey && kisConfig.appSecret) {
        try {
          const modeLabel = kisConfig.serverType === 'VIRTUAL' ? '모의투자' : '실전투자';
          showToast(`한국투자증권(${modeLabel}) API로 실시간 시세를 조회합니다...`);
          
          const kisResult = await updateAssetsWithKis(assets, kisConfig);
          updatedAssets = kisResult.updatedAssets;
          if (kisResult.exchangeRate) newRate = kisResult.exchangeRate;
          
          if (kisResult.dataSource === 'FALLBACK_MOCK') {
             successMsg = "⚠️ 브라우저 보안 정책으로 인해 가상 시세(Mock)가 적용되었습니다.";
          } else {
             successMsg = `${modeLabel} 실시간 시세 갱신 완료`;
          }
        } catch (kisError: any) {
          console.error("KIS API Error:", kisError);
          showToast(`KIS 연동 실패: ${kisError.message}. AI 모드로 전환합니다.`);
          // Fallback to Gemini
          const geminiResult = await updateAssetPrices(assets);
          updatedAssets = geminiResult.updatedAssets;
          if (geminiResult.exchangeRate) newRate = geminiResult.exchangeRate;
          successMsg = "AI 시세 추정 완료 (Fallback)";
        }
      } else {
        // Gemini API 사용
        showToast("AI가 시세를 분석하고 있습니다...");
        const result = await updateAssetPrices(assets);
        updatedAssets = result.updatedAssets;
        if (result.exchangeRate) newRate = result.exchangeRate;
        successMsg = "AI 시세 추정 완료";
      }

      setAssets(updatedAssets);
      setDynamicExchangeRate(newRate);
      setLastUpdated(new Date().toLocaleString());
      showToast(successMsg);
      triggerHaptic('success');
    } catch (e: any) {
      console.error(e);
      showToast(`시세 갱신 오류: ${e.message}`);
      triggerHaptic('error');
    } finally {
      setIsUpdatingPrices(false);
    }
  }, [assets, kisConfig, dynamicExchangeRate, showToast]);

  const handleEnrichData = useCallback(async () => {
      if (isEnriching) return;
      // Filter Logic Update: Check for missing ticker OR (USD asset with missing exchange OR empty whitespace)
      const targets = assets.filter(a => 
        !a.ticker || a.ticker.trim() === '' || 
        (a.currency === 'USD' && (!a.exchange || a.exchange.trim() === ''))
      );
      
      if (targets.length === 0) {
          showToast("보정이 필요한 자산 정보가 없습니다.");
          return;
      }
      
      setEnrichTargets(targets);
      setIsEnrichModalOpen(true);
      triggerHaptic('medium');
  }, [assets, isEnriching, showToast]);

  const handleConfirmEnrichment = useCallback(async () => {
      setIsEnrichModalOpen(false);
      setIsEnriching(true);
      setEnrichProgress({ current: 0, total: enrichTargets.length });
      showToast("AI가 자산 정보를 보정하고 있습니다...");
      
      // Use a local mutable variable to track state across callbacks
      let currentAssetsState = [...assets];

      try {
          // Note: enrichAssetData calls this callback for each chunk processed
          await enrichAssetData(assets, async (processed, total, updatedChunk) => {
              setEnrichProgress({ current: processed, total });
              
              // 1. Update local reference with the new chunk data
              updatedChunk.forEach(updated => {
                  const index = currentAssetsState.findIndex(a => a.id === updated.id);
                  if(index !== -1) currentAssetsState[index] = updated;
              });

              // 2. Update React State to reflect UI changes
              setAssets([...currentAssetsState]);
              
              // 3. Force Cloud Sync after each batch
              if (syncConfig.apiKey && syncConfig.binId) {
                  try {
                      // Prepare data payload using the updated local reference
                      const currentData = getCurrentAppData();
                      currentData.assets = currentAssetsState;
                      currentData.timestamp = Date.now();
                      
                      // Wait for sync to complete before processing next chunk
                      await updateBin(syncConfig.apiKey, syncConfig.binId, currentData);
                      showToast(`중간 저장 완료 (${processed}/${total})`);
                  } catch (e) {
                      console.warn("Intermediate Cloud Save Failed:", e);
                  }
              }
          });

          showToast("자산 정보 보정이 완료되었습니다.");
          triggerHaptic('success');
      } catch (e: any) {
          console.error(e);
          showToast("보정 실패: " + e.message);
          triggerHaptic('error');
      } finally {
          setIsEnriching(false);
          setEnrichProgress(null);
      }
  }, [enrichTargets, assets, showToast, syncConfig, getCurrentAppData]);

  const handleSaveAIStrategy = useCallback((data: { 
    type: 'DIAGNOSIS' | 'STRATEGY', 
    name: string, 
    diagnosis?: DiagnosisResponse, 
    strategy?: RebalancingStrategy 
  }) => {
    try {
      const newSaved: SavedStrategy = { 
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        createdAt: Date.now(), 
        name: data.name,
        diagnosis: data.diagnosis ? JSON.parse(JSON.stringify(data.diagnosis)) : undefined,
        strategy: data.strategy ? JSON.parse(JSON.stringify(data.strategy)) : undefined  
      };
      
      setSavedStrategies(prev => [newSaved, ...prev]);
      showToast("전략 보관함에 저장되었습니다.");
      triggerHaptic('success');
    } catch (error: any) {
      console.error("Save AI Strategy failed:", error);
      showToast(`저장 실패: ${error.message || '알 수 없는 오류'}`);
      triggerHaptic('error');
    }
  }, [showToast]);

  const handleDeleteAIStrategy = useCallback((id: string) => {
    setSavedStrategies(prev => prev.filter(s => s.id !== id));
    showToast("보관함에서 삭제되었습니다.");
    triggerHaptic('medium');
  }, [showToast]);

  const handleSaveAsset = useCallback((asset: Asset) => {
    setAssets(prev => {
      const exists = prev.find(a => a.id === asset.id);
      if (exists) {
        return prev.map(a => a.id === asset.id ? asset : a);
      }
      return [...prev, asset];
    });
    setIsManualModalOpen(false);
    setEditingAsset(undefined);
    showToast("자산 정보가 저장되었습니다.");
    triggerHaptic('success');
  }, [showToast]);

  const handleSaveTransaction = useCallback((tx: Transaction) => {
    setTransactions(prev => {
      const exists = prev.find(t => t.id === tx.id);
      let next;
      if (exists) {
        next = prev.map(t => t.id === tx.id ? tx : t);
      } else {
        next = [...prev, tx];
      }
      setAssets(recalculateAssets(next, assets));
      return next;
    });
    setIsTransactionModalOpen(false);
    setEditingTransaction(undefined);
    showToast("거래 내역이 기록되었습니다.");
    triggerHaptic('success');
  }, [assets, recalculateAssets, showToast]);

  const handleDeleteAsset = useCallback((id: string) => {
    const asset = assets.find(a => a.id === id);
    if (asset) {
      setDeletingAsset(asset);
      triggerHaptic('medium');
    }
  }, [assets]);

  const confirmDeleteAsset = useCallback(() => {
    if (!deletingAsset) return;
    setAssets(prev => prev.filter(a => a.id !== deletingAsset.id));
    setTransactions(prev => prev.filter(t => t.name !== deletingAsset.name || t.institution !== deletingAsset.institution || t.accountId !== deletingAsset.accountId));
    setDeletingAsset(null);
    showToast("자산 및 관련 거래가 삭제되었습니다.");
    triggerHaptic('medium');
  }, [deletingAsset, showToast]);

  const handleDeleteTransaction = useCallback((id: string) => {
    setTransactions(prev => {
      const next = prev.filter(t => t.id !== id);
      setAssets(recalculateAssets(next, assets));
      return next;
    });
    showToast("거래 내역이 삭제되었습니다.");
    triggerHaptic('medium');
  }, [assets, recalculateAssets, showToast]);

  const handleExportData = () => {
    try {
      const data = getCurrentAppData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `portflow_backup_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      showToast("백업 파일이 생성되었습니다.");
      triggerHaptic('success');
    } catch (e) { showToast("파일 생성 실패"); }
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (window.confirm("데이터를 복원하시겠습니까? (현재 데이터는 교체됩니다)")) {
          applyAppData(data);
          showToast("데이터 복원 완료");
          triggerHaptic('success');
          setIsSettingsOpen(false);
        }
      } catch (err) { showToast("유효하지 않은 파일입니다."); }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleCloudLogin = async () => {
    if (!inputApiKey) return showToast("API Key를 입력해주세요.");
    if (isSyncingRef.current) return;
    setIsSyncing(true);
    isSyncingRef.current = true;
    try {
      let binId = inputBinId;
      if (!binId) {
        binId = await createBin(inputApiKey, getCurrentAppData());
        showToast("새 클라우드 저장소가 생성되었습니다.");
      } else {
        const cloudData = await readBin(inputApiKey, binId);
        applyAppData(cloudData);
        showToast("클라우드 데이터를 성공적으로 불러왔습니다.");
      }
      const newConfig = { 
        apiKey: inputApiKey, 
        binId, 
        lastSynced: new Date().toLocaleString(), 
        autoSync: true,
        lastSyncedDataTimestamp: localUpdateTimestamp 
      };
      setSyncConfig(newConfig);
      setUser(prev => prev ? { ...prev, cloudSync: { apiKey: inputApiKey, binId: binId } } : null);
      setInputApiKey(''); setInputBinId('');
      setIsSettingsOpen(false);
      triggerHaptic('success');
    } catch (e: any) { showToast(`연동 실패: ${e.message}`); triggerHaptic('error'); } 
    finally { 
      setIsSyncing(false); 
      isSyncingRef.current = false;
    }
  };

  const handleLogout = async () => { 
    if (isSyncingRef.current) return;
    if (syncConfig.apiKey && syncConfig.binId) {
      showToast("클라우드 백업을 진행 중입니다...");
      try {
        await handleSync('FORCE_PUSH');
      } catch (error) {
        console.error("Logout backup failed", error);
      }
    }

    setIsAuthenticated(false); 
    setUser(null);
    localStorage.removeItem('portflow_user');
    setIsSettingsOpen(false); 
    navigate('/'); 
    showToast("로그아웃 되었습니다."); 
    triggerHaptic('medium');
  };
  
  const handleClearData = () => {
    if (window.confirm("모든 데이터를 초기화하시겠습니까? 로컬 저장소가 비워지며 복구할 수 없습니다.")) {
      localStorage.clear();
      triggerHaptic('heavy');
      window.location.reload();
    }
  };
  
  const handleUpdateUser = (u: UserProfile) => { 
    setUser(u); 
    setLocalUpdateTimestamp(Date.now()); 
  };

  if (!isAuthenticated) {
    return <AuthScreen onLoginSuccess={(u) => { 
      setUser(u); 
      setIsAuthenticated(true); 
      if(u.dataBinId) setSyncConfig(p => ({...p, apiKey: CLOUD_MASTER_KEY, binId: u.dataBinId, autoSync: true}));
      navigate('/');
    }} />;
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#F4F7FB] overflow-hidden max-w-md mx-auto shadow-2xl relative font-sans">
      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        <Routes>
          <Route path="/" element={<Dashboard assets={assets} accounts={accounts} transactions={transactions} user={user} history={history} onRefresh={handleUpdatePrices} isUpdating={isUpdatingPrices} lastUpdated={lastUpdated} exchangeRate={dynamicExchangeRate} />} />
          <Route path="/assets" element={<AssetList assets={assets} setAssets={setAssets} onAddAsset={() => { setIsManualModalOpen(true); triggerHaptic('medium'); }} onDeleteAsset={handleDeleteAsset} onEditAsset={(a) => { setEditingAsset(a); setIsManualModalOpen(true); triggerHaptic('light'); }} onSync={() => handleSync('SMART')} onRefreshPrices={handleUpdatePrices} isRefreshing={isUpdatingPrices} exchangeRate={dynamicExchangeRate} accounts={accounts} />} />
          <Route path="/advisor" element={<AIAdvisor assets={assets} accounts={accounts} onApplyRebalancing={() => {}} exchangeRate={dynamicExchangeRate} user={user} onUpdateUser={handleUpdateUser} savedStrategies={savedStrategies} onSaveStrategy={handleSaveAIStrategy} onDeleteStrategy={handleDeleteAIStrategy} showToast={showToast} />} />
          <Route path="/history" element={<TransactionHistory transactions={transactions} accounts={accounts} onDelete={handleDeleteTransaction} onEdit={(tx) => { setEditingTransaction(tx); setIsTransactionModalOpen(true); triggerHaptic('light'); }} onUpdate={(txs) => { setTransactions(txs); setAssets(recalculateAssets(txs, assets)); }} onAdd={() => { setIsTransactionModalOpen(true); triggerHaptic('medium'); }} exchangeRate={dynamicExchangeRate} />} />
          <Route path="/analytics" element={<AnalyticsView history={history} assets={assets} exchangeRate={dynamicExchangeRate} />} />
          <Route path="/accounts" element={<AccountManager accounts={accounts} setAccounts={setAccounts} assets={assets} exchangeRate={dynamicExchangeRate} />} />
        </Routes>
      </main>

      {isManualModalOpen && <ManualAssetEntry onClose={() => { setIsManualModalOpen(false); setEditingAsset(undefined); triggerHaptic('light'); }} onSave={handleSaveAsset} asset={editingAsset} accounts={accounts} exchangeRate={dynamicExchangeRate} />}
      {isTransactionModalOpen && <ManualTransactionEntry onClose={() => { setIsTransactionModalOpen(false); setEditingTransaction(undefined); triggerHaptic('light'); }} onSave={handleSaveTransaction} transaction={editingTransaction} assets={assets} accounts={accounts} exchangeRate={dynamicExchangeRate} />}
      {deletingAsset && <DeleteConfirmModal asset={deletingAsset} onClose={() => setDeletingAsset(null)} onConfirm={confirmDeleteAsset} />}
      {isEnrichModalOpen && <EnrichmentModal targets={enrichTargets} onClose={() => setIsEnrichModalOpen(false)} onConfirm={handleConfirmEnrichment} />}

      <nav className="h-20 bg-white/90 backdrop-blur-xl border-t border-slate-100 flex items-center justify-around px-2 pb-safe shadow-top shrink-0 relative z-40">
        <NavLink to="/" icon={<Home size={22} />} label="홈" />
        <NavLink to="/assets" icon={<Wallet size={22} />} label="자산" />
        <NavLink to="/history" icon={<History size={22} />} label="거래" />
        <NavLink to="/advisor" icon={<Cpu size={22} />} label="AI 비서" />
        <NavLink to="/analytics" icon={<LineChart size={22} />} label="분석" />
        <button onClick={() => { setIsSettingsOpen(true); triggerHaptic('medium'); }} className="flex flex-col items-center gap-1.5 pb-1 text-slate-300">
          <Settings size={22} />
          <span className="text-[9px] font-black uppercase">설정</span>
        </button>
      </nav>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={() => setIsSettingsOpen(false)}></div>
          <div className="relative w-80 bg-white h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col pt-safe">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div><h3 className="text-xl font-black text-slate-800">설정</h3><p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-0.5">Configuration</p></div>
              <button onClick={() => setIsSettingsOpen(false)} className="p-2 bg-slate-50 rounded-xl text-slate-400"><X size={20}/></button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-8 pb-safe">
              
              {/* KIS API Settings Section */}
              <section className="space-y-4">
                 <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                       <Zap size={14} className="text-amber-500" /> 실시간 시세 연동
                    </h4>
                    <div className="flex items-center gap-2">
                       <span className={`text-[10px] font-bold ${kisConfig.useKis ? 'text-indigo-600' : 'text-slate-300'}`}>
                         {kisConfig.useKis ? 'ON' : 'OFF'}
                       </span>
                       <button 
                         onClick={() => setKisConfig(prev => ({ ...prev, useKis: !prev.useKis }))}
                         className={`w-10 h-6 rounded-full p-1 transition-all ${kisConfig.useKis ? 'bg-indigo-600' : 'bg-slate-200'}`}
                       >
                         <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-all ${kisConfig.useKis ? 'translate-x-4' : ''}`}></div>
                       </button>
                    </div>
                 </div>
                 
                 {kisConfig.useKis && (
                   <div className="bg-slate-50 p-5 rounded-[2rem] border border-slate-100 space-y-4 animate-in slide-in-from-top-2">
                      <div className="bg-white p-1 rounded-xl flex shadow-sm border border-slate-200">
                         <button 
                           onClick={() => setKisConfig(prev => ({ ...prev, serverType: 'REAL' }))}
                           className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${kisConfig.serverType !== 'VIRTUAL' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400'}`}
                         >
                           실전투자 (Real)
                         </button>
                         <button 
                           onClick={() => setKisConfig(prev => ({ ...prev, serverType: 'VIRTUAL' }))}
                           className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${kisConfig.serverType === 'VIRTUAL' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-400'}`}
                         >
                           모의투자 (Mock)
                         </button>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-500 ml-1">App Key</p>
                        <input 
                          type="password" 
                          value={kisConfig.appKey}
                          onChange={e => setKisConfig(prev => ({ ...prev, appKey: e.target.value }))}
                          placeholder={kisConfig.serverType === 'VIRTUAL' ? "모의투자 App Key" : "실전투자 App Key"}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-500 ml-1">App Secret</p>
                        <input 
                          type="password" 
                          value={kisConfig.appSecret}
                          onChange={e => setKisConfig(prev => ({ ...prev, appSecret: e.target.value }))}
                          placeholder={kisConfig.serverType === 'VIRTUAL' ? "모의투자 App Secret" : "실전투자 App Secret"}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="flex items-start gap-2 bg-indigo-50 p-3 rounded-xl">
                         <AlertTriangle size={14} className="text-indigo-500 mt-0.5 shrink-0" />
                         <p className="text-[9px] text-indigo-700 font-medium leading-relaxed">
                           선택한 서버({kisConfig.serverType === 'VIRTUAL' ? '모의' : '실전'})에 맞는 Key를 입력해야 정상 작동합니다.
                         </p>
                      </div>
                   </div>
                 )}
              </section>

              <section className="space-y-4">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-1 flex items-center gap-2"><CloudCog size={14} className="text-indigo-400" /> 클라우드 동기화</h4>
                <div className="bg-slate-50 p-5 rounded-[2rem] border border-slate-100 space-y-4">
                  {syncConfig.binId ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center"><CheckCircle2 size={20}/></div>
                        <div><p className="text-xs font-black text-slate-800">동기화 활성화됨</p><p className="text-[9px] font-bold text-slate-400">ID: {syncConfig.binId.substring(0, 10)}...</p></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => handleSync('FORCE_PUSH')} 
                          disabled={isSyncing}
                          className={`py-2.5 bg-white border border-slate-200 text-indigo-600 rounded-xl text-[10px] font-black hover:bg-indigo-50 transition-all flex items-center justify-center gap-1 ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {isSyncing ? <Loader2 size={14} className="animate-spin"/> : '올리기'}
                        </button>
                        <button 
                          onClick={() => handleSync('FORCE_PULL')} 
                          disabled={isSyncing}
                          className={`py-2.5 bg-white border border-slate-200 text-indigo-600 rounded-xl text-[10px] font-black hover:bg-indigo-50 transition-all flex items-center justify-center gap-1 ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {isSyncing ? <Loader2 size={14} className="animate-spin"/> : '내리기'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <input type="password" placeholder="JSONBin Master Key" value={inputApiKey} onChange={e => setInputApiKey(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500" />
                      <button onClick={handleCloudLogin} className="w-full py-3 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100 active:scale-95 transition-all">클라우드 연결</button>
                    </div>
                  )}
                </div>
              </section>
              <section className="space-y-4">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] px-1 flex items-center gap-2"><Database size={14} className="text-indigo-400" /> 로컬 데이터 관리</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={handleExportData} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center gap-2 hover:bg-white hover:border-indigo-200 transition-all"><Download size={18} className="text-indigo-500" /><span className="text-[10px] font-black">내보내기</span></button>
                  <button onClick={() => fileInputRef.current?.click()} className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center gap-2 hover:bg-white hover:border-indigo-200 transition-all"><Upload size={18} className="text-indigo-500" /><span className="text-[10px] font-black">불러오기</span></button>
                </div>
                
                <button 
                  onClick={handleEnrichData} 
                  disabled={isEnriching} 
                  className={`w-full p-4 border rounded-2xl flex flex-col items-center justify-center gap-2 transition-all ${isEnriching ? 'bg-indigo-50 border-indigo-200 cursor-not-allowed' : 'bg-indigo-50 border-indigo-100 hover:bg-indigo-100 text-indigo-700'}`}
                >
                  <div className="flex items-center gap-2">
                    {isEnriching ? <Loader2 size={18} className="animate-spin text-indigo-600" /> : <Sparkles size={18} className="text-indigo-600" />}
                    <span className="text-[10px] font-black text-indigo-700">
                      {isEnriching ? '자산 정보 보정 및 백업 중...' : '자산 정보 자동 보정 (Ticker)'}
                    </span>
                  </div>
                  {isEnriching && enrichProgress && (
                    <div className="w-full max-w-[200px] mt-2">
                      <div className="flex justify-between text-[9px] font-bold text-indigo-400 mb-1">
                        <span>진행률</span>
                        <span>{enrichProgress.current} / {enrichProgress.total}</span>
                      </div>
                      <div className="h-1.5 bg-indigo-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 rounded-full transition-all duration-300" 
                          style={{ width: `${(enrichProgress.current / enrichProgress.total) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </button>

                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleImportData} />
              </section>
              <section className="space-y-3">
                <button onClick={handleLogout} disabled={isSyncing} className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-slate-200 transition-all disabled:opacity-50"><LogOut size={16} /> {isSyncing ? '백업 중...' : '로그아웃'}</button>
                <button onClick={handleClearData} className="w-full py-4 bg-rose-50 text-rose-500 rounded-2xl font-black text-xs flex items-center justify-center gap-2 hover:bg-rose-100 transition-all"><Trash2 size={16} /> 초기화</button>
              </section>
            </div>
            <div className="p-8 border-t border-slate-50 bg-slate-50 flex flex-col gap-2 pb-safe">
               <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest text-center">PortFlow Mobile</p>
               <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] text-center">
                 v1.0.0 ({Capacitor.isNativePlatform() ? 'Native App' : 'Web Preview'})
               </p>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[300] bg-slate-900 text-white px-6 py-3 rounded-2xl text-xs font-black shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-2">
          <Sparkles size={16} className="text-indigo-400" /> {toast}
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
};

export default App;
