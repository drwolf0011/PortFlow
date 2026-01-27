
import React, { useState, useEffect, useCallback, useRef } from 'react';
/* Fix: Using wildcard import for react-router-dom to resolve named export errors in this environment */
import * as ReactRouterDOM from 'react-router-dom';
const { HashRouter, Routes, Route, Link, useLocation, useNavigate } = ReactRouterDOM;
import { 
  Home, Wallet, Cpu, PlusCircle, Settings,
  CheckCircle2, LogOut, X,
  History, Download, Upload, Database, ChevronRight,
  Loader2, CloudCog, Cloud
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import AssetList from './components/AssetList';
import AIAdvisor from './components/AIAdvisor';
import TransactionHistory from './components/TransactionHistory';
import AnalyticsView from './components/AnalyticsView';
import AccountManager from './components/AccountManager';
import ManualAssetEntry from './components/ManualAssetEntry';
import ManualTransactionEntry from './components/ManualTransactionEntry';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import AuthScreen from './components/AuthScreen';
import { EXCHANGE_RATE as DEFAULT_EXCHANGE_RATE } from './constants';
import { Asset, Transaction, TransactionType, AssetType, Account, SyncConfig, AppData, SavedStrategy, RebalancingStrategy, UserProfile, DiagnosisResponse, AccountType } from './types';
import { updateAssetPrices } from './services/geminiService';
import { createBin, updateBin, readBin } from './services/storageService';

const NavLink: React.FC<{ to: string; icon: React.ReactNode; label: string }> = ({ to, icon, label }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link to={to} className="flex flex-col items-center gap-1.5 pb-1 group">
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
      const parsed = saved ? JSON.parse(saved) : [];
      if (Array.isArray(parsed)) {
        return parsed.map((s: any) => {
          if (s.strategy && !s.type) {
            return {
              id: s.id || Date.now().toString() + Math.random().toString(36).substring(2, 5),
              createdAt: s.createdAt || Date.now(),
              type: 'STRATEGY',
              name: s.strategy.name || '저장된 전략',
              strategy: s.strategy,
              diagnosis: s.diagnosis || undefined
            } as SavedStrategy;
          }
          return s as SavedStrategy;
        }).filter(s => s && s.id);
      }
      return [];
    } catch (e) { return []; }
  });

  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => {
    try {
      const saved = localStorage.getItem('portflow_sync_config');
      return saved ? JSON.parse(saved) : { apiKey: '', binId: '', lastSynced: '', autoSync: false };
    } catch (e) { return { apiKey: '', binId: '', lastSynced: '', autoSync: false }; }
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
  const [inputApiKey, setInputApiKey] = useState('');
  const [inputBinId, setInputBinId] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- Transaction -> Asset Recalculation Logic ---
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

    const accountLookup = new Map<string, Account>(accounts.map(acc => [acc.id, acc]));
    const newAssets: Asset[] = [];

    Object.entries(groups).forEach(([key, groupTxs]) => {
      const meta = assetMetaMap[key];
      const [name, inst, accId] = key.split('|');
      const linkedAccount = accId !== 'none' ? accountLookup.get(accId) : null;

      let totalQty = 0;
      let totalCostKRW = 0; 
      let totalCostUSD = 0; 

      const sortedTxs = [...groupTxs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
        // 최신 거래 기록에서 관리 유형을 가져오거나 기존 메타 또는 계좌 설정에서 가져옴
        const latestTx = sortedTxs[sortedTxs.length - 1];
        const finalManagementType = latestTx.managementType || linkedAccount?.type || meta?.managementType || AccountType.GENERAL;

        newAssets.push({
          id: meta?.id || Math.random().toString(36).substr(2, 9),
          name,
          institution: inst,
          ticker: meta?.ticker || (sortedTxs[0].assetType === AssetType.STOCK ? name : undefined),
          type: meta?.type || sortedTxs[0].assetType,
          quantity: totalQty,
          purchasePrice: totalCostUSD / totalQty,
          purchasePriceKRW: totalCostKRW / totalQty,
          currentPrice: meta?.currentPrice || sortedTxs[sortedTxs.length - 1].price,
          currency: sortedTxs[0].currency,
          accountId: accId === 'none' ? undefined : accId,
          managementType: finalManagementType
        });
      }
    });

    return newAssets;
  }, [dynamicExchangeRate, accounts]);

  // --- Persistence ---
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
  useEffect(() => { localStorage.setItem('portflow_history', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('portflow_sync_config', JSON.stringify(syncConfig)); }, [syncConfig]);
  useEffect(() => { localStorage.setItem('portflow_user', JSON.stringify(user)); }, [user]);
  useEffect(() => { localStorage.setItem('portflow_exchange_rate', dynamicExchangeRate.toString()); }, [dynamicExchangeRate]);
  useEffect(() => { localStorage.setItem('portflow_last_updated', lastUpdated); }, [lastUpdated]);
  useEffect(() => { 
    localStorage.setItem('portflow_saved_strategies', JSON.stringify(savedStrategies));
    setLocalUpdateTimestamp(Date.now());
  }, [savedStrategies]);

  const handleSaveStrategy = useCallback((data: { 
    type: 'DIAGNOSIS' | 'STRATEGY', 
    name: string, 
    diagnosis?: DiagnosisResponse, 
    strategy?: RebalancingStrategy 
  }) => {
    if (data.type === 'STRATEGY' && (!data.strategy)) {
      showToast("저장할 수 없는 전략 형식입니다.");
      return;
    }
    if (data.type === 'DIAGNOSIS' && !data.diagnosis) {
      showToast("저장할 진단 데이터가 없습니다.");
      return;
    }
    
    const newSaved: SavedStrategy = { 
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      createdAt: Date.now(), 
      type: data.type,
      name: data.name || (data.type === 'DIAGNOSIS' ? '자산 정밀 진단' : '통합 관리 전략'),
      diagnosis: data.diagnosis ? JSON.parse(JSON.stringify(data.diagnosis)) : undefined,
      strategy: data.strategy ? JSON.parse(JSON.stringify(data.strategy)) : undefined
    };
    
    setSavedStrategies(prev => [newSaved, ...prev]);
    
    const msg = data.type === 'DIAGNOSIS' 
      ? "진단 리포트가 보관함에 저장되었습니다." 
      : (data.diagnosis ? "통합 리포트(진단+전략)가 보관함에 저장되었습니다." : "전략 리포트가 보관함에 저장되었습니다.");
    showToast(msg);
  }, [showToast]);

  const handleDeleteStrategy = useCallback((id: string) => {
    setSavedStrategies(prev => prev.filter(s => s.id !== id));
    showToast("보관함에서 삭제되었습니다.");
  }, [showToast]);

  const getCurrentAppData = useCallback((): AppData => {
    return {
      assets, transactions, accounts, user, history, lastUpdated, 
      exchangeRate: dynamicExchangeRate, savedStrategies, 
      timestamp: localUpdateTimestamp
    };
  }, [assets, transactions, accounts, user, history, lastUpdated, dynamicExchangeRate, savedStrategies, localUpdateTimestamp]);

  const applyAppData = useCallback((data: AppData) => {
    if (!data) return;
    const incomingTxs = Array.isArray(data.transactions) ? data.transactions : [];
    const syncedAssets = recalculateAssets(incomingTxs, Array.isArray(data.assets) ? data.assets : []);
    
    setTransactions(incomingTxs);
    setAssets(syncedAssets);
    if (Array.isArray(data.accounts)) setAccounts([...data.accounts]);
    if (Array.isArray(data.history)) setHistory([...data.history]);
    if (Array.isArray(data.savedStrategies)) setSavedStrategies([...data.savedStrategies]);
    if (data.user) setUser({ ...data.user });
    if (data.lastUpdated) setLastUpdated(data.lastUpdated);
    if (data.exchangeRate) setDynamicExchangeRate(data.exchangeRate);
    setLocalUpdateTimestamp(data.timestamp || Date.now());
  }, [recalculateAssets]);

  const handleSync = useCallback(async (mode: 'AUTO' | 'FORCE_PUSH' | 'FORCE_PULL' | 'SMART' = 'SMART') => {
    if (!syncConfig.apiKey || !syncConfig.binId) return;
    setIsSyncing(true);
    try {
      const localData = getCurrentAppData();
      if (mode === 'FORCE_PUSH') {
        await updateBin(syncConfig.apiKey, syncConfig.binId, localData);
        const now = new Date().toLocaleString();
        setSyncConfig(prev => ({ ...prev, lastSynced: now, lastSyncedDataTimestamp: localData.timestamp }));
        showToast("클라우드에 데이터를 덮어썼습니다.");
        return;
      }
      const cloudData = await readBin(syncConfig.apiKey, syncConfig.binId);
      if (mode === 'FORCE_PULL') {
        applyAppData(cloudData);
        const now = new Date().toLocaleString();
        setSyncConfig(prev => ({ ...prev, lastSynced: now, lastSyncedDataTimestamp: cloudData.timestamp }));
        showToast("클라우드 데이터를 불러왔습니다.");
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
        }
      } else if (localTime > cloudTime && localTime > lastSyncedTime) {
        await updateBin(syncConfig.apiKey, syncConfig.binId, localData);
        setSyncConfig(prev => ({ ...prev, lastSynced: new Date().toLocaleString(), lastSyncedDataTimestamp: localTime }));
        if (mode !== 'AUTO') showToast("클라우드 백업 완료");
      } else if (mode !== 'AUTO') {
        showToast("데이터가 최신 상태입니다.");
      }
    } catch (e: any) {
      console.error(e);
      if (mode !== 'AUTO') showToast(`동기화 오류: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  }, [syncConfig, getCurrentAppData, applyAppData, showToast]);

  const handleLocalSync = useCallback(() => {
    const syncedAssets = recalculateAssets(transactions, assets);
    setAssets(syncedAssets);
    showToast("거래 내역을 바탕으로 자산 데이터가 동기화되었습니다.");
  }, [transactions, assets, recalculateAssets, showToast]);

  const handleCloudLogin = async () => {
    if (!inputApiKey) return showToast("API Key를 입력해주세요.");
    setIsSyncing(true);
    try {
      let binId = inputBinId;
      if (!binId) {
        binId = await createBin(inputApiKey, getCurrentAppData());
        showToast("새 클라우드 저장소가 생성되었습니다.");
      } else {
        const cloudData = await readBin(inputApiKey, binId);
        showToast("저장소 연결 성공!");
        if (window.confirm("기존 클라우드 데이터를 불러오시겠습니까?")) {
          applyAppData(cloudData);
        }
      }
      const newConfig = { 
        apiKey: inputApiKey, 
        binId, 
        lastSynced: new Date().toLocaleString(), 
        autoSync: true,
        lastSyncedDataTimestamp: localUpdateTimestamp 
      };
      setSyncConfig(newConfig);

      setUser(prev => prev ? {
        ...prev,
        cloudSync: {
          apiKey: inputApiKey,
          binId: binId
        }
      } : null);

      setInputApiKey(''); setInputBinId('');
      showToast("클라우드 연동 정보가 프로필에 저장되었습니다.");
    } catch (e: any) {
      showToast(`연동 실패: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

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
          setIsSettingsOpen(false);
        }
      } catch (err) { showToast("유효하지 않은 파일입니다."); }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    if (syncConfig.autoSync && isAuthenticated) {
      const timer = setTimeout(() => handleSync('AUTO'), 10000);
      return () => clearTimeout(timer);
    }
  }, [localUpdateTimestamp, isAuthenticated, handleSync, syncConfig.autoSync]);

  const handleUpdatePrices = async () => {
    if (assets.length === 0) {
      showToast("업데이트할 자산이 없습니다.");
      return;
    }
    setIsUpdatingPrices(true);
    try {
      const { updatedAssets, exchangeRate: newRate } = await updateAssetPrices(assets);
      let finalRate = dynamicExchangeRate;
      if (newRate) {
        setDynamicExchangeRate(newRate);
        finalRate = newRate;
        localStorage.setItem('portflow_exchange_rate', newRate.toString());
      }
      setAssets(updatedAssets);
      const totalVal = updatedAssets.reduce((acc, cur) => {
        const mult = cur.currency === 'USD' ? finalRate : 1;
        return acc + (cur.currentPrice * cur.quantity * mult);
      }, 0);
      const today = new Date().toLocaleDateString('en-CA');
      setHistory(prev => {
        const newHistory = prev.filter(h => h.date !== today);
        return [...newHistory, { date: today, value: Math.floor(totalVal) }].slice(-52);
      });
      setLastUpdated(new Date().toLocaleString());
      const count = updatedAssets.filter(a => a.type !== AssetType.CASH).length;
      showToast(`${count}개 자산 시세가 업데이트되었습니다.`);
    } catch (e) { 
      showToast("시세 업데이트 중 오류 발생"); 
    } finally { 
      setIsUpdatingPrices(false); 
    }
  };

  const handleDeleteAsset = (id: string) => {
    const asset = assets.find(a => a.id === id);
    if (!asset) return;
    if (window.confirm(`'${asset.name}' 자산과 관련된 모든 거래 내역이 함께 삭제됩니다. 계속하시겠습니까?`)) {
      const newTransactions = transactions.filter(t => 
        !(t.name === asset.name && t.institution === asset.institution && t.accountId === asset.accountId)
      );
      setTransactions(newTransactions);
      setAssets(recalculateAssets(newTransactions, assets));
      showToast("자산 및 관련 거래 내역이 삭제되었습니다.");
    }
  };

  const handleSaveAsset = (asset: Asset) => {
    if (editingAsset) {
      const oldName = editingAsset.name;
      const oldInst = editingAsset.institution;
      const oldAcc = editingAsset.accountId;
      const newTxs = transactions.map(t => {
        if (t.name === oldName && t.institution === oldInst && t.accountId === oldAcc) {
          return { ...t, name: asset.name, institution: asset.institution, accountId: asset.accountId, managementType: asset.managementType, assetType: asset.type, currency: asset.currency };
        }
        return t;
      });
      setTransactions(newTxs);
      setAssets(recalculateAssets(newTxs, assets.map(a => a.id === asset.id ? asset : a)));
      showToast("수정되었습니다.");
    } else {
      const initialTx: Transaction = {
        id: Math.random().toString(36).substr(2, 9),
        accountId: asset.accountId,
        managementType: asset.managementType, // 관리 유형 포함
        date: new Date().toLocaleDateString('en-CA'),
        type: TransactionType.BUY,
        assetType: asset.type,
        institution: asset.institution,
        name: asset.name,
        quantity: asset.quantity,
        price: asset.purchasePrice,
        currency: asset.currency,
        exchangeRate: asset.currency === 'USD' ? dynamicExchangeRate : 1
      };
      const newTxs = [initialTx, ...transactions];
      setTransactions(newTxs);
      setAssets(recalculateAssets(newTxs, [...assets, asset]));
      showToast("새 자산이 추가되었습니다.");
    }
    setEditingAsset(undefined); setIsManualModalOpen(false);
  };

  const handleTransactionSave = (tx: Transaction) => {
    const newTransactions = editingTransaction ? transactions.map(t => t.id === tx.id ? tx : t) : [tx, ...transactions];
    setTransactions(newTransactions);
    setAssets(recalculateAssets(newTransactions, assets));
    showToast(editingTransaction ? "거래가 수정되었습니다." : "거래가 기록되었습니다.");
    setEditingTransaction(undefined); setIsTransactionModalOpen(false);
  };

  const handleDeleteTransaction = (id: string) => {
    const newTransactions = transactions.filter(t => t.id !== id);
    setTransactions(newTransactions);
    setAssets(recalculateAssets(newTransactions, assets));
    showToast("거래 기록이 삭제되었습니다.");
  };

  const handleUpdateTransactions = (newTxs: Transaction[]) => {
    setTransactions(newTxs);
    setAssets(recalculateAssets(newTxs, assets));
    showToast("데이터 분류가 업데이트되었습니다.");
  };

  const handleLoginSuccess = (userProfile: any) => {
    setUser({ ...user, ...userProfile });
    setIsAuthenticated(true);
    if (userProfile.cloudSync?.apiKey) {
      setSyncConfig(prev => ({ ...prev, apiKey: userProfile.cloudSync.apiKey, binId: userProfile.cloudSync.binId, autoSync: true }));
      setTimeout(() => handleSync('SMART'), 800);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setIsSettingsOpen(false);
    navigate('/');
    showToast("로그아웃 되었습니다.");
  };

  const handleUpdateUser = (updatedUser: UserProfile) => {
    setUser(updatedUser);
    showToast("사용자 정보가 업데이트되었습니다.");
  };

  if (!isAuthenticated) return <AuthScreen onLoginSuccess={handleLoginSuccess} />;

  return (
    <div className="flex flex-col h-full bg-[#F4F7FB] max-w-md mx-auto shadow-2xl overflow-hidden relative font-sans">
      <input type="file" ref={fileInputRef} onChange={handleImportData} className="hidden" accept=".json" />
      {toast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[200] bg-slate-900/90 text-white px-6 py-3 rounded-full text-xs font-bold shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-2 fade-in backdrop-blur-sm">
          <CheckCircle2 size={14} className="text-emerald-400" /> {toast}
        </div>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar bg-[#F4F7FB]">
        <Routes>
          <Route path="/" element={<Dashboard assets={assets} accounts={accounts} transactions={transactions} user={user} onRefresh={handleUpdatePrices} isUpdating={isUpdatingPrices} lastUpdated={lastUpdated} history={history} exchangeRate={dynamicExchangeRate} />} />
          <Route path="/assets" element={<AssetList assets={assets} setAssets={setAssets} onAddAsset={() => { setEditingAsset(undefined); setIsManualModalOpen(true); }} onEditAsset={(a) => { setEditingAsset(a); setIsManualModalOpen(true); }} onDeleteAsset={handleDeleteAsset} onSync={handleLocalSync} onRefreshPrices={handleUpdatePrices} isRefreshing={isUpdatingPrices} exchangeRate={dynamicExchangeRate} accounts={accounts} />} />
          <Route path="/advisor" element={<AIAdvisor assets={assets} accounts={accounts} onApplyRebalancing={(inst) => showToast(`${inst} 리밸런싱 전송`)} exchangeRate={dynamicExchangeRate} onSaveStrategy={handleSaveStrategy} savedStrategies={savedStrategies} onDeleteStrategy={handleDeleteStrategy} user={user} onUpdateUser={handleUpdateUser} />} />
          <Route path="/history" element={<TransactionHistory transactions={transactions} accounts={accounts} onDelete={handleDeleteTransaction} onEdit={(tx) => { setEditingTransaction(tx); setIsTransactionModalOpen(true); }} onUpdate={handleUpdateTransactions} exchangeRate={dynamicExchangeRate} />} />
          <Route path="/analytics" element={<AnalyticsView history={history} assets={assets} exchangeRate={dynamicExchangeRate} />} />
          <Route path="/accounts" element={<AccountManager accounts={accounts} setAccounts={setAccounts} assets={assets} exchangeRate={dynamicExchangeRate} />} />
        </Routes>
      </div>

      <div className="bg-white/90 backdrop-blur-xl border-t border-slate-100 flex justify-between items-center z-50 shrink-0 pb-safe shadow-top">
        <div className="px-6 py-3 flex w-full justify-between items-end">
          <NavLink to="/" icon={<Home size={22} />} label="홈" />
          <NavLink to="/assets" icon={<Wallet size={22} />} label="자산" />
          <div className="relative -top-8 px-2">
            <button 
              onClick={() => { setEditingTransaction(undefined); setIsTransactionModalOpen(true); }} 
              className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-2xl shadow-indigo-400 active:scale-95 transition-all border-4 border-white"
            >
              <PlusCircle size={32} />
            </button>
          </div>
          <NavLink to="/advisor" icon={<Cpu size={22} />} label="AI 조언" />
          <button onClick={() => setIsSettingsOpen(true)} className="flex flex-col items-center gap-1.5 pb-1 group">
            <Settings size={22} className="text-slate-300 group-hover:text-indigo-600 transition-colors" />
            <span className="text-[9px] font-black text-slate-300 group-hover:text-indigo-600">설정</span>
          </button>
        </div>
      </div>

      {isManualModalOpen && <ManualAssetEntry onClose={() => setIsManualModalOpen(false)} onSave={handleSaveAsset} asset={editingAsset} accounts={accounts} exchangeRate={dynamicExchangeRate} />}
      {isTransactionModalOpen && <ManualTransactionEntry onClose={() => setIsTransactionModalOpen(false)} onSave={handleTransactionSave} assets={assets} accounts={accounts} transaction={editingTransaction} exchangeRate={dynamicExchangeRate} />}
      {deletingAsset && <DeleteConfirmModal asset={deletingAsset} onClose={() => setDeletingAsset(null)} onConfirm={() => handleDeleteAsset(deletingAsset.id)} />}

      {isSettingsOpen && (
        <div className="absolute inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)}>
          <div className="absolute top-0 right-0 bottom-0 w-3/4 max-w-sm bg-white shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8"><h2 className="text-xl font-black text-slate-800">설정</h2><button onClick={() => setIsSettingsOpen(false)}><X size={24} className="text-slate-400" /></button></div>
            <div className="space-y-8">
              <section><h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Shortcuts</h3><button onClick={() => { navigate('/history'); setIsSettingsOpen(false); }} className="w-full p-4 bg-slate-50 rounded-2xl flex items-center justify-between group hover:bg-indigo-50"><div className="flex items-center gap-3"><div className="p-2 bg-white rounded-xl shadow-sm text-slate-400 group-hover:text-indigo-600"><History size={18} /></div><span className="text-xs font-bold text-slate-700">거래 내역 조회</span></div><ChevronRight size={16} className="text-slate-300" /></button></section>
              <section><h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Local Backup</h3><div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><div className="flex gap-2 mb-3"><button onClick={handleExportData} className="flex-1 py-3 bg-white rounded-xl shadow-sm text-[10px] font-black text-slate-600 flex flex-col items-center gap-1 active:scale-95"><Download size={16} className="text-indigo-600" />내보내기</button><button onClick={() => fileInputRef.current?.click()} className="flex-1 py-3 bg-white rounded-xl shadow-sm text-[10px] font-black text-slate-600 flex flex-col items-center gap-1 active:scale-95"><Upload size={16} className="text-emerald-600" />불러오기</button></div></div></section>
              <section><h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Cloud Sync (JSONBin)</h3>{!syncConfig.apiKey ? (
                <div className="space-y-3"><input type="password" placeholder="Master Key" className="w-full p-4 bg-slate-50 rounded-xl text-xs font-bold border border-slate-200 nucleus-none focus:border-indigo-500" value={inputApiKey} onChange={(e) => setInputApiKey(e.target.value)} /><input type="text" placeholder="Bin ID (선택)" className="w-full p-4 bg-slate-50 rounded-xl text-xs font-bold border border-slate-200 nucleus-none focus:border-indigo-500" value={inputBinId} onChange={(e) => setInputBinId(e.target.value)} /><button onClick={handleCloudLogin} disabled={isSyncing} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2">{isSyncing ? <Loader2 size={14} className="animate-spin" /> : <CloudCog size={14} />}연동하기</button></div>
              ) : (
                <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100"><div className="flex items-center gap-2 mb-2"><Cloud size={16} className="text-indigo-600" /><span className="text-xs font-black text-indigo-900">클라우드 연동됨</span></div><p className="text-[9px] font-bold text-slate-500 mb-4 break-all">ID: {syncConfig.binId}</p><div className="grid grid-cols-2 gap-2 mb-3"><button onClick={() => handleSync('FORCE_PUSH')} disabled={isSyncing} className="py-2 bg-white text-indigo-600 rounded-lg text-[9px] font-black shadow-sm flex items-center justify-center gap-1">올리기</button><button onClick={() => handleSync('FORCE_PULL')} disabled={isSyncing} className="py-2 bg-white text-indigo-600 rounded-lg text-[9px] font-black shadow-sm flex items-center justify-center gap-1">내리기</button></div><button onClick={() => { setSyncConfig({apiKey:'', binId:'', lastSynced:'', autoSync: false}); setUser(prev => prev ? { ...prev, cloudSync: undefined } : null); showToast('연동 해제됨'); }} className="w-full py-2 bg-white text-rose-500 rounded-lg text-[9px] font-black shadow-sm mb-3">연동 해제</button><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-slate-400">자동 동기화</span><button onClick={() => setSyncConfig(p => ({...p, autoSync: !p.autoSync}))} className={`w-8 h-4 rounded-full transition-colors relative ${syncConfig.autoSync ? 'bg-indigo-600' : 'bg-slate-300'}`}><div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${syncConfig.autoSync ? 'left-4.5' : 'left-0.5'}`}></div></button></div></div>
              )}</section>
              <section>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Account</h3>
                <div className="space-y-3">
                  <button onClick={handleLogout} className="w-full p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between group hover:bg-rose-50 hover:border-rose-100 transition-all"><div className="flex items-center gap-3"><div className="p-2 bg-slate-50 rounded-xl text-slate-400 group-hover:bg-rose-100 group-hover:text-rose-500 transition-colors"><LogOut size={18} /></div><span className="text-xs font-bold text-slate-700 group-hover:text-rose-600">로그아웃</span></div><ChevronRight size={16} className="text-slate-300 group-hover:text-rose-400" /></button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}
