
import React, { useState, useEffect } from 'react';
import { X, Save, CreditCard, Sparkles, Loader2, Search, CheckCircle2, Building2, Landmark } from 'lucide-react';
import { Asset, AssetType, Account, AccountType } from '../types';
import { searchStockList, StockInfo } from '../services/geminiService';

interface ManualAssetEntryProps {
  onClose: () => void;
  onSave: (asset: Asset) => void;
  asset?: Asset;
  accounts: Account[];
  exchangeRate: number;
}

const ManualAssetEntry: React.FC<ManualAssetEntryProps> = ({ onClose, onSave, asset, accounts, exchangeRate }) => {
  const [formData, setFormData] = useState<Partial<Asset>>({
    id: asset?.id || Math.random().toString(36).substr(2, 9),
    accountId: asset?.accountId || '',
    managementType: asset?.managementType || AccountType.GENERAL,
    name: asset?.name || '',
    institution: asset?.institution || '',
    type: asset?.type || AssetType.STOCK,
    quantity: asset?.quantity || 0,
    purchasePrice: asset?.purchasePrice || 0,
    currentPrice: asset?.currentPrice || 0,
    currency: asset?.currency || 'KRW',
  });

  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState(asset?.name || '');
  const [searchResults, setSearchResults] = useState<StockInfo[]>([]);

  // 계좌 선택 시 계좌 유형을 자산관리유형으로 자동 연동
  useEffect(() => {
    if (formData.accountId) {
      const selectedAcc = accounts.find(a => a.id === formData.accountId);
      if (selectedAcc) {
        setFormData(prev => ({ 
          ...prev, 
          managementType: selectedAcc.type,
          institution: selectedAcc.institution 
        }));
      }
    }
  }, [formData.accountId, accounts]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: name === 'quantity' || name === 'purchasePrice' || name === 'currentPrice' 
        ? parseFloat(value) || 0 
        : value
    }));

    if (name === 'name') {
      setSearchTerm(value);
    }
  };

  const handleAISearch = async () => {
    if (!searchTerm.trim() || isSearching) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      const results = await searchStockList(searchTerm);
      if (results && results.length > 0) {
        setSearchResults(results);
      } else {
        alert("해당 종목의 정보를 찾을 수 없습니다.");
      }
    } catch (error) {
      console.error(error);
      alert("정보 조회 중 오류가 발생했습니다.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectStock = (info: StockInfo) => {
    setFormData(prev => ({
      ...prev,
      name: info.name,
      ticker: info.ticker,
      currentPrice: info.price,
      purchasePrice: prev.purchasePrice || info.price, 
      currency: info.currency as 'KRW' | 'USD',
      type: info.type as AssetType
    }));
    setSearchTerm(info.name);
    setSearchResults([]);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.institution) {
      alert("종목명과 금융기관을 입력해주세요."); return;
    }
    onSave(formData as Asset);
  };

  const currentKRW = formData.currency === 'USD' ? (formData.currentPrice || 0) * exchangeRate : (formData.currentPrice || 0);
  const totalKRW = currentKRW * (formData.quantity || 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh]">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">{asset ? '자산 정보 수정' : '자산 추가'}</h3>
            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Asset Management</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors"><X size={20} /></button>
        </div>
        
        <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto no-scrollbar">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">연결 계좌</label>
              <div className="relative">
                <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <select name="accountId" value={formData.accountId} onChange={handleChange} className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none appearance-none focus:border-indigo-500 focus:bg-white transition-all">
                  <option value="">미연결 (직접 입력)</option>
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.nickname} ({acc.institution})</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">자산관리유형</label>
              <div className="relative">
                <Landmark className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" size={16} />
                <select 
                  name="managementType" 
                  value={formData.managementType} 
                  onChange={handleChange} 
                  className="w-full pl-11 pr-4 py-4 bg-indigo-50 border border-indigo-100 rounded-xl text-sm font-black outline-none appearance-none focus:border-indigo-500 transition-all text-indigo-700"
                >
                  {Object.values(AccountType).map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">종목명 (직접 입력 가능)</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input 
                  type="text" 
                  name="name"
                  placeholder="예: 삼성전자, 테슬라 등" 
                  value={searchTerm} 
                  onChange={handleChange} 
                  className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" 
                />
              </div>
              <button 
                type="button" 
                onClick={handleAISearch} 
                disabled={isSearching || !searchTerm.trim()}
                className="bg-indigo-600 text-white px-5 rounded-xl font-black text-xs shadow-lg active:scale-95 disabled:bg-slate-200 transition-all shrink-0 flex items-center justify-center gap-2"
              >
                {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                검색
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto no-scrollbar p-1 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[9px] font-black text-indigo-500 px-3 py-2 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100"><Sparkles size={10} /> AI 추천 종목</p>
                {searchResults.map((info, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectStock(info)}
                    className="w-full flex items-center justify-between p-4 bg-white border-b border-slate-50 last:border-0 hover:bg-indigo-50 transition-all text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-[10px]">
                        {info.type[0]}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-800">{info.name}</h4>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{info.ticker} • {info.market || 'Real-time'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-indigo-600">{info.price.toLocaleString()} {info.currency}</p>
                      <span className="text-[8px] font-black text-slate-300 italic">{info.type}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">금융기관</label>
            <div className="relative">
              <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
              <input type="text" name="institution" placeholder="증권사/은행명 직접 입력" value={formData.institution} onChange={handleChange} className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">자산 종류</label>
              <select name="type" value={formData.type} onChange={handleChange} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none cursor-pointer outline-none focus:border-indigo-500 focus:bg-white transition-all">
                {Object.values(AssetType).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">거래 통화</label>
              <select name="currency" value={formData.currency} onChange={handleChange} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold appearance-none outline-none focus:border-indigo-500 focus:bg-white transition-all"><option value="KRW">KRW</option><option value="USD">USD</option></select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">보유 수량</label>
              <input type="number" name="quantity" value={formData.quantity || ''} onChange={handleChange} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">실시간 현재가</label>
              <input type="number" name="currentPrice" value={formData.currentPrice || ''} onChange={handleChange} className="w-full px-4 py-4 bg-indigo-50/50 border border-indigo-100 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" placeholder="0" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-1">평균 매수단가</label>
            <input type="number" name="purchasePrice" value={formData.purchasePrice || ''} onChange={handleChange} className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-indigo-500 focus:bg-white transition-all" placeholder="0" />
          </div>
          
          <div className="bg-slate-900 rounded-2xl p-5 border border-slate-800 flex justify-between items-center shrink-0 shadow-lg">
            <span className="text-slate-400 font-bold text-sm">현재 환산 평가액</span>
            <span className="font-black text-emerald-400 text-lg">{totalKRW.toLocaleString()}원</span>
          </div>

          <div className="pb-10">
            <button type="submit" className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-sm active:scale-95 shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2">
              <Save size={18} /> 자산 정보 저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualAssetEntry;
