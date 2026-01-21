
import React, { useState, useMemo } from 'react';
import { Asset, AssetType } from '../types';
import { Filter, Trash2, Edit3, Plus, PiggyBank, CreditCard, RefreshCw, History, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AssetSparkline } from './AssetSparkline';

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
}

const AssetList: React.FC<AssetListProps> = ({ assets, onAddAsset, onDeleteAsset, onEditAsset, onSync, onRefreshPrices, isRefreshing, exchangeRate }) => {
  const [filter, setFilter] = useState<string>('ALL');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const filtered = useMemo(() => {
    if (filter === 'ALL') return assets;
    return assets.filter(a => a.type === filter);
  }, [assets, filter]);

  const handleSyncClick = () => {
    setIsSyncing(true);
    onSync();
    setTimeout(() => setIsSyncing(false), 1500);
  };

  return (
    <div className="p-5 space-y-6 pb-32">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">내 자산 현황</h2>
          <div className="flex gap-2">
            <button 
              onClick={onRefreshPrices}
              disabled={isRefreshing}
              className={`flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-xs font-black border border-indigo-100 active:scale-95 transition-all ${isRefreshing ? 'opacity-50' : ''}`}
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} /> 시세 갱신
            </button>
            <button 
              onClick={handleSyncClick}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-xs font-black border border-indigo-100 active:scale-95 transition-all ${isSyncing ? 'opacity-50' : ''}`}
            >
              <History size={14} className={isSyncing ? 'animate-spin' : ''} /> 동기화
            </button>
            <button 
              onClick={onAddAsset}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-full text-xs font-black shadow-lg shadow-indigo-100 active:scale-95 transition-all"
            >
              <Plus size={16} /> 추가
            </button>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Link 
            to="/accounts"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white text-slate-600 rounded-2xl text-[11px] font-black border border-slate-100 shadow-sm active:scale-95 transition-all"
          >
            <CreditCard size={14} className="text-indigo-500" /> 계좌 관리
          </Link>
          <button 
            onClick={() => setFilter('ALL')}
            className={`flex-1 py-3 rounded-2xl text-[11px] font-black transition-all border ${filter === 'ALL' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-slate-400 border-slate-100 shadow-sm'}`}
          >
            전체 보기
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
        {Object.values(AssetType).map(t => (
          <FilterChip key={t} active={filter === t} label={t} onClick={() => setFilter(t)} />
        ))}
      </div>

      <div className="space-y-4">
        {filtered.map(asset => {
          const mult = asset.currency === 'USD' ? exchangeRate : 1;
          const total = asset.currentPrice * asset.quantity * mult;
          const profit = (asset.currentPrice - asset.purchasePrice) * asset.quantity * mult;
          
          const rate = asset.purchasePrice > 0 
            ? ((asset.currentPrice - asset.purchasePrice) / asset.purchasePrice) * 100 
            : 0;
          
          const isPlus = profit > 0;
          const isZero = profit === 0;
          const isStale = isZero && asset.type !== '현금';

          return (
            <div key={asset.id} className="bg-white rounded-[1.5rem] p-5 shadow-sm border border-slate-50 relative group transition-all hover:shadow-md">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center font-black text-[10px] text-indigo-400 border border-indigo-100">
                    {asset.institution.substring(0,2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">{asset.institution}</p>
                      <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                      <p className="text-[10px] font-black text-indigo-400/60 uppercase">{asset.currency}</p>
                    </div>
                    <h4 className="text-sm font-black text-slate-800">{asset.name}</h4>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onEditAsset(asset)} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><Edit3 size={16} /></button>
                  <button onClick={() => onDeleteAsset(asset.id)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors"><Trash2 size={16} /></button>
                </div>
              </div>
              
              <div className="h-12 w-full mb-4">
                 <AssetSparkline ticker={asset.ticker} name={asset.name} isPlus={isPlus} />
              </div>
              
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 mb-0.5">평가금액 ({asset.quantity.toLocaleString()}주)</p>
                  <p className="text-lg font-black text-slate-900">{Math.floor(total).toLocaleString()}원</p>
                </div>
                <div className="text-right">
                  {isStale ? (
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] font-black text-amber-500 bg-amber-50 px-2 py-0.5 rounded flex items-center gap-1">
                        <AlertCircle size={10} /> 시세 업데이트 필요
                      </span>
                      <p className="text-[10px] font-bold text-slate-300">0%</p>
                    </div>
                  ) : (
                    <>
                      <p className={`text-sm font-black ${isZero ? 'text-slate-400' : isPlus ? 'text-rose-500' : 'text-blue-500'}`}>
                        {isPlus ? '+' : ''}{rate.toFixed(2)}%
                      </p>
                      <p className={`text-[10px] font-bold ${isZero ? 'text-slate-300' : isPlus ? 'text-rose-500/60' : 'text-blue-500/60'}`}>
                        {Math.floor(profit).toLocaleString()}원
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        
        {filtered.length === 0 && (
          <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-300">
            <PiggyBank size={48} className="opacity-20" />
            <p className="font-bold italic">표시할 자산이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const FilterChip: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex-shrink-0 px-5 py-2.5 rounded-full text-xs font-black transition-all ${
      active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white text-slate-400 border border-slate-100 hover:border-slate-300'
    }`}
  >
    {label}
  </button>
);

export default AssetList;
