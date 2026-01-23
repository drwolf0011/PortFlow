
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, Calendar, Search, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, Loader2, Sparkles, CreditCard, CheckCircle2, Clock, Save, Layers, RefreshCw, BookmarkCheck } from 'lucide-react';
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
    date: transaction?.date || new Date().toLocaleDateString('en-CA'),
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

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  // 나의 보유 자산 중 검색어와 일치하는 항목 제안 (없을 시 최근 자산 순)
  const myAssetSuggestions = useMemo(() => {
    if (!Array.isArray(assets)) return [];
    
    if (!searchTerm.trim()) {
      // 검색어가 없을 때는 비중이 높은 자산 상위 5개를 기본 노출하여 입력 편의성 제공
      return [...assets].sort((a, b) => (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity)).slice(0, 5);
    }
    
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
    setSearchResults([]); // 기존 AI 검색 결과 초기화
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.institution || !formData.price || !formData.quantity || !formData.date) {
      alert("모든 필수 항목을 입력해주세요."); return;
    }
    onSave(formData as Transaction);
  };

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
            <div className="grid grid-cols-5 gap-1.5">
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
                  className={`py-2.5 rounded-xl text-[9px] font-black transition-all border ${formData.assetType === t ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-400 border-slate-100'}`}
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
            </div>
          </div>

          {isCalendarOpen && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsCalendarOpen(false)}>
              <div className="bg-white rounded-[2rem] p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-1">
                    <button onClick={() => changeYear(-1)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><ChevronsLeft size={18}/></button>
                    <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><ChevronLeft size={18}/></button>
                  </div>
                  <h4 className="font-black text-lg text-slate-800 tabular-nums">{viewDate.getFullYear()}년 {viewDate.getMonth() + 1}월</h4>
                  <div className="flex items-center gap-1">
                    <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><ChevronRight size={18}/></button>
                    <button onClick={() => changeYear(1)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"><ChevronsRight size={18}/></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {['일','월','화','수','목','금','토'].map((d, i) => (<div key={d} className={`text-[10px] font-bold ${i === 0 ? 'text-rose-500' : 'text-slate-400'}`}>{d}</div>))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay() }).map((_, i) => (<div key={`empty-${i}`} />))}
                  {Array.from({ length: new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate() }).map((_, i) => {
                    const d = i + 1;
                    const dateStr = `${viewDate.getFullYear()}-${(viewDate.getMonth() + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
                    const isSelected = formData.date === dateStr;
                    return (
                      <button key={d} onClick={() => selectDate(d)} className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${isSelected ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-700 hover:bg-slate-100'}`}>{d}</button>
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

            {/* 자산 제안 팝업 (내 자산 우선순위) */}
            {showSuggestions && (myAssetSuggestions.length > 0 || searchResults.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-[2rem] shadow-2xl border border-slate-100 z-[60] overflow-hidden animate-in slide-in-from-top-2 p-1.5 max-h-80 overflow-y-auto no-scrollbar">
                
                {myAssetSuggestions.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[9px] font-black text-indigo-500 px-3 py-2 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-50 mb-1">
                      <BookmarkCheck size={12} /> My Portfolio Assets
                    </p>
                    {myAssetSuggestions.map((asset) => (
                      <button key={asset.id} type="button" onClick={() => handleSelectAsset(asset)} className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-indigo-50 text-left transition-all rounded-xl border-b border-slate-50 last:border-0 group">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-slate-100 text-indigo-600 rounded-xl flex items-center justify-center font-black text-[10px] uppercase group-hover:bg-indigo-600 group-hover:text-white transition-colors">{asset.type[0]}</div>
                          <div>
                            <p className="text-xs font-black text-slate-800">{asset.name}</p>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{asset.institution}</span>
                              <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                              <span className="text-[10px] font-bold text-slate-400">{asset.ticker}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-slate-900">{Math.floor(asset.currentPrice).toLocaleString()} {asset.currency}</p>
                          <span className="text-[8px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full uppercase tracking-tighter">보유 중</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black text-emerald-500 px-3 py-2 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-50 mb-1">
                      <Sparkles size={12} /> Global AI Results
                    </p>
                    {searchResults.map((info, idx) => (
                      <button key={idx} type="button" onClick={() => handleApplySearchResult(info)} className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-emerald-50 text-left transition-all rounded-xl border-b border-slate-50 last:border-0 group">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-slate-100 text-emerald-600 rounded-xl flex items-center justify-center font-black text-[10px] uppercase group-hover:bg-emerald-600 group-hover:text-white transition-colors">{info.type[0]}</div>
                          <div>
                            <p className="text-xs font-black text-slate-800">{info.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{info.ticker}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-emerald-600">{info.price.toLocaleString()} {info.currency}</p>
                          <span className="text-[8px] font-bold text-slate-300 uppercase italic">{info.type}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">거래 계좌</label>
            <div className="relative">
              <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
              <select name="accountId" value={formData.accountId} onChange={handleChange} className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none appearance-none focus:border-indigo-500 focus:bg-white transition-all">
                <option value="">계좌 선택 (필수)</option>
                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.nickname} ({acc.institution})</option>)}
              </select>
            </div>
          </div>

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
            <button type="submit" className={`w-full text-white py-5 rounded-2xl font-black text-sm transition-all shadow-xl active:scale-95 ${formData.type === TransactionType.BUY ? 'bg-rose-500 shadow-rose-100' : 'bg-blue-500 shadow-blue-100'} flex items-center justify-center gap-2`}><Save size={18} /> 거래 내역 저장하기</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualTransactionEntry;
