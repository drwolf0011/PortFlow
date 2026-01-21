
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, Calendar, Search, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, Loader2, Sparkles, CreditCard, CheckCircle2, Clock, Save, Layers } from 'lucide-react';
import { Transaction, TransactionType, Asset, Account, AssetType } from '../types';
import { searchStockList, StockInfo } from '../services/geminiService';

interface ManualTransactionEntryProps {
  onClose: () => void;
  onSave: (transaction: Transaction) => void;
  assets: Asset[];
  accounts: Account[];
  transaction?: Transaction;
  exchangeRate: number;
}

const ManualTransactionEntry: React.FC<ManualTransactionEntryProps> = ({ onClose, onSave, assets, accounts, transaction, exchangeRate }) => {
  const [formData, setFormData] = useState<Partial<Transaction>>({
    id: transaction?.id || Math.random().toString(36).substr(2, 9),
    date: transaction?.date || new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD local
    type: transaction?.type || TransactionType.BUY,
    assetType: transaction?.assetType || AssetType.STOCK,
    accountId: transaction?.accountId || '',
    institution: transaction?.institution || '',
    name: transaction?.name || '',
    quantity: transaction?.quantity || 0,
    price: transaction?.price || 0,
    currency: transaction?.currency || 'KRW',
    exchangeRate: transaction?.exchangeRate || exchangeRate
  });

  const [searchTerm, setSearchTerm] = useState(transaction?.name || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<StockInfo[]>([]);
  const suggestionRef = useRef<HTMLDivElement>(null);

  // Custom Calendar State
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  const suggestions = useMemo(() => {
    if (!searchTerm.trim() || !Array.isArray(assets)) return [];
    
    return assets.filter(asset => 
      asset.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (asset.ticker && asset.ticker.toLowerCase().includes(searchTerm.toLowerCase()))
    ).slice(0, 5);
  }, [assets, searchTerm]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if(formData.date) {
      const [y, m, d] = formData.date.split('-').map(Number);
      setViewDate(new Date(y, m - 1, d));
    }
  }, [isCalendarOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'accountId') {
      const acc = accounts.find(a => a.id === value);
      setFormData(prev => ({
        ...prev,
        accountId: value,
        institution: acc ? acc.institution : prev.institution
      }));
      return;
    }

    if (name === 'name') {
      setSearchTerm(value);
      setFormData(prev => ({ ...prev, name: value }));
      setShowSuggestions(true);
      return;
    }

    setFormData(prev => ({
      ...prev,
      [name]: name === 'quantity' || name === 'price' || name === 'exchangeRate'
        ? parseFloat(value) || 0 
        : value
    }));
  };

  const handleSetPastDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    setFormData(prev => ({ ...prev, date: d.toLocaleDateString('en-CA') }));
  };

  const handleSetPastMonth = (months: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    setFormData(prev => ({ ...prev, date: d.toLocaleDateString('en-CA') }));
  };

  const handleSetPastYear = (years: number) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    setFormData(prev => ({ ...prev, date: d.toLocaleDateString('en-CA') }));
  };

  const handleAISearch = async () => {
    if (!searchTerm.trim() || isSearching) return;
    setIsSearching(true);
    setShowSuggestions(false);
    setSearchResults([]);
    try {
      const results = await searchStockList(searchTerm);
      if (results && results.length > 0) {
        setSearchResults(results);
      } else {
        alert("검색 결과가 없습니다.");
      }
    } catch (error) { 
      console.error(error); 
    } finally { 
      setIsSearching(false); 
    }
  };

  const handleApplySearchResult = (info: StockInfo) => {
    setFormData(prev => ({ 
      ...prev, 
      name: info.name, 
      price: info.price, 
      currency: info.currency as 'KRW' | 'USD',
      assetType: info.type as AssetType
    }));
    setSearchTerm(info.name);
    setSearchResults([]);
    setShowSuggestions(false);
  };

  const handleSelectAsset = (asset: Asset) => {
    const isCash = asset.type === AssetType.CASH;
    setFormData(prev => ({ 
      ...prev, 
      name: asset.name, 
      accountId: asset.accountId || '', 
      institution: asset.institution, 
      currency: asset.currency, 
      price: isCash ? 1 : asset.currentPrice, 
      assetType: asset.type
    }));
    setSearchTerm(asset.name);
    setShowSuggestions(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.institution || !formData.price || !formData.quantity || !formData.date) {
      alert("모든 필수 항목을 입력해주세요."); return;
    }
    onSave(formData as Transaction);
  };

  // Calendar Helpers
  const changeMonth = (delta: number) => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const changeYear = (delta: number) => {
    setViewDate(prev => new Date(prev.getFullYear() + delta, prev.getMonth(), 1));
  };
  
  const selectDate = (day: number) => {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth() + 1;
    const dateStr = `${y}-${m.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    setFormData(prev => ({ ...prev, date: dateStr }));
    setIsCalendarOpen(false);
  };

  const currentRate = formData.currency === 'USD' ? (formData.exchangeRate || exchangeRate) : 1;
  const totalPriceKRW = (formData.price || 0) * (formData.quantity || 0) * currentRate;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh]">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">{transaction ? '거래 정보 수정' : '거래 기록 입력'}</h3>
            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Transaction Registry</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6 overflow-y-auto no-scrollbar">
          <div className="flex p-1 bg-slate-100 rounded-2xl shrink-0">
            <button type="button" onClick={() => setFormData(prev => ({ ...prev, type: TransactionType.BUY }))} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${formData.type === TransactionType.BUY ? 'bg-rose-500 text-white shadow-md' : 'text-slate-500'}`}>매수(입금)</button>
            <button type="button" onClick={() => setFormData(prev => ({ ...prev, type: TransactionType.SELL }))} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${formData.type === TransactionType.SELL ? 'bg-blue-500 text-white shadow-md' : 'text-slate-500'}`}>매도(출금)</button>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">자산 종류</label>
            <div className="grid grid-cols-4 gap-2">
              {Object.values(AssetType).map(t => (
                <button 
                  key={t}
                  type="button"
                  onClick={() => {
                    const updates: any = { assetType: t };
                    if (t === AssetType.CASH) {
                      updates.name = formData.name || '현금';
                      updates.price = 1; 
                      setSearchTerm(formData.name || '현금');
                    }
                    setFormData(prev => ({ ...prev, ...updates }));
                  }}
                  className={`py-3 rounded-xl text-[10px] font-black transition-all border ${formData.assetType === t ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-400 border-slate-100'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">거래 일자</label>
            
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
              <button 
                type="button"
                onClick={() => setIsCalendarOpen(true)}
                className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-left outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-800"
              >
                {formData.date || '날짜 선택'}
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              <button type="button" onClick={() => handleSetPastDate(0)} className="flex-shrink-0 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-[10px] border border-indigo-100 active:scale-95 transition-all">오늘</button>
              <button type="button" onClick={() => handleSetPastDate(1)} className="flex-shrink-0 px-4 py-2 bg-white text-slate-500 rounded-xl font-black text-[10px] border border-slate-200 active:scale-95 transition-all">어제</button>
              <button type="button" onClick={() => handleSetPastDate(7)} className="flex-shrink-0 px-4 py-2 bg-white text-slate-500 rounded-xl font-black text-[10px] border border-slate-200 active:scale-95 transition-all">1주 전</button>
              <button type="button" onClick={() => handleSetPastMonth(1)} className="flex-shrink-0 px-4 py-2 bg-white text-slate-500 rounded-xl font-black text-[10px] border border-slate-200 active:scale-95 transition-all">1개월 전</button>
              <button type="button" onClick={() => handleSetPastMonth(3)} className="flex-shrink-0 px-4 py-2 bg-white text-slate-500 rounded-xl font-black text-[10px] border border-slate-200 active:scale-95 transition-all">3개월 전</button>
              <button type="button" onClick={() => handleSetPastYear(1)} className="flex-shrink-0 px-4 py-2 bg-white text-slate-500 rounded-xl font-black text-[10px] border border-slate-200 active:scale-95 transition-all">1년 전</button>
            </div>
          </div>

          {/* Calendar Modal */}
          {isCalendarOpen && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsCalendarOpen(false)}>
              <div className="bg-white rounded-[2rem] p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <div className="flex flex-col gap-4 mb-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button onClick={() => changeYear(-1)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400" title="1년 전"><ChevronsLeft size={18}/></button>
                      <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400" title="1달 전"><ChevronLeft size={18}/></button>
                    </div>
                    <h4 className="font-black text-lg text-slate-800 tabular-nums">
                      {viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월
                    </h4>
                    <div className="flex items-center gap-1">
                      <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400" title="1달 후"><ChevronRight size={18}/></button>
                      <button onClick={() => changeYear(1)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400" title="1년 후"><ChevronsRight size={18}/></button>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {['일','월','화','수','목','금','토'].map((d, i) => (
                    <div key={d} className={`text-[10px] font-bold ${i === 0 ? 'text-rose-500' : 'text-slate-400'}`}>{d}</div>
                  ))}
                </div>
                
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay() }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  {Array.from({ length: new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                    const d = i + 1;
                    const dateStr = `${viewDate.getFullYear()}-${(viewDate.getMonth() + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                    const isSelected = formData.date === dateStr;
                    const isToday = new Date().toLocaleDateString('en-CA') === dateStr;
                    
                    return (
                      <button 
                        key={d}
                        onClick={() => selectDate(d)}
                        className={`
                          h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all relative
                          ${isSelected 
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 scale-110 z-10' 
                            : 'text-slate-700 hover:bg-slate-100'
                          }
                          ${isToday && !isSelected ? 'border-2 border-indigo-600 text-indigo-600' : ''}
                        `}
                      >
                        {d}
                        {isToday && !isSelected && <div className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-600 rounded-full"></div>}
                      </button>
                    );
                  })}
                </div>
                
                <button onClick={() => setIsCalendarOpen(false)} className="w-full mt-6 py-3 bg-slate-100 rounded-xl text-xs font-black text-slate-600">닫기</button>
              </div>
            </div>
          )}

          <div className="space-y-1.5 relative" ref={suggestionRef}>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">종목명/내역</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input 
                  type="text" 
                  name="name"
                  placeholder={formData.assetType === AssetType.CASH ? "예: 일반 현금, 예수금" : "종목명 또는 티커 입력"} 
                  value={searchTerm} 
                  onChange={handleChange} 
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" 
                />
              </div>
              {formData.assetType !== AssetType.CASH && (
                <button type="button" onClick={handleAISearch} disabled={isSearching || !searchTerm.trim()} className="bg-indigo-600 text-white px-5 rounded-2xl font-black text-xs shadow-lg active:scale-95 disabled:bg-slate-200 transition-all shrink-0">
                  {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                </button>
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[60] overflow-hidden animate-in slide-in-from-top-2 p-1">
                <p className="text-[9px] font-black text-indigo-500 px-3 py-2 uppercase tracking-widest bg-indigo-50 flex items-center gap-1.5"><Sparkles size={10} /> AI 검색 결과 (자산유형 자동 분류)</p>
                {searchResults.map((info, idx) => (
                  <button key={idx} type="button" onClick={() => handleApplySearchResult(info)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-indigo-50 text-left transition-colors border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-black text-[9px] uppercase">{info.type[0]}</div>
                      <div>
                        <p className="text-xs font-black text-slate-800">{info.name} <span className="text-slate-300 ml-1">({info.ticker})</span></p>
                        <p className="text-[10px] font-bold text-slate-400">{info.market || 'Real-time'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-black text-indigo-600">{info.price.toLocaleString()} {info.currency}</p>
                      <span className="text-[8px] font-black px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">{info.type}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {showSuggestions && suggestions.length > 0 && searchResults.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in slide-in-from-top-2">
                <p className="text-[9px] font-black text-slate-400 px-3 py-2 uppercase tracking-widest bg-slate-50">내 보유 자산</p>
                {suggestions.map((asset) => (
                  <button key={asset.id} type="button" onClick={() => handleSelectAsset(asset)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-indigo-50 text-left transition-colors border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-3"><div className="w-8 h-8 bg-slate-200 text-slate-500 rounded-lg flex items-center justify-center font-black text-[9px]">{asset.type[0]}</div><div><p className="text-xs font-black text-slate-800">{asset.name}</p><p className="text-[10px] font-bold text-slate-400">{asset.institution}</p></div></div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">{asset.currency}</span>
                      <ChevronRight size={14} className="text-slate-300" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">거래 계좌/기관</label>
            <div className="relative">
              <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
              <select name="accountId" value={formData.accountId} onChange={handleChange} className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none appearance-none focus:border-indigo-500 focus:bg-white transition-all">
                <option value="">계좌를 선택하거나 직접 입력</option>
                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.nickname} ({acc.institution})</option>)}
              </select>
            </div>
          </div>

          {!formData.accountId && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">금융기관 직접 입력</label>
              <input type="text" name="institution" placeholder="증권사/은행명 입력" value={formData.institution} onChange={handleChange} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{formData.assetType === AssetType.CASH ? '현금 금액' : '수량'}</label>
              <input type="number" name="quantity" placeholder="0" value={formData.quantity || ''} onChange={handleChange} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">단가 ({formData.currency})</label>
              <input type="number" name="price" placeholder="0" value={formData.price || ''} onChange={handleChange} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" />
            </div>
          </div>

          <div className={`rounded-[1.5rem] p-5 border flex items-center justify-between font-bold text-sm shrink-0 ${formData.type === TransactionType.BUY ? 'bg-rose-50 border-rose-100' : 'bg-blue-50 border-blue-100'}`}>
            <span className="text-slate-500 font-black">원화 환산 총액</span>
            <span className={`text-lg font-black ${formData.type === TransactionType.BUY ? 'text-rose-600' : 'text-blue-600'}`}>{totalPriceKRW.toLocaleString()}원</span>
          </div>

          <div className="pb-16">
            <button 
              type="submit" 
              className={`w-full text-white py-5 rounded-2xl font-black text-sm transition-all shadow-xl active:scale-95 ${formData.type === TransactionType.BUY ? 'bg-rose-500 shadow-rose-100' : 'bg-blue-500 shadow-blue-100'} flex items-center justify-center gap-2`}
            >
              <Save size={18} />
              거래 내역 저장하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualTransactionEntry;
