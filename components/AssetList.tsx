
import React, { useState, useMemo } from 'react';
import { Asset, AssetType, Account, AccountType } from '../types';
import { 
  Filter, Trash2, Edit3, Plus, RefreshCw, AlertCircle, 
  Globe, CreditCard, History, RotateCcw, Landmark, 
  ChevronDown, X, Check, Calculator, TrendingUp, ArrowDownRight, Tag
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

// 자산관리유형별 정렬 우선순위 정의
const TYPE_PRIORITY: Record<string, number> = {
  [AccountType.GENERAL]: 1,
  [AccountType.ISA]: 2,
  [AccountType.PENSION]: 3,
  [AccountType.IRP]: 4,
  [AccountType.DC]: 5
};

// 기관별 브랜드 컬러 정의 (배경, 텍스트, 테두리)
export const getInstitutionColor = (name: string) => {
  const n = name.replace(/\s/g, '');
  if (n.includes('삼성')) return 'bg-blue-50 text-blue-600 border-blue-100';
  if (n.includes('미래')) return 'bg-orange-50 text-orange-600 border-orange-100';
  if (n.includes('KB') || n.includes('국민')) return 'bg-amber-50 text-amber-700 border-amber-100';
  if (n.includes('신한')) return 'bg-sky-100 text-sky-700 border-sky-200';
  if (n.includes('NH') || n.includes('농협')) return 'bg-emerald-50 text-emerald-600 border-emerald-100';
  if (n.includes('한국투자') || n.includes('한투')) return 'bg-rose-50 text-rose-600 border-rose-100';
  if (n.includes('키움')) return 'bg-purple-50 text-purple-600 border-purple-100';
  if (n.includes('토스')) return 'bg-indigo-50 text-indigo-600 border-indigo-100';
  if (n.includes('카카오')) return 'bg-yellow-50 text-yellow-700 border-yellow-100';
  if (n.includes('하나')) return 'bg-teal-50 text-teal-600 border-teal-100';
  if (n.includes('우리')) return 'bg-blue-100 text-blue-800 border-blue-200';
  
  // 기타 기관을 위한 해싱 기반 색상 생성
  const colors = [
    'bg-slate-50 text-slate-500 border-slate-100',
    'bg-gray-50 text-gray-500 border-gray-100',
    'bg-zinc-50 text-zinc-500 border-zinc-100',
    'bg-neutral-50 text-neutral-500 border-neutral-100'
  ];
  let hash = 0;
  for (let i = 0; i < n.length; i++) hash = n.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const AccountListItem: React.FC<{ active: boolean; onClick: () => void; account?: Account; label?: string }> = ({ active, onClick, account, label }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${active ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-100 hover:bg-slate-50'}`}
  >
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>
        {account ? <CreditCard size={14} /> : <Landmark size={14} />}
      </div>
      <div className="text-left">
        <p className={`text-xs font-black ${active ? 'text-white' : 'text-slate-800'}`}>{label || account?.nickname}</p>
        {account && <p className={`text-[10px] font-bold ${active ? 'text-indigo-200' : 'text-slate-400'}`}>{account.institution} • {account.type}</p>}
      </div>
    </div>
    {active && <Check size={16} />}
  </button>
);

const AssetList: React.FC<AssetListProps> = ({ 
  assets, onAddAsset, onDeleteAsset, onEditAsset, onSync, 
  onRefreshPrices, isRefreshing, exchangeRate, accounts 
}) => {
  const [activeType, setActiveType] = useState<string>('ALL');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false);
  
  const filtered = useMemo(() => {
    // 1. 숨긴 계좌 ID 집합 생성
    const hiddenAccountIds = new Set(accounts.filter(a => a.isHidden).map(a => a.id));

    return [...assets]
      .filter(a => {
        // 자산 종류 필터
        const matchType = activeType === 'ALL' || a.type === activeType;
        
        // 계좌 필터
        let matchAccount = false;
        if (selectedAccountId === 'ALL') {
          // '전체' 보기일 경우: 계좌 ID가 없거나(수동), 숨긴 계좌에 포함되지 않은 경우만 표시
          if (!a.accountId) {
             matchAccount = true;
          } else {
             matchAccount = !hiddenAccountIds.has(a.accountId);
          }
        } else {
          // 특정 계좌를 선택한 경우: 그 계좌의 자산만 표시 (숨김 여부 상관없이 명시적 선택 존중)
          matchAccount = a.accountId === selectedAccountId;
        }
        
        return matchType && matchAccount;
      })
      .sort((a, b) => {
        const accA = accounts.find(acc => acc.id === a.accountId);
        const accB = accounts.find(acc => acc.id === b.accountId);
        
        const typeA = accA?.type || a.managementType || AccountType.GENERAL;
        const typeB = accB?.type || b.managementType || AccountType.GENERAL;

        const instA = a.institution || '';
        const instB = b.institution || '';
        const instComp = instA.localeCompare(instB, 'ko-KR');
        if (instComp !== 0) return instComp;

        const priorityA = TYPE_PRIORITY[typeA] || 99;
        const priorityB = TYPE_PRIORITY[typeB] || 99;
        if (priorityA !== priorityB) return priorityA - priorityB;

        const nicknameA = accA?.nickname || '';
        const nicknameB = accB?.nickname || '';
        const accComp = nicknameA.localeCompare(nicknameB, 'ko-KR');
        if (accComp !== 0) return accComp;

        const valA = (a.currentPrice || 0) * (a.quantity || 0) * (a.currency === 'USD' ? exchangeRate : 1);
        const valB = (b.currentPrice || 0) * (b.quantity || 0) * (b.currency === 'USD' ? exchangeRate : 1);
        return valB - valA;
      });
  }, [assets, activeType, selectedAccountId, accounts, exchangeRate]);

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

  const getManagementTypeBadge = (type?: AccountType) => {
    switch (type) {
      case AccountType.IRP:
      case AccountType.DC:
        return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case AccountType.PENSION:
        return 'bg-amber-50 text-amber-600 border-amber-100';
      case AccountType.ISA:
        return 'bg-blue-50 text-blue-600 border-blue-100';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <div className="pb-40 animate-in fade-in duration-500">
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-20 px-5 py-4 bg-[#F4F7FB]/95 backdrop-blur-xl border-b border-slate-200/50 flex items-center justify-between shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">자산 현황</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Asset Inventory</p>
        </div>
        <div className="flex items-center gap-2">
          <Link 
            to="/accounts"
            className="p-3 bg-white text-slate-400 rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-all hover:text-indigo-600"
            title="계좌 관리"
          >
            <CreditCard size={18} />
          </Link>
          
          <button 
            onClick={onSync}
            className="p-3 bg-white text-slate-400 rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-all hover:text-indigo-600"
            title="자산 동기화"
          >
            <RotateCcw size={18} />
          </button>

          <button 
            onClick={onRefreshPrices}
            disabled={isRefreshing}
            className={`p-3 bg-white text-slate-400 rounded-2xl border border-slate-100 shadow-sm active:scale-95 transition-all ${isRefreshing ? 'opacity-50' : 'hover:text-indigo-600'}`}
            title="시세 갱신"
          >
            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          
          <button 
            onClick={onAddAsset}
            className="flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-2xl text-[13px] font-black shadow-lg shadow-indigo-100 active:scale-95 transition-all"
            title="자산 추가"
          >
            <Plus size={18} /> 추가
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
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

            const linkedAccount = accounts.find(acc => acc.id === asset.accountId);
            const displayManagementType = linkedAccount?.type || asset.managementType || AccountType.GENERAL;

            return (
              <div key={asset.id} className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-50 relative group transition-all hover:shadow-xl hover:border-indigo-100">
                <div className="flex justify-between items-start mb-5">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs border transition-all ${getInstitutionColor(asset.institution)}`}>
                      {asset.institution.substring(0,2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`px-2 py-0.5 border rounded text-[8px] font-black uppercase ${getManagementTypeBadge(displayManagementType)}`}>
                          {displayManagementType}
                        </span>
                        {asset.currency === 'USD' && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[8px] font-black uppercase border border-indigo-100">
                            <Globe size={8} /> USD
                          </span>
                        )}
                        {asset.exchange && (
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border ${
                            ['NAS', 'NYS', 'AMS', 'NASDAQ', 'NYSE', 'AMEX'].includes(asset.exchange.toUpperCase()) 
                              ? 'bg-amber-50 text-amber-700 border-amber-100' 
                              : 'bg-slate-50 text-slate-500 border-slate-100'
                          }`}>
                            {asset.exchange}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-[15px] font-black text-slate-800 leading-tight">{asset.name}</h4>
                        {asset.ticker && (
                          <span className="text-[10px] font-bold text-slate-400 font-mono tracking-tight bg-slate-50 px-1.5 py-0.5 rounded-lg border border-slate-100">
                            {asset.ticker}
                          </span>
                        )}
                      </div>
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
                    <p className="text-[11px] font-bold text-slate-600 mt-0.5">
                      @{asset.currency === 'KRW' ? Math.floor(asset.currentPrice).toLocaleString() : asset.currentPrice.toLocaleString(undefined, {minimumFractionDigits: 2})} <span className="text-[9px] text-slate-400">{asset.currency}</span>
                    </p>
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
                    <Tag size={10} className="text-indigo-400" />
                    {asset.type} • {asset.institution}
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
      </div>

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
            
            <div className="p-4 overflow-y-auto no-scrollbar pb-24">
              <div className="space-y-2">
                <AccountListItem 
                  active={selectedAccountId === 'ALL'} 
                  onClick={() => { setSelectedAccountId('ALL'); setIsAccountSheetOpen(false); }}
                  label="전체 계좌 보기"
                />
                
                {accounts.filter(a => !a.isHidden).length > 0 && (
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 pt-2">활성 계좌</p>
                )}
                {accounts.filter(a => !a.isHidden).map(acc => (
                  <AccountListItem 
                    key={acc.id}
                    active={selectedAccountId === acc.id} 
                    onClick={() => { setSelectedAccountId(acc.id); setIsAccountSheetOpen(false); }}
                    account={acc}
                  />
                ))}

                {accounts.filter(a => a.isHidden).length > 0 && (
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 pt-2">숨긴 계좌</p>
                )}
                {accounts.filter(a => a.isHidden).map(acc => (
                  <AccountListItem 
                    key={acc.id}
                    active={selectedAccountId === acc.id} 
                    onClick={() => { setSelectedAccountId(acc.id); setIsAccountSheetOpen(false); }}
                    account={acc}
                  />
                ))}
              </div>
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
    className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${active ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-white text-slate-400 border border-slate-100 hover:border-indigo-100'}`}
  >
    {label}
  </button>
);

export default AssetList;
