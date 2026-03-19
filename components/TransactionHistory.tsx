
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, TransactionType, Account } from '../types';
import { Search, Filter, History, TrendingUp, TrendingDown, Inbox, CreditCard, Trash2, AlertCircle, Edit3, MoreVertical, Sparkles, Loader2, X, Plus, AlertTriangle } from 'lucide-react';

interface TransactionHistoryProps {
  transactions: Transaction[];
  accounts: Account[];
  onDelete: (id: string) => void;
  onEdit: (tx: Transaction) => void;
  onUpdate: (txs: Transaction[]) => void;
  onAdd: () => void;
  exchangeRate: number;
}

const TransactionHistory: React.FC<TransactionHistoryProps> = ({ transactions, accounts, onDelete, onEdit, onUpdate, onAdd, exchangeRate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAccountId, setFilterAccountId] = useState<string | null>(null);
  const [filterAssetId, setFilterAssetId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | TransactionType>('ALL');
  const [activeHintLabel, setActiveHintLabel] = useState<string | null>(null);
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);

  // 페이지 진입 시 자산 목록으로부터 전달된 필터 힌트(이름 + 계좌ID)가 있는지 확인
  useEffect(() => {
    const nameHint = sessionStorage.getItem('tx_filter_name');
    const accountHint = sessionStorage.getItem('tx_filter_account_id');
    const assetHint = sessionStorage.getItem('tx_filter_asset_id');
    
    if (nameHint || assetHint) {
      setSearchTerm(nameHint || '');
      setFilterAccountId(accountHint || null);
      setFilterAssetId(assetHint || null);
      
      // 안내 문구 생성
      const acc = accounts.find(a => a.id === accountHint);
      const hintLabel = acc ? `[${acc.nickname}] ${nameHint || '자산'}` : (nameHint || '선택 자산');
      setActiveHintLabel(hintLabel);
      
      // 일회성 필터링이므로 사용 후 즉시 제거
      sessionStorage.removeItem('tx_filter_name');
      sessionStorage.removeItem('tx_filter_account_id');
      sessionStorage.removeItem('tx_filter_asset_id');
    }
  }, [accounts]);

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter(tx => {
        const matchSearch = tx.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            tx.institution.toLowerCase().includes(searchTerm.toLowerCase());
        const matchType = filterType === 'ALL' || tx.type === filterType;
        const matchAccount = !filterAccountId || tx.accountId === filterAccountId;
        const matchAsset = !filterAssetId || tx.assetId === filterAssetId;
        
        return matchSearch && matchType && matchAccount && matchAsset;
      })
      .sort((a, b) => {
        // 1. Sort by accountId
        const accA = a.accountId || '';
        const accB = b.accountId || '';
        const accComp = accA.localeCompare(accB);
        if (accComp !== 0) return accComp;

        // 2. Sort by assetId
        const assetA = a.assetId || '';
        const assetB = b.assetId || '';
        const assetComp = assetA.localeCompare(assetB);
        if (assetComp !== 0) return assetComp;

        // 3. Sort by date (descending - newest first)
        return b.date.localeCompare(a.date);
      });
  }, [transactions, searchTerm, filterType, filterAccountId, filterAssetId]);

  const formatCurrency = (val: number, currency: string) => {
    if (currency === 'USD') return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `${Math.floor(val).toLocaleString()}원`;
  };

  const getAccountNickname = (accountId?: string) => {
    if (!accountId) return null;
    return accounts.find(a => a.id === accountId)?.nickname;
  };

  const handleDeleteClick = (e: React.MouseEvent, tx: Transaction) => {
    e.preventDefault();
    e.stopPropagation();
    setDeletingTx(tx);
  };

  const handleConfirmDelete = () => {
    if (deletingTx) {
      onDelete(deletingTx.id);
      setDeletingTx(null);
    }
  };

  const handleEdit = (e: React.MouseEvent, tx: Transaction) => {
    e.preventDefault();
    e.stopPropagation();
    onEdit(tx);
  };

  const handleClearFilter = () => {
    setSearchTerm('');
    setFilterAccountId(null);
    setFilterAssetId(null);
    setActiveHintLabel(null);
  };

  return (
    <div className="pb-28">
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-20 px-5 py-4 bg-[#F4F7FB]/95 backdrop-blur-xl border-b border-slate-200/50 flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100"><History size={20} /></div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">거래 기록 아카이브</h3>
          </div>
          <button 
            onClick={onAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-full text-[10px] font-black shadow-sm active:scale-95 transition-all"
          >
            <Plus size={14} />
            거래 등록
          </button>
        </div>
        
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search size={16} className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${searchTerm ? 'text-indigo-600' : 'text-slate-400'}`} />
            <input 
              type="text" 
              placeholder="종목 또는 기관 검색" 
              value={searchTerm} 
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (activeHintLabel) handleClearFilter();
              }}
              className="pl-11 pr-12 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium w-full outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
            />
            {searchTerm && (
              <button 
                onClick={handleClearFilter}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-slate-100 text-slate-400 rounded-full hover:bg-slate-200 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {activeHintLabel && (
            <div className="px-1 flex items-center gap-1.5 animate-in slide-in-from-top-1">
              <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100/50 flex items-center gap-1">
                <Sparkles size={10} /> '{activeHintLabel}' 자산 필터 적용 중
              </span>
              <button onClick={handleClearFilter} className="text-[9px] font-bold text-slate-400 hover:text-indigo-600 underline underline-offset-2">필터 해제</button>
            </div>
          )}

          <div className="flex gap-2">
            <button 
              onClick={() => setFilterType('ALL')}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all border ${filterType === 'ALL' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}
            >
              전체
            </button>
            <button 
              onClick={() => setFilterType(TransactionType.BUY)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all border ${filterType === TransactionType.BUY ? 'bg-rose-500 text-white border-rose-500 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}
            >
              매수
            </button>
            <button 
              onClick={() => setFilterType(TransactionType.SELL)}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all border ${filterType === TransactionType.SELL ? 'bg-blue-500 text-white border-blue-500 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}
            >
              매도
            </button>
            <button 
              onClick={() => setFilterType(TransactionType.DEPOSIT)}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all border ${filterType === TransactionType.DEPOSIT ? 'bg-emerald-500 text-white border-emerald-500 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}
            >
              입금
            </button>
            <button 
              onClick={() => setFilterType(TransactionType.WITHDRAW)}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-black transition-all border ${filterType === TransactionType.WITHDRAW ? 'bg-amber-500 text-white border-amber-500 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}
            >
              출금
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {filteredTransactions.length > 0 ? (
          filteredTransactions.map((tx) => {
            const isBuy = tx.type === TransactionType.BUY;
            const isSell = tx.type === TransactionType.SELL;
            const isDeposit = tx.type === TransactionType.DEPOSIT;
            const isWithdraw = tx.type === TransactionType.WITHDRAW;
            
            const nickname = getAccountNickname(tx.accountId);
            const totalVal = tx.price * tx.quantity;
            const totalKRW = tx.currency === 'USD' ? totalVal * (tx.exchangeRate || exchangeRate) : totalVal;

            const typeColor = isBuy ? 'bg-rose-50 text-rose-600' : 
                             isSell ? 'bg-blue-50 text-blue-600' :
                             isDeposit ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600';

            const amountColor = isBuy || isWithdraw ? 'text-rose-500' : 'text-blue-500';
            const amountPrefix = isBuy || isWithdraw ? '-' : '+';

            return (
              <div key={tx.id} className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-50 transition-all hover:shadow-md hover:border-indigo-100 relative group overflow-hidden">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex flex-col pr-20">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${typeColor}`}>
                        {tx.type}
                      </span>
                      <span className="text-[10px] font-bold text-slate-300">{tx.date}</span>
                    </div>
                    <h4 className="text-sm font-black text-slate-800 leading-tight">{tx.name}</h4>
                  </div>
                  
                  <div className="flex gap-1 absolute right-3 top-4 z-20">
                    <button 
                      onClick={(e) => handleEdit(e, tx)}
                      className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all active:scale-90"
                      title="거래 수정"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button 
                      onClick={(e) => handleDeleteClick(e, tx)}
                      className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-90"
                      title="거래 삭제"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-50 relative">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">거래 상세</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-black bg-slate-100 text-slate-500`}>
                        {tx.assetType}
                      </span>
                      <p className="text-[11px] font-bold text-slate-600">
                        {tx.quantity.toLocaleString()}주 @ {formatCurrency(tx.price, tx.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">계좌 / 기관</p>
                    <div className="flex items-center justify-end gap-1">
                      {nickname && (
                        <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                          {nickname}
                        </span>
                      )}
                      <span className="text-[11px] font-bold text-slate-600">{tx.institution}</span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">원화 환산 합계</span>
                  <p className={`text-sm font-black ${amountColor}`}>
                    {amountPrefix}{Math.floor(totalKRW).toLocaleString()}원
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-24 text-center flex flex-col items-center justify-center gap-4 opacity-20">
            <Inbox size={48} />
            <p className="font-black">거래 내역이 없습니다.</p>
          </div>
        )}

        <div className="bg-slate-100 p-4 rounded-2xl flex items-center gap-3">
          <AlertCircle size={16} className="text-slate-400 shrink-0" />
          <p className="text-[10px] font-bold text-slate-500 leading-relaxed">
            내역을 삭제하거나 수정하면 자산 현황이 자동으로 재계산되어<br />실제 보유 자산과 실시간으로 동기화됩니다.
          </p>
        </div>
      </div>

      {deletingTx && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setDeletingTx(null)}></div>
          <div className="relative bg-white w-full max-w-sm rounded-[2rem] p-6 shadow-2xl animate-in zoom-in-95">
             <div className="flex flex-col items-center text-center mb-6">
                <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mb-4">
                  <AlertTriangle size={32} />
                </div>
                <h3 className="text-lg font-black text-slate-800 mb-2">거래 내역 삭제</h3>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  <span className="text-slate-800 font-bold">{deletingTx.name}</span><br/>
                  이 내역을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.
                </p>
             </div>
             <div className="flex gap-2">
               <button onClick={handleConfirmDelete} className="flex-1 bg-rose-500 text-white py-3 rounded-xl font-black text-sm active:scale-95 transition-all">삭제</button>
               <button onClick={() => setDeletingTx(null)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-black text-sm active:scale-95 transition-all">취소</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;
