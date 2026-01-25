
import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, TransactionType, Account } from '../types';
import { Search, Filter, History, TrendingUp, TrendingDown, Inbox, CreditCard, Trash2, AlertCircle, Edit3, MoreVertical, Sparkles, Loader2, X } from 'lucide-react';
import { classifyTransactionTypes } from '../services/geminiService';

interface TransactionHistoryProps {
  transactions: Transaction[];
  accounts: Account[];
  onDelete: (id: string) => void;
  onEdit: (tx: Transaction) => void;
  onUpdate: (txs: Transaction[]) => void;
  exchangeRate: number;
}

const TransactionHistory: React.FC<TransactionHistoryProps> = ({ transactions, accounts, onDelete, onEdit, onUpdate, exchangeRate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAccountId, setFilterAccountId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | TransactionType>('ALL');
  const [isClassifying, setIsClassifying] = useState(false);
  const [activeHintLabel, setActiveHintLabel] = useState<string | null>(null);

  // 페이지 진입 시 자산 목록으로부터 전달된 필터 힌트(이름 + 계좌ID)가 있는지 확인
  useEffect(() => {
    const nameHint = sessionStorage.getItem('tx_filter_name');
    const accountHint = sessionStorage.getItem('tx_filter_account_id');
    
    if (nameHint) {
      setSearchTerm(nameHint);
      const acc = accounts.find(a => a.id === accountHint);
      setFilterAccountId(accountHint || null);
      
      // 안내 문구 생성
      const hintLabel = acc ? `[${acc.nickname}] ${nameHint}` : nameHint;
      setActiveHintLabel(hintLabel);
      
      // 일회성 필터링이므로 사용 후 즉시 제거
      sessionStorage.removeItem('tx_filter_name');
      sessionStorage.removeItem('tx_filter_account_id');
    }
  }, [accounts]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchSearch = tx.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          tx.institution.toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = filterType === 'ALL' || tx.type === filterType;
      const matchAccount = !filterAccountId || tx.accountId === filterAccountId;
      
      return matchSearch && matchType && matchAccount;
    });
  }, [transactions, searchTerm, filterType, filterAccountId]);

  const formatCurrency = (val: number, currency: string) => {
    if (currency === 'USD') return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `${Math.floor(val).toLocaleString()}원`;
  };

  const getAccountNickname = (accountId?: string) => {
    if (!accountId) return null;
    return accounts.find(a => a.id === accountId)?.nickname;
  };

  const handleDelete = (e: React.MouseEvent, tx: Transaction) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm(`'${tx.name}' 거래 내역을 영구히 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.`)) {
      onDelete(tx.id);
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
    setActiveHintLabel(null);
  };

  const handleAutoClassify = async () => {
    if (filteredTransactions.length === 0) return;
    setIsClassifying(true);
    
    const targets = filteredTransactions.map(t => ({ id: t.id, name: t.name, institution: t.institution }));
    
    try {
      const results = await classifyTransactionTypes(targets);
      
      if (results.length > 0) {
        const classificationMap = new Map(results.map(r => [r.id, r.type]));
        
        const updatedTransactions = transactions.map(t => {
          const newType = classificationMap.get(t.id);
          return newType ? { ...t, assetType: newType } : t;
        });
        
        onUpdate(updatedTransactions);
      }
    } catch (e) {
      console.error(e);
      alert("자동 분류 중 오류가 발생했습니다.");
    } finally {
      setIsClassifying(false);
    }
  };

  return (
    <div className="p-5 space-y-6 pb-28">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-100"><History size={20} /></div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">거래 기록 아카이브</h3>
          </div>
          <button 
            onClick={handleAutoClassify}
            disabled={isClassifying || filteredTransactions.length === 0}
            className={`flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black border border-indigo-100 active:scale-95 transition-all ${isClassifying ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isClassifying ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            AI 자동 분류
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
              className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all border ${filterType === TransactionType.SELL ? 'bg-blue-500 text-white border-blue-500 shadow-md' : 'bg-white text-slate-400 border-slate-200'}`}
            >
              매도
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredTransactions.length > 0 ? (
          filteredTransactions.map((tx) => {
            const isBuy = tx.type === TransactionType.BUY;
            const nickname = getAccountNickname(tx.accountId);
            const totalVal = tx.price * tx.quantity;
            const totalKRW = tx.currency === 'USD' ? totalVal * (tx.exchangeRate || exchangeRate) : totalVal;

            return (
              <div key={tx.id} className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-50 transition-all hover:shadow-md hover:border-indigo-100 relative group overflow-hidden">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex flex-col pr-20">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${isBuy ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'}`}>
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
                      onClick={(e) => handleDelete(e, tx)}
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
                  <p className={`text-sm font-black ${isBuy ? 'text-rose-500' : 'text-blue-500'}`}>
                    {isBuy ? '+' : '-'}{Math.floor(totalKRW).toLocaleString()}원
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
      </div>

      <div className="bg-slate-100 p-4 rounded-2xl flex items-center gap-3">
        <AlertCircle size={16} className="text-slate-400 shrink-0" />
        <p className="text-[10px] font-bold text-slate-500 leading-relaxed">
          내역을 삭제하거나 수정하면 자산 현황이 자동으로 재계산되어<br />실제 보유 자산과 실시간으로 동기화됩니다.
        </p>
      </div>
    </div>
  );
};

export default TransactionHistory;
