
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as ReactRouterDOM from 'react-router-dom';
const { HashRouter, Routes, Route, Link, useLocation, useNavigate } = ReactRouterDOM;
import { 
  Home, Wallet, Cpu, PlusCircle, Settings,
  CheckCircle2, LogOut, X,
  History, Download, Upload, Database, ChevronRight,
  Loader2, CloudCog, Cloud, ShieldCheck, RefreshCw, Key
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
import { EXCHANGE_RATE as DEFAULT_EXCHANGE_RATE, CLOUD_MASTER_KEY } from './constants';
import { Asset, Transaction, TransactionType, AssetType, Account, SyncConfig, AppData, SavedStrategy, RebalancingStrategy, UserProfile, DiagnosisResponse, AccountType, UsersRegistry } from './types';
import { updateAssetPrices } from './services/geminiService';
import { updateBin, readBin, fetchUsersRegistry, updateUsersRegistry } from './services/storageService';

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
  const [assets, setAssets] = useState<Asset[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [history, setHistory] = useState<{date: string, value: number}[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [dynamicExchangeRate, setDynamicExchangeRate] = useState<number>(DEFAULT_EXCHANGE_RATE);
  const [lastUpdated, setLastUpdated] = useState<string>('-');
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategy[]>([]);
  const [localUpdateTimestamp, setLocalUpdateTimestamp] = useState<number>(Date.now());

  // --- UI State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [deletingAsset, setDeletingAsset] = useState<Asset | null>(null);
  const [editingAsset, setEditingAsset] = useState<Asset | undefined>(undefined);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- 데이터 재계산 로직 ---
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
        const latestTx = sortedTxs[sortedTxs.length - 1];
        const finalManagementType = latestTx.managementType || linkedAccount?.type || meta?.managementType || AccountType.GENERAL;
        newAssets.push({
          id: meta?.id || Math.random().toString(36).substr(2, 9),
          name, institution: inst, ticker: meta?.ticker || (sortedTxs[0].assetType === AssetType.STOCK ? name : undefined),
          type: meta?.type || sortedTxs[0].assetType, quantity: totalQty, purchasePrice: totalCostUSD / totalQty,
          purchasePriceKRW: totalCostKRW / totalQty, currentPrice: meta?.currentPrice || sortedTxs[sortedTxs.length - 1].price,
          currency: sortedTxs[0].currency, accountId: accId === 'none' ? undefined : accId, managementType: finalManagementType
        });
      }
    });
    return newAssets;
  }, [dynamicExchangeRate, accounts]);

  const applyAppData = useCallback((data: AppData) => {
    if (!data) return;
    const incomingTxs = Array.isArray(data.transactions) ? data.transactions : [];
    const syncedAssets = recalculateAssets(incomingTxs, Array.isArray(data.assets) ? data.assets : []);
    setTransactions(incomingTxs);
    setAssets(syncedAssets);
    if (Array.isArray(data.accounts)) setAccounts([...data.accounts]);
    if (Array.isArray(data.history)) setHistory([...data.history]);
    if (Array.isArray(data.savedStrategies)) setSavedStrategies([...data.savedStrategies]);
    if (data.lastUpdated) setLastUpdated(data.lastUpdated);
    if (data.exchangeRate) setDynamicExchangeRate(data.exchangeRate);
    setLocalUpdateTimestamp(data.timestamp || Date.now());
  }, [recalculateAssets]);

  // --- 동기화 로직 ---
  const handleSync = useCallback(async (mode: 'FORCE_PUSH' | 'FORCE_PULL' | 'SMART' = 'SMART') => {
    if (!user?.dataBinId) return;
    setIsSyncing(true);
    try {
      if (mode === 'FORCE_PUSH') {
        const appData: AppData = {
          assets, transactions, accounts, user, history, lastUpdated, 
          exchangeRate: dynamicExchangeRate, savedStrategies, 
          timestamp: Date.now()
        };
        await updateBin(CLOUD_MASTER_KEY, user.dataBinId, appData);
        showToast("클라우드 백업 완료");
      } else {
        const cloudData = await readBin(CLOUD_MASTER_KEY, user.dataBinId);
        if (mode === 'FORCE_PULL' || (cloudData.timestamp || 0) > localUpdateTimestamp) {
          applyAppData(cloudData);
          showToast(mode === 'FORCE_PULL' ? "데이터 복원 완료" : "최신 데이터를 동기화했습니다.");
        } else {
          showToast("현재 데이터가 최신입니다.");
        }
      }
    } catch (e: any) {
      showToast(`동기화 오류: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  }, [user, assets, transactions, accounts, history, lastUpdated, dynamicExchangeRate, savedStrategies, localUpdateTimestamp, applyAppData, showToast]);

  const handleLoginSuccess = async (userProfile: UserProfile) => {
    setUser(userProfile);
    setIsAuthenticated(true);
    setIsSyncing(true);
    try {
      const cloudData = await readBin(CLOUD_MASTER_KEY, userProfile.dataBinId);
      applyAppData(cloudData);
      showToast(`${userProfile.name}님, 환영합니다!`);
    } catch (e) {
      showToast("데이터 로드 실패. 오프라인 모드로 시작합니다.");
    } finally {
      setIsSyncing(false);
    }
  };

  // 사용자 프로필(목표 등) 업데이트 시 중앙 레지스트리 동기화
  const handleUpdateUser = async (updatedUser: UserProfile) => {
    setUser(updatedUser);
    try {
      // 중앙 레지스트리에서 해당 유저의 정보(목표, 프롬프트 등) 업데이트
      const registry = await fetchUsersRegistry(CLOUD_MASTER_KEY);
      const userIndex = registry.users.findIndex(u => u.name === updatedUser.name);
      if (userIndex !== -1) {
        registry.users[userIndex] = { ...registry.users[userIndex], ...updatedUser };
        await updateUsersRegistry(CLOUD_MASTER_KEY, registry);
        showToast("투자 목표가 클라우드에 저장되었습니다.");
      }
    } catch (error) {
      console.error("Registry update failed:", error);
      showToast("목표 저장 중 오류가 발생했습니다.");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUser(null);
    setAssets([]);
    setTransactions([]);
    setAccounts([]);
    setHistory([]);
    setIsSettingsOpen(false);
    navigate('/');
    showToast("로그아웃 되었습니다.");
  };

  useEffect(() => {
    if (isAuthenticated) setLocalUpdateTimestamp(Date.now());
  }, [assets, transactions, accounts, savedStrategies, isAuthenticated]);

  if (!isAuthenticated) return <AuthScreen onLoginSuccess={handleLoginSuccess} />;

  return (
    <div className="flex flex-col h-full bg-[#F4F7FB] max-w-md mx-auto shadow-2xl overflow-hidden relative font-sans">
      <input type="file" ref={fileInputRef} onChange={(e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target?.result as string);
            applyAppData(data);
            showToast("데이터 복원 완료");
          } catch (err) { showToast("유효하지 않은 파일입니다."); }
        };
        reader.readAsText(file);
      }} className="hidden" accept=".json" />
      
      {toast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[200] bg-slate-900/90 text-white px-6 py-3 rounded-full text-xs font-bold shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-2 fade-in backdrop-blur-sm">
          <CheckCircle2 size={14} className="text-emerald-400" /> {toast}
        </div>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar bg-[#F4F7FB]">
        <Routes>
          <Route path="/" element={<Dashboard assets={assets} accounts={accounts} transactions={transactions} user={user} onRefresh={async () => {
            setIsUpdatingPrices(true);
            try {
              const { updatedAssets, exchangeRate: newRate } = await updateAssetPrices(assets);
              if (newRate) setDynamicExchangeRate(newRate);
              setAssets(updatedAssets);
              setLastUpdated(new Date().toLocaleString());
              showToast("시세 업데이트 완료");
            } catch (e) { showToast("업데이트 오류"); }
            finally { setIsUpdatingPrices(false); }
          }} isUpdating={isUpdatingPrices} lastUpdated={lastUpdated} history={history} exchangeRate={dynamicExchangeRate} />} />
          <Route path="/assets" element={<AssetList assets={assets} setAssets={setAssets} onAddAsset={() => { setEditingAsset(undefined); setIsManualModalOpen(true); }} onEditAsset={(a) => { setEditingAsset(a); setIsManualModalOpen(true); }} onDeleteAsset={(id) => { const a = assets.find(as => as.id === id); if(a) setDeletingAsset(a); }} onSync={() => { const synced = recalculateAssets(transactions, assets); setAssets(synced); showToast("동기화 완료"); }} onRefreshPrices={() => showToast("홈 화면에서 새로고침하세요.")} isRefreshing={isUpdatingPrices} exchangeRate={dynamicExchangeRate} accounts={accounts} />} />
          <Route path="/advisor" element={<AIAdvisor assets={assets} accounts={accounts} onApplyRebalancing={() => {}} exchangeRate={dynamicExchangeRate} onSaveStrategy={(data) => {
            const newSaved: SavedStrategy = { 
              id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
              createdAt: Date.now(), 
              type: data.type,
              name: data.name,
              diagnosis: data.diagnosis,
              strategy: data.strategy
            };
            setSavedStrategies(prev => [newSaved, ...prev]);
            showToast("저장되었습니다.");
          }} savedStrategies={savedStrategies} onDeleteStrategy={(id) => setSavedStrategies(prev => prev.filter(s => s.id !== id))} user={user} onUpdateUser={handleUpdateUser} />} />
          <Route path="/history" element={<TransactionHistory transactions={transactions} accounts={accounts} onDelete={(id) => setTransactions(prev => prev.filter(t => t.id !== id))} onEdit={(tx) => { setEditingTransaction(tx); setIsTransactionModalOpen(true); }} onUpdate={(txs) => setTransactions(txs)} exchangeRate={dynamicExchangeRate} />} />
          <Route path="/analytics" element={<AnalyticsView history={history} assets={assets} exchangeRate={dynamicExchangeRate} />} />
          <Route path="/accounts" element={<AccountManager accounts={accounts} setAccounts={setAccounts} assets={assets} exchangeRate={dynamicExchangeRate} />} />
        </Routes>
      </div>

      <div className="bg-white/90 backdrop-blur-xl border-t border-slate-100 flex justify-between items-center z-50 shrink-0 pb-safe shadow-top">
        <div className="px-6 py-3 flex w-full justify-between items-end">
          <NavLink to="/" icon={<Home size={22} />} label="홈" />
          <NavLink to="/assets" icon={<Wallet size={22} />} label="자산" />
          <div className="relative -top-8 px-2">
            <button onClick={() => { setEditingTransaction(undefined); setIsTransactionModalOpen(true); }} className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-2xl shadow-indigo-400 active:scale-95 transition-all border-4 border-white"><PlusCircle size={32} /></button>
          </div>
          <NavLink to="/advisor" icon={<Cpu size={22} />} label="AI 조언" />
          <button onClick={() => setIsSettingsOpen(true)} className="flex flex-col items-center gap-1.5 pb-1 group"><Settings size={22} className="text-slate-300 group-hover:text-indigo-600 transition-colors" /><span className="text-[9px] font-black text-slate-300 group-hover:text-indigo-600">설정</span></button>
        </div>
      </div>

      {isManualModalOpen && <ManualAssetEntry onClose={() => setIsManualModalOpen(false)} onSave={(asset) => {
        if (editingAsset) {
          setAssets(assets.map(a => a.id === asset.id ? asset : a));
        } else {
          const initialTx: Transaction = {
            id: Math.random().toString(36).substr(2, 9), accountId: asset.accountId, date: new Date().toLocaleDateString('en-CA'),
            type: TransactionType.BUY, assetType: asset.type, institution: asset.institution, name: asset.name,
            quantity: asset.quantity, price: asset.purchasePrice, currency: asset.currency, exchangeRate: asset.currency === 'USD' ? dynamicExchangeRate : 1
          };
          setTransactions([initialTx, ...transactions]);
          setAssets([...assets, asset]);
        }
        setIsManualModalOpen(false);
      }} asset={editingAsset} accounts={accounts} exchangeRate={dynamicExchangeRate} />}
      
      {isTransactionModalOpen && <ManualTransactionEntry onClose={() => setIsTransactionModalOpen(false)} onSave={(tx) => {
        setTransactions(prev => editingTransaction ? prev.map(t => t.id === tx.id ? tx : t) : [tx, ...prev]);
        setIsTransactionModalOpen(false);
      }} assets={assets} accounts={accounts} transaction={editingTransaction} exchangeRate={dynamicExchangeRate} />}

      {isSettingsOpen && (
        <div className="absolute inset-0 z-[150] bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)}>
          <div className="absolute top-0 right-0 bottom-0 w-3/4 max-w-sm bg-white shadow-2xl p-6 overflow-y-auto animate-in slide-in-from-right duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-8"><h2 className="text-xl font-black text-slate-800">설정</h2><button onClick={() => setIsSettingsOpen(false)}><X size={24} className="text-slate-400" /></button></div>
            <div className="space-y-8">
              <section>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Cloud Sync</h3>
                <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100">
                  <div className="flex items-center gap-2 mb-2"><Cloud size={16} className="text-indigo-600" /><span className="text-xs font-black text-indigo-900">{user?.name}님 클라우드</span></div>
                  <p className="text-[9px] font-bold text-slate-400 mb-4 break-all">Data ID: {user?.dataBinId}</p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button onClick={() => handleSync('FORCE_PUSH')} disabled={isSyncing} className="py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black shadow-sm flex items-center justify-center gap-1 active:scale-95">
                      {isSyncing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} 백업하기
                    </button>
                    <button onClick={() => handleSync('FORCE_PULL')} disabled={isSyncing} className="py-3 bg-white text-indigo-600 rounded-xl text-[10px] font-black shadow-sm border border-indigo-100 flex items-center justify-center gap-1 active:scale-95">
                      {isSyncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} 동기화
                    </button>
                  </div>
                </div>
              </section>
              <section>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Account</h3>
                <button onClick={handleLogout} className="w-full p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between group hover:bg-rose-50 transition-all">
                  <div className="flex items-center gap-3"><LogOut size={18} className="text-slate-400 group-hover:text-rose-500" /><span className="text-xs font-bold text-slate-700">로그아웃</span></div>
                  <ChevronRight size={16} className="text-slate-300" />
                </button>
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
