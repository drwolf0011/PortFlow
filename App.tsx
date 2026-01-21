
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { HashRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, Wallet, LineChart, Cpu, PlusCircle, Settings,
  RefreshCw, CheckCircle2, LogOut, RotateCcw, X,
  AlertTriangle, History, Download, Upload, Trash2, Database, ChevronRight, Clock,
  Cloud, Smartphone, Copy, Check, ExternalLink, Lock, Zap, ArrowRight, Loader2, CloudCog,
  CloudUpload, CloudDownload
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
import { Asset, Transaction, TransactionType, AssetType, Account, SyncConfig, AppData } from './types';
import { updateAssetPrices } from './services/geminiService';
import { createBin, updateBin, readBin } from './services/storageService';

// 사용자 타입 정의 확장
interface UserProfile {
  name: string;
  id: string;
  cloudSync?: {
    apiKey: string;
    binId: string;
  };
}

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
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

  // --- Cloud Sync State ---
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => {
    try {
      const saved = localStorage.getItem('portflow_sync_config');
      return saved ? JSON.parse(saved) : { apiKey: '', binId: '', lastSynced: '', autoSync: false };
    } catch (e) {
      return { apiKey: '', binId: '', lastSynced: '', autoSync: false };
    }
  });

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
  const [syncStatus, setSyncStatus] = useState<'IDLE' | 'SYNCED' | 'AHEAD' | 'BEHIND' | 'CONFLICT'>('IDLE');

  // --- Settings UI State ---
  const [inputApiKey, setInputApiKey] = useState('');
  const [inputBinId, setInputBinId] = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- Persistence ---
  useEffect(() => { localStorage.setItem('portflow_assets', JSON.stringify(assets)); }, [assets]);
  useEffect(() => { localStorage.setItem('portflow_transactions', JSON.stringify(transactions)); }, [transactions]);
  useEffect(() => { localStorage.setItem('portflow_accounts', JSON.stringify(accounts)); }, [accounts]);
  useEffect(() => { localStorage.setItem('portflow_history', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('portflow_sync_config', JSON.stringify(syncConfig)); }, [syncConfig]);
  useEffect(() => { localStorage.setItem('portflow_user', JSON.stringify(user)); }, [user]);
  useEffect(() => { localStorage.setItem('portflow_exchange_rate', dynamicExchangeRate.toString()); }, [dynamicExchangeRate]);
  useEffect(() => { localStorage.setItem('portflow_last_updated', lastUpdated); }, [lastUpdated]);

  // --- Sync AppData Function ---
  const getCurrentAppData = useCallback((): AppData => {
    // 로컬 데이터의 타임스탬프는 현재 시간을 기준으로 함
    return {
      assets, transactions, accounts, user, history, lastUpdated, exchangeRate: dynamicExchangeRate,
      timestamp: Date.now()
    };
  }, [assets, transactions, accounts, user, history, lastUpdated, dynamicExchangeRate]);

  const applyAppData = useCallback((data: AppData) => {
    if (!data) return;
    if (Array.isArray(data.assets)) setAssets(data.assets);
    if (Array.isArray(data.transactions)) setTransactions(data.transactions);
    if (Array.isArray(data.accounts)) setAccounts(data.accounts);
    if (Array.isArray(data.history)) setHistory(data.history);
    if (data.user) setUser(data.user);
    if (data.lastUpdated) setLastUpdated(data.lastUpdated);
    if (typeof data.exchangeRate === 'number') setDynamicExchangeRate(data.exchangeRate);
  }, []);

  const handleCloudSync = useCallback(async (mode: 'AUTO' | 'PUSH' | 'PULL' = 'AUTO', customConfig?: {apiKey: string, binId: string}) => {
    const config = customConfig || { apiKey: syncConfig.apiKey, binId: syncConfig.binId };
    if (!config.apiKey || !config.binId) return;

    setIsSyncing(true);
    try {
      const cloudData = await readBin(config.apiKey, config.binId);
      const localTimestamp = Number(localStorage.getItem('portflow_last_local_update')) || 0;
      const cloudTimestamp = cloudData.timestamp || 0;

      // 정합성 판별 로직
      if (mode === 'PULL' || (mode === 'AUTO' && cloudTimestamp > localTimestamp)) {
        // 클라우드가 더 최신이거나 강제 다운로드인 경우
        applyAppData(cloudData);
        const nowStr = new Date().toLocaleString();
        setSyncConfig(prev => ({ 
          ...prev, 
          apiKey: config.apiKey,
          binId: config.binId,
          lastSynced: nowStr,
          lastSyncedDataTimestamp: cloudTimestamp,
          autoSync: true
        }));
        setSyncStatus('SYNCED');
        showToast("☁️ 클라우드 데이터 동기화 완료");
      } else if (mode === 'PUSH' || (mode === 'AUTO' && localTimestamp >= cloudTimestamp)) {
        // 로컬이 더 최신이거나 강제 업로드인 경우
        const localData = getCurrentAppData();
        await updateBin(config.apiKey, config.binId, localData);
        const nowStr = new Date().toLocaleString();
        setSyncConfig(prev => ({ 
          ...prev, 
          lastSynced: nowStr,
          lastSyncedDataTimestamp: localData.timestamp 
        }));
        setSyncStatus('SYNCED');
        if (mode !== 'AUTO') showToast("✅ 클라우드에 백업되었습니다.");
      }
    } catch (e) {
      console.error(e);
      setSyncStatus('CONFLICT');
      showToast("❌ 동기화 실패: 설정을 확인하세요.");
    } finally {
      setIsSyncing(false);
    }
  }, [syncConfig, getCurrentAppData, applyAppData, showToast]);

  // 로컬 데이터 변경 시 업데이트 타임스탬프 갱신
  useEffect(() => {
    localStorage.setItem('portflow_last_local_update', Date.now().toString());
    if (syncStatus === 'SYNCED') setSyncStatus('AHEAD');
  }, [assets, transactions, accounts]);

  const handleRefreshPrices = useCallback(async (targetAssets?: Asset[]) => {
    setIsUpdatingPrices(true);
    try {
      const currentAssets = targetAssets || assets;
      if (currentAssets.length === 0) { setIsUpdatingPrices(false); return; }

      const result = await updateAssetPrices(currentAssets);
      setAssets(prev => prev.map(old => {
        const updated = result.updatedAssets.find(u => u.id === old.id);
        return updated ? { ...old, currentPrice: updated.currentPrice } : old;
      }));

      if (result.exchangeRate) setDynamicExchangeRate(result.exchangeRate);
      const now = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      setLastUpdated(now);
      showToast("실시간 시세 반영 완료");
    } catch (err) { showToast("시세 업데이트 실패"); } 
    finally { setIsUpdatingPrices(false); }
  }, [assets, showToast]);

  const initCloudSync = async () => {
    const cleanApiKey = inputApiKey.trim();
    const cleanBinId = inputBinId.trim();

    if (!cleanApiKey) { alert("API Key를 입력해주세요."); return; }
    setIsSyncing(true);
    try {
      const currentAppData = getCurrentAppData();
      let binId = cleanBinId;
      if (!binId) {
        binId = await createBin(cleanApiKey, currentAppData);
      } else {
        const data = await readBin(cleanApiKey, binId);
        applyAppData(data);
      }
      
      const nowStr = new Date().toLocaleString();
      setSyncConfig({ 
        apiKey: cleanApiKey, binId, lastSynced: nowStr,
        lastSyncedDataTimestamp: Date.now(), autoSync: true 
      });

      if (user) {
        setUser({ ...user, cloudSync: { apiKey: cleanApiKey, binId } });
      }

      showToast(`✅ 클라우드 연결 성공`);
      setSyncStatus('SYNCED');
    } catch (e) { alert("연결 실패: " + e.message); } 
    finally { setIsSyncing(false); }
  };

  const handleLoginSuccess = useCallback((userData: UserProfile) => {
    setUser(userData);
    setIsAuthenticated(true);
    if (userData.cloudSync?.apiKey && userData.cloudSync?.binId) {
      handleCloudSync('PULL', userData.cloudSync);
    }
    navigate('/');
  }, [navigate, handleCloudSync]);

  const handleLogout = useCallback(() => {
    setIsAuthenticated(false);
    setIsSettingsOpen(false);
    showToast("로그아웃되었습니다.");
  }, [showToast]);

  const handleFileBackup = useCallback(() => {
    const data = getCurrentAppData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const now = new Date();
    link.href = url;
    link.download = `portflow_backup_${now.toISOString().split('T')[0]}.json`;
    link.click();
    showToast("💾 파일 백업 완료");
  }, [getCurrentAppData, showToast]);

  const handleFileRestore = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (window.confirm('데이터를 복원하시겠습니까? 현재 데이터는 모두 교체됩니다.')) {
          applyAppData(data);
          showToast("✅ 복원 성공");
          setIsSettingsOpen(false);
          navigate('/');
        }
      } catch (err) { showToast("❌ 잘못된 파일 형식입니다."); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [applyAppData, showToast, navigate]);

  /**
   * 거래 내역을 저장하거나 업데이트하는 함수
   */
  const handleSaveTransaction = useCallback((tx: Transaction) => {
    setTransactions(prev => {
      const exists = prev.find(t => t.id === tx.id);
      if (exists) {
        return prev.map(t => t.id === tx.id ? tx : t);
      }
      return [tx, ...prev];
    });
    setIsTransactionModalOpen(false);
    showToast(editingTransaction ? "거래 내역 수정 완료" : "거래 내역 저장 완료");
  }, [editingTransaction, showToast]);

  if (!isAuthenticated) return <AuthScreen onLoginSuccess={handleLoginSuccess} />;

  return (
    <div className="flex flex-col h-screen bg-[#F4F7FB] overflow-hidden">
      <header className="bg-white px-5 py-4 flex flex-col shadow-sm z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-100">
              <LineChart className="text-white" size={18} />
            </div>
            <h1 className="text-lg font-black text-slate-800 tracking-tighter">PortFlow</h1>
          </div>
          <div className="flex items-center gap-3">
             {syncConfig.apiKey && (
               <button 
                 onClick={() => handleCloudSync('AUTO')} 
                 disabled={isSyncing}
                 className={`p-2 rounded-full transition-all ${
                   isSyncing ? 'text-indigo-600 bg-indigo-50 animate-pulse' : 
                   syncStatus === 'AHEAD' ? 'text-amber-500 bg-amber-50' :
                   syncStatus === 'CONFLICT' ? 'text-rose-500 bg-rose-50' : 'text-slate-400'
                 }`}
                 title={syncStatus === 'AHEAD' ? '로컬 데이터가 최신입니다. 백업 필요' : '클라우드 동기화'}
               >
                 <Cloud size={20} className={syncConfig.autoSync ? "fill-current/10" : ""} />
               </button>
             )}
            <button onClick={() => handleRefreshPrices()} disabled={isUpdatingPrices} className={`p-2 rounded-full transition-all ${isUpdatingPrices ? 'bg-indigo-50 text-indigo-600 animate-spin' : 'text-slate-400 hover:text-indigo-600'}`}><RefreshCw size={22} /></button>
            <button onClick={() => setIsSettingsOpen(true)} className="text-slate-400 p-2 hover:text-indigo-600 transition-all"><Settings size={22} /></button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-md mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard assets={assets} accounts={accounts} transactions={transactions} user={user} history={history} onRefresh={handleRefreshPrices} isUpdating={isUpdatingPrices} lastUpdated={lastUpdated} exchangeRate={dynamicExchangeRate} />} />
            <Route path="/assets" element={<AssetList assets={assets} setAssets={setAssets} onAddAsset={() => { setEditingAsset(undefined); setIsManualModalOpen(true); }} onDeleteAsset={(id) => { const a = assets.find(x => x.id === id); if(a) setDeletingAsset(a); }} onEditAsset={a => {setEditingAsset(a); setIsManualModalOpen(true);}} onSync={() => { handleCloudSync('PULL'); }} onRefreshPrices={() => handleRefreshPrices()} isRefreshing={isUpdatingPrices} exchangeRate={dynamicExchangeRate} />} />
            <Route path="/history" element={<TransactionHistory transactions={transactions} accounts={accounts} onDelete={id => setTransactions(t => t.filter(x => x.id !== id))} onEdit={tx => { setEditingTransaction(tx); setIsTransactionModalOpen(true); }} onUpdate={setTransactions} exchangeRate={dynamicExchangeRate} />} />
            <Route path="/ai-advisor" element={<AIAdvisor assets={assets} onApplyRebalancing={(inst) => { showToast("리밸런싱 완료"); }} exchangeRate={dynamicExchangeRate} />} />
            <Route path="/analytics" element={<AnalyticsView history={history} assets={assets} exchangeRate={dynamicExchangeRate} />} />
            <Route path="/accounts" element={<AccountManager accounts={accounts} setAccounts={setAccounts} assets={assets} exchangeRate={dynamicExchangeRate} />} />
          </Routes>
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-slate-100 px-6 py-3 flex justify-between items-center z-40 shadow-xl">
        <BottomNavItem to="/" icon={<Home size={22} />} active={location.pathname === '/'} label="홈" />
        <BottomNavItem to="/assets" icon={<Wallet size={22} />} active={location.pathname === '/assets'} label="자산" />
        <button onClick={() => { setEditingTransaction(undefined); setIsTransactionModalOpen(true); }} className="mb-8 w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-2xl shadow-indigo-200 active:scale-90 transition-transform"><PlusCircle size={28} /></button>
        <BottomNavItem to="/ai-advisor" icon={<Cpu size={22} />} active={location.pathname === '/ai-advisor'} label="AI추천" />
        <BottomNavItem to="/history" icon={<History size={22} />} active={location.pathname === '/history'} label="내역" />
      </nav>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)}>
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-xl font-black">설정</h3>
              <button onClick={() => setIsSettingsOpen(false)}><X size={20}/></button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto no-scrollbar pb-10">
              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-black">{user?.name?.[0]}</div>
                <div>
                  <p className="font-black text-sm text-slate-800">{user?.name}</p>
                  <p className="text-xs text-slate-400 font-bold">{syncConfig.apiKey ? '클라우드 동기화 모드' : '오프라인 모드'}</p>
                </div>
              </div>

              {/* Cloud Sync Enhanced UI */}
              <div className="space-y-4">
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2"><Cloud size={16} className="text-indigo-600"/> 데이터 동기화 관리</h4>
                {syncConfig.apiKey ? (
                  <div className="space-y-3">
                    <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                           {syncStatus === 'SYNCED' ? <CheckCircle2 className="text-emerald-400" size={16}/> : <RefreshCw className="text-amber-400 animate-pulse" size={16}/>}
                           <span className="text-[10px] font-black uppercase tracking-widest">
                             {syncStatus === 'SYNCED' ? 'Cloud Synced' : syncStatus === 'AHEAD' ? 'Pending Upload' : 'Out of Sync'}
                           </span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">{syncConfig.lastSynced || 'N/A'}</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">Bin ID</p>
                        <p className="font-mono text-[10px] truncate text-slate-300">{syncConfig.binId}</p>
                      </div>
                      <div className="flex gap-2 mt-5">
                        <button onClick={() => handleCloudSync('PUSH')} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all">
                          <CloudUpload size={14}/> 업로드
                        </button>
                        <button onClick={() => handleCloudSync('PULL')} className="flex-1 py-3 bg-white/10 text-white rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all">
                          <CloudDownload size={14}/> 다운로드
                        </button>
                      </div>
                    </div>
                    <button 
                      onClick={() => { if(window.confirm('연결을 해제하시겠습니까? 데이터는 유지됩니다.')) setSyncConfig({apiKey:'', binId:'', lastSynced:'', autoSync:false}); }} 
                      className="w-full py-3 text-slate-400 font-bold text-[11px] hover:text-rose-500 transition-colors"
                    >
                      클라우드 연결 해제
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">JSONBin API Key</label>
                      <a href="https://jsonbin.io/login" target="_blank" rel="noopener noreferrer" className="text-[9px] font-black text-indigo-600 flex items-center gap-0.5 hover:underline">발급하기 <ExternalLink size={8} /></a>
                    </div>
                    <input type="password" placeholder="Master API Key 입력" value={inputApiKey} onChange={e => setInputApiKey(e.target.value)} className="w-full p-3.5 border rounded-xl text-xs font-bold focus:border-indigo-500 outline-none" />
                    <input type="text" placeholder="기존 Bin ID (없으면 비워두세요)" value={inputBinId} onChange={e => setInputBinId(e.target.value)} className="w-full p-3.5 border rounded-xl text-xs font-bold focus:border-indigo-500 outline-none" />
                    <button onClick={initCloudSync} disabled={isSyncing} className="w-full py-4 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all">
                      {isSyncing ? <Loader2 size={16} className="animate-spin"/> : <CloudCog size={16}/>}
                      클라우드 연동 시작
                    </button>
                    <p className="text-[9px] text-slate-400 font-bold text-center leading-tight">연동 시 다른 기기와 데이터를 실시간 공유할 수 있습니다.</p>
                  </div>
                )}
              </div>

              {/* Local Backup Section */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-2"><Database size={16} className="text-slate-500"/> 로컬 백업 관리</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleFileBackup} className="py-3.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-[11px] font-black flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-95 transition-all">
                    <Download size={14} /> 파일 저장
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="py-3.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-[11px] font-black flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-95 transition-all">
                    <Upload size={14} /> 파일 복원
                  </button>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileRestore} className="hidden" accept=".json" />
              </div>

              {/* Danger Zone */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <button onClick={handleLogout} className="w-full py-4 bg-slate-100 text-slate-700 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors active:scale-95">
                  <LogOut size={16} /> 안전하게 로그아웃
                </button>
                <button onClick={() => { if(window.confirm('전체 초기화하시겠습니까?')) {localStorage.clear(); window.location.reload();} }} className="w-full py-4 bg-rose-50 text-rose-500 rounded-2xl font-black text-sm flex items-center justify-center gap-2 hover:bg-rose-100 transition-colors active:scale-95">
                  <Trash2 size={16} /> 데이터 전체 삭제
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[1000] animate-in fade-in slide-in-from-top-4">
          <div className="bg-slate-900/90 backdrop-blur-md text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-2 border border-white/10">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span className="text-xs font-bold">{toast}</span>
          </div>
        </div>
      )}

      {isManualModalOpen && <ManualAssetEntry onClose={() => setIsManualModalOpen(false)} onSave={a => { setAssets(prev => [...prev, a]); setIsManualModalOpen(false); showToast("저장 완료"); }} accounts={accounts} exchangeRate={dynamicExchangeRate} />}
      {isTransactionModalOpen && <ManualTransactionEntry onClose={() => setIsTransactionModalOpen(false)} onSave={handleSaveTransaction} assets={assets} accounts={accounts} transaction={editingTransaction} exchangeRate={dynamicExchangeRate} />}
      {deletingAsset && <DeleteConfirmModal asset={deletingAsset} onClose={() => setDeletingAsset(null)} onConfirm={() => { setAssets(assets.filter(a => a.id !== deletingAsset.id)); setDeletingAsset(null); showToast("삭제되었습니다."); }} />}
    </div>
  );
};

const App: React.FC = () => <HashRouter><AppContent /></HashRouter>;

const BottomNavItem: React.FC<{ to: string; icon: React.ReactNode; label: string; active: boolean }> = ({ to, icon, label, active }) => (
  <Link to={to} className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-indigo-600 scale-110' : 'text-slate-300'}`}>{icon}<span className="text-[10px] font-bold">{label}</span></Link>
);

export default App;
