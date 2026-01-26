
import React, { useState, useMemo } from 'react';
import { Asset, AssetType, Account } from '../types';
import { 
  Filter, Trash2, Edit3, Plus, RefreshCw, AlertCircle, 
  Globe, CreditCard, History, RotateCcw, Landmark, 
  ChevronDown, X, Check, Calculator, TrendingUp, ArrowDownRight
} from 'lucide-react';
/* Fix: Using wildcard import for react-router-dom to resolve named export errors */
import * as ReactRouterDOM from 'react-router-dom';
const { Link } = ReactRouterDOM;

interface AssetListProps {
  assets: Asset[];
  setAssets: React.Dispatch<React.SetStateAction<Asset[]>>;
  onAddAsset: () => void;
  onDeleteAsset: (id: string) => void;
  onEditAsset: (asset: Asset) => void;
  onSync: () => void;
  onRefreshPrices: () => void;
  isRefreshing: boolean;
  exchangeRate: number;
  accounts: Account[];
}

const AssetList: React.FC<AssetListProps> = ({ 
  assets, onAddAsset, onDeleteAsset, onEditAsset, onSync, 
  onRefreshPrices, isRefreshing, exchangeRate, accounts 
}) => {
  const [activeType, setActiveType] = useState<string>('ALL');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false);
  
  const filtered = useMemo(() => {
    return assets.filter(a => {
      const matchType = activeType === 'ALL' || a.type === activeType;
      const matchAccount = selectedAccountId === 'ALL' || a.accountId === selectedAccountId;
      return matchType && matchAccount;
    });
  }, [assets, activeType, selectedAccountId]);

  const filteredStats = useMemo(() => {
    let total = 0;
    let cost = 0;
    filtered.forEach(a => {
      const mult = a.currency === 'USD' ? exchangeRate : 1;
      total += (a.currentPrice || 0) * (a.quantity || 0) * mult;
      cost += (a.quantity || 0) * (a.purchasePriceKRW || (a.purchasePrice * (a.currency === 'USD' ? exchangeRate : 1)));
    });
    const profit = total - cost;
    const rate = cost > 0 ? (profit / cost) * 100 : 0;
    return { total, profit, rate };
  }, [filtered, exchangeRate]);

  const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);

  return (
    <div className="p-5 space-y-6 pb-40 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">자산 현황</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Asset Inventory</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 계좌 관리 버튼 */}
          <Link 
            to="/accounts"
            className="p-3 bg-white text-slate-400 rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-all hover:text-indigo-600"
            title="계좌 관리"
          >
            <CreditCard size={18} />
          </Link>
          
          {/* 자산 동기화 버튼 */}
          <button 
            onClick={onSync}
            className="p-3 bg-white text-slate-400 rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-all hover:text-indigo-600"
            title="자산 동기화"
          >
            <RotateCcw size={18} />
          </button>

          {/* 시세 갱신 버튼 */}
          <button 
            onClick={onRefreshPrices}
            disabled={isRefreshing}
            className={`p-3 bg-white text-slate-400 rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-all ${isRefreshing ? 'opacity-50' : 'hover:text-indigo-600'}`}
            title="시세 갱신"
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          
          {/* 자산 추가 버튼 */}
          <button 
            onClick={onAddAsset}
            className="flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-2xl text-[13px] font-black shadow-lg shadow-indigo-100 active:scale-95 transition-all"
            title="자산 추가"
          >
            <Plus size={18} /> 추가
          </button>
        </div>
      </div>

      {/* Filter Stats Summary Card */}
      <section className="bg-slate-900 rounded-[2.5rem] p-6 text-white shadow-xl relative overflow-hidden group">
        <div className="absolute -right-4 -top-4 opacity-10 group-hover:rotate-12 transition-transform duration-700">
          <Calculator size={120} />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="px-2 py-0.5 bg-white/10 rounded text-[9px] font-black uppercase tracking-widest text-indigo-300">Filtered View Summary</span>
          </div>
          <div className="flex flex-col gap-1 mb-4">
             <p className="text-white/50 text-[10px] font-black uppercase tracking-widest">선택 조건 합계</p>
             <h3 className="text-3xl font-black tracking-tight">{Math.floor(filteredStats.total).toLocaleString()}원</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-[11px] font-black ${filteredStats.profit >= 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-blue-500/20 text-blue-300'}`}>
              {filteredStats.profit >= 0 ? <TrendingUp size={12} /> : <ArrowDownRight size={12} />}
              {filteredStats.rate.toFixed(2)}% ({Math.floor(filteredStats.profit).toLocaleString()}원)
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-white/5 text-[11px] font-black text-white/60">
              총 {filtered.length}개 자산
            </div>
          </div>
        </div>
      </section>

      {/* Integrated Filter UI */}
      <div className="space-y-3">
        {/* Account Selector (List Type Trigger) */}
        <button 
          onClick={() => setIsAccountSheetOpen(true)}
          className="w-full flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-indigo-600 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${selectedAccountId === 'ALL' ? 'bg-slate-100 text-slate-500' : 'bg-indigo-50 text-indigo-600'}`}>
              <Landmark size={18} />
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">계좌별 필터</p>
              <h4 className="text-sm font-black text-slate-800">{selectedAccount ? selectedAccount.nickname : '전체 계좌 보기'}</h4>
            </div>
          </div>
          <ChevronDown size={18} className="text-slate-300 group-hover:text-indigo-600 transition-colors" />
        </button>

        {/* Asset Type Filters (Horizontal Chips) */}
        <div className="flex overflow-x-auto no-scrollbar gap-2 px-1">
          <FilterChip 
            active={activeType === 'ALL'} 
            onClick={() => setActiveType('ALL')} 
            label="전체" 
          />
          {Object.values(AssetType).map(t => (
            <FilterChip 
              key={t}
              active={activeType === t} 
              onClick={() => setActiveType(t)} 
              label={t} 
            />
          ))}
        </div>
      </div>

      {/* Asset List Content */}
      <div className="space-y-4">
        {filtered.map(asset => {
          const mult = asset.currency === 'USD' ? (exchangeRate || 1350) : 1;
          const totalValKRW = (asset.currentPrice || 0) * (asset.quantity || 0) * mult;
          const costBasisKRW = (asset.quantity || 0) * (asset.purchasePriceKRW || 0);
          const profit = totalValKRW - costBasisKRW;
          const rate = costBasisKRW > 0 ? (profit / costBasisKRW) * 100 : 0;
          const isPlus = profit > 0;
          const isZero = Math.abs(profit) < 1;

          return (
            <div key={asset.id} className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-50 relative group transition-all hover:shadow-xl hover:border-indigo-100">
              <div className="flex justify-between items-start mb-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center font-black text-xs text-slate-400 border border-slate-100 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    {asset.institution.substring(0,2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">{asset.institution}</p>
                      {asset.currency === 'USD' && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-[8px] font-black uppercase">
                          <Globe size={8} /> USD
                        </span>
                      )}
                    </div>
                    <h4 className="text-[15px] font-black text-slate-800 leading-tight">{asset.name}</h4>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => onEditAsset(asset)} className="p-2 text-slate-300 hover:text-indigo-600"><Edit3 size={18} /></button>
                  <button onClick={() => onDeleteAsset(asset.id)} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 size={18} /></button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 mb-1">평가금액 ({(asset.quantity || 0).toLocaleString()}주)</p>
                  <p className="text-xl font-black text-slate-900 tracking-tight">{Math.floor(totalValKRW).toLocaleString()}<span className="text-xs ml-0.5">원</span></p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 mb-1">수익률(원화환산)</p>
                  <p className={`text-lg font-black tracking-tight ${isZero ? 'text-slate-400' : isPlus ? 'text-rose-500' : 'text-blue-500'}`}>
                    {isPlus ? '+' : ''}{rate.toFixed(2)}%
                  </p>
                  <p className={`text-[11px] font-bold ${isPlus ? 'text-rose-500/70' : 'text-blue-500/70'}`}>
                    {Math.floor(profit).toLocaleString()}원
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-300 uppercase tracking-tight">
                  <div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div>
                  Automatic Price Updates
                </div>
                <Link 
                  to="/history" 
                  className="flex items-center gap-1 text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl hover:bg-indigo-100 transition-all"
                  onClick={() => {
                    sessionStorage.setItem('tx_filter_name', asset.name);
                    sessionStorage.setItem('tx_filter_account_id', asset.accountId || '');
                  }}
                >
                  <History size={12} /> 거래 내역
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      
      {filtered.length === 0 && (
        <div className="py-24 text-center flex flex-col items-center justify-center gap-4 opacity-20">
          <Filter size={48} className="text-slate-300" />
          <p className="font-black text-slate-500">조건에 맞는 자산이 없습니다.</p>
        </div>
      )}

      {/* Account Selection Bottom Sheet */}
      {isAccountSheetOpen && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-0">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setIsAccountSheetOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[80dvh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-xl font-black text-slate-800">계좌 선택</h3>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-0.5">Select Account to Filter</p>
              </div>
              <button onClick={() => setIsAccountSheetOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={20}/></button>
            </div>
            
            <div className="p-4 overflow-y-auto no-scrollbar pb-10">
              <div className="space-y-2">
                <AccountListItem 
                  active={selectedAccountId === 'ALL'} 
                  onClick={() => { setSelectedAccountId('ALL'); setIsAccountSheetOpen(false); }}
                  label="전체 계좌 보기"
                  sublabel="등록된 모든 계좌의 자산을 합산하여 조회합니다."
                  icon={<Globe size={18} />}
                />
                <div className="h-4"></div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-2">등록된 계좌 목록</p>
                {accounts.map(acc => (
                  <AccountListItem 
                    key={acc.id}
                    active={selectedAccountId === acc.id}
                    onClick={() => { setSelectedAccountId(acc.id); setIsAccountSheetOpen(false); }}
                    label={acc.nickname}
                    sublabel={`${acc.institution} • ${acc.type}`}
                    icon={<CreditCard size={18} />}
                  />
                ))}
              </div>
            </div>
            <div className="p-6 bg-slate-50 mt-auto pb-safe">
               <button 
                onClick={() => setIsAccountSheetOpen(false)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm active:scale-95 transition-all"
               >
                 닫기
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const FilterChip: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({ active, onClick, label }) => (
  <button 
    onClick={onClick}
    className={`px-5 py-3 rounded-full text-[11px] font-black transition-all whitespace-nowrap border ${active ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
  >
    {label}
  </button>
);

const AccountListItem: React.FC<{ active: boolean; onClick: () => void; label: string; sublabel: string; icon: React.ReactNode }> = ({ active, onClick, label, sublabel, icon }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${active ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
  >
    <div className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
        {icon}
      </div>
      <div className="text-left">
        <h5 className={`text-sm font-black ${active ? 'text-indigo-900' : 'text-slate-800'}`}>{label}</h5>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{sublabel}</p>
      </div>
    </div>
    {active && <Check size={18} className="text-indigo-600" />}
  </button>
);

export default AssetList;
