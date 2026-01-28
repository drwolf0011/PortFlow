
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, Calendar, Search, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, Loader2, Sparkles, CreditCard, CheckCircle2, Clock, Save, Layers, RefreshCw, BookmarkCheck, Globe, Landmark, Building2 } from 'lucide-react';
import { Transaction, TransactionType, Asset, Account, AssetType, AccountType } from '../types';
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
    managementType: transaction?.managementType || AccountType.GENERAL,
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

  const myAssetSuggestions = useMemo(() => {
    if (!Array.isArray(assets)) return [];
    if (!searchTerm.trim()) {
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

  // 계좌 선택 시 자산관리유형 및 금융기관 자동 연동
  useEffect(() => {
    if (formData.accountId) {
      const acc = accounts.find(a => a.id === formData.accountId);
      if (acc) {
        setFormData(prev => ({
          ...prev,
          managementType: acc.type,
          institution: acc.institution
        }));
      }
    }
  }, [formData.accountId, accounts]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
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

  const handleAISearch = async () => {
    if (!searchTerm.trim() || isSearching) return;
    setIsSearching(true);
    setShowSuggestions(false);
    setSearchResults([]);
    try {
      const results = await searchStockList(searchTerm);
      if (results && results.length > 0) {
        setSearchResults(results);
      }
    } catch (error) { console.error(error); } finally { setIsSearching(false); }
  };

  const handleApplySearchResult = (info: StockInfo) => {
    setFormData(prev => ({ 
      ...prev, 
      name: info.name, 
      price: info.price, 
      currency: info.currency as 'KRW' | 'USD',
      assetType: info.type as AssetType,
      exchangeRate: info.currency === 'USD' ? exchangeRate : 1
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
      managementType: asset.managementType || AccountType.GENERAL,
      institution: asset.institution, 
      currency: asset.currency, 
      price: isCash ? 1 : asset.currentPrice, 
      assetType: asset.type,
      exchangeRate: asset.currency === 'USD' ? exchangeRate : 1
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

  const totalPriceKRW = (formData.price || 0) * (formData.quantity || 0) * (formData.currency === 'USD' ? (formData.exchangeRate || exchangeRate) : 1);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh]">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">{transaction ? '거래 정보 수정' : '거래 등록'}</h3>
            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Transaction Registry</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition-colors"><X size={20} /></button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6 overflow-y-auto no-scrollbar">
          <div className="flex p-1 bg-slate-100 rounded-2xl shrink-0">
            <button type="button" onClick={() => setFormData(prev => ({ ...prev, type: TransactionType.BUY }))} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${formData.type === TransactionType.BUY ? 'bg-rose-500 text-white shadow-md' : 'text-slate-500'}`}>매수(입금)</button>
            <button type="button" onClick={() => setFormData(prev => ({ ...prev, type: TransactionType.SELL }))} className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${formData.type === TransactionType.SELL ? 'bg-blue-500 text-white shadow-md' : 'text-slate-500'}`}>매도(출금)</button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">거래 통화</label>
               <select name="currency" value={formData.currency} onChange={handleChange} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none appearance-none focus:border-indigo-500 transition-all">
                 <option value="KRW">KRW (대한민국 원)</option>
                 <option value="USD">USD (미국 달러)</option>
               </select>
            </div>
            <div className="space-y-1.5">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">거래 일자</label>
               <input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 transition-all" />
            </div>
          </div>

          <div className="space-y-1.5 relative" ref={suggestionRef}>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">종목명/내역</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input 
                  type="text" 
                  name="name"
                  placeholder="종목명 또는 티커 입력" 
                  value={searchTerm} 
                  onChange={handleChange} 
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" 
                />
              </div>
              <button type="button" onClick={handleAISearch} disabled={isSearching || !searchTerm.trim()} className="bg-indigo-600 text-white px-5 rounded-2xl font-black text-xs shadow-lg active:scale-95 disabled:bg-slate-200 transition-all shrink-0">
                {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              </button>
            </div>

            {showSuggestions && (myAssetSuggestions.length > 0 || searchResults.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-[2rem] shadow-2xl border border-slate-100 z-[60] overflow-hidden animate-in slide-in-from-top-2 p-1.5 max-h-80 overflow-y-auto no-scrollbar">
                {myAssetSuggestions.map((asset) => (
                  <button key={asset.id} type="button" onClick={() => handleSelectAsset(asset)} className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-indigo-50 text-left transition-all rounded-xl border-b border-slate-50 last:border-0 group">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-100 text-indigo-600 rounded-xl flex items-center justify-center font-black text-[10px] group-hover:bg-indigo-600 group-hover:text-white transition-colors">{asset.type[0]}</div>
                      <div>
                        <p className="text-xs font-black text-slate-800">{asset.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{asset.institution}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-slate-900">{Math.floor(asset.currentPrice).toLocaleString()} {asset.currency}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">금융기관</label>
              <div className="relative">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input type="text" name="institution" placeholder="증권사/은행명" value={formData.institution} onChange={handleChange} className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 transition-all" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">자산 종류</label>
              <div className="relative">
                <Layers className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <select name="assetType" value={formData.assetType} onChange={handleChange} className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none appearance-none focus:border-indigo-500 transition-all cursor-pointer">
                  {Object.values(AssetType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">거래 계좌</label>
              <select name="accountId" value={formData.accountId} onChange={handleChange} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 transition-all">
                <option value="">직접 입력 / 계좌 미지정</option>
                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.nickname} ({acc.institution})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">자산관리유형</label>
              <div className="relative">
                <Landmark className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" size={14} />
                <select name="managementType" value={formData.managementType} onChange={handleChange} className="w-full pl-11 pr-4 py-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl text-[11px] font-black text-indigo-700 outline-none focus:border-indigo-500 transition-all appearance-none">
                  {Object.values(AccountType).map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">수량</label>
              <input type="number" name="quantity" placeholder="0" value={formData.quantity || ''} onChange={handleChange} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 transition-all" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">거래 단가 ({formData.currency})</label>
              <input type="number" name="price" placeholder="0" value={formData.price || ''} onChange={handleChange} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 transition-all" />
            </div>
          </div>

          {formData.currency === 'USD' && (
            <div className="space-y-1.5 animate-in slide-in-from-top-2">
              <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1 flex items-center gap-1">
                <Globe size={10}/> 거래 시점 적용 환율 (1 USD)
              </label>
              <input 
                type="number" 
                name="exchangeRate" 
                placeholder={exchangeRate.toString()} 
                value={formData.exchangeRate || ''} 
                onChange={handleChange} 
                className="w-full px-4 py-4 bg-indigo-50/30 border border-indigo-100 rounded-2xl text-sm font-black text-indigo-700 outline-none focus:border-indigo-500 transition-all" 
              />
              <p className="text-[9px] font-bold text-slate-400 ml-1 italic">* 환차손익의 정확한 계산을 위해 거래 당시의 원화 결제 환율을 입력해주세요.</p>
            </div>
          )}

          <div className={`rounded-[1.5rem] p-5 border flex items-center justify-between font-bold text-sm shrink-0 ${formData.type === TransactionType.BUY ? 'bg-rose-50 border-rose-100' : 'bg-blue-50 border-blue-100'}`}>
            <span className="text-slate-500 font-black">원화 환산 총액 (성과 기준액)</span>
            <span className={`text-lg font-black ${formData.type === TransactionType.BUY ? 'text-rose-600' : 'text-blue-600'}`}>{Math.floor(totalPriceKRW).toLocaleString()}원</span>
          </div>

          <div className="pb-16">
            <button type="submit" className={`w-full text-white py-5 rounded-2xl font-black text-sm transition-all shadow-xl active:scale-95 ${formData.type === TransactionType.BUY ? 'bg-rose-500 shadow-rose-100' : 'bg-blue-500 shadow-blue-100'} flex items-center justify-center gap-2`}><Save size={18} /> 거래 내역 저장</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualTransactionEntry;
