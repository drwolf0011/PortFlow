
import React from 'react';
import { X, Sparkles, AlertCircle, ArrowRight, Check } from 'lucide-react';
import { Asset } from '../types';

interface EnrichmentModalProps {
  targets: Asset[];
  onClose: () => void;
  onConfirm: () => void;
}

const EnrichmentModal: React.FC<EnrichmentModalProps> = ({ targets, onClose, onConfirm }) => {
  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[85dvh]">
        
        {/* Header */}
        <div className="px-8 pt-8 pb-4 flex justify-between items-center border-b border-slate-50 shrink-0">
          <div>
            <h3 className="text-xl font-black text-slate-800">자동 보정 대상</h3>
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-0.5">
              Target Assets ({targets.length})
            </p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto no-scrollbar space-y-4">
          <div className="bg-indigo-50 p-4 rounded-2xl flex items-start gap-3">
             <Sparkles size={20} className="text-indigo-600 mt-0.5 shrink-0" />
             <div className="space-y-1">
               <p className="text-xs font-black text-indigo-800">AI 데이터 보정</p>
               <p className="text-[11px] font-medium text-indigo-700 leading-relaxed">
                 아래 자산들의 <span className="font-bold">티커(Ticker)</span> 또는 <span className="font-bold">거래소(Exchange)</span> 정보가 누락되어 있습니다. AI가 이를 분석하여 자동으로 채워넣습니다.
               </p>
             </div>
          </div>

          <div className="space-y-2">
            {targets.map(asset => {
              const missingTicker = !asset.ticker || asset.ticker.trim() === '';
              const missingExchange = asset.currency === 'USD' && (!asset.exchange || asset.exchange.trim() === '');
              
              return (
                <div key={asset.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-[10px] text-slate-500 border border-slate-200">
                      {asset.institution.substring(0,2)}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800">{asset.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400">{asset.institution}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {missingTicker && (
                      <span className="px-2 py-1 bg-rose-50 text-rose-600 text-[9px] font-black rounded-lg border border-rose-100">
                        티커 누락
                      </span>
                    )}
                    {missingExchange && (
                      <span className="px-2 py-1 bg-amber-50 text-amber-600 text-[9px] font-black rounded-lg border border-amber-100">
                        거래소 누락
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 shrink-0 flex gap-3 pb-safe">
           <button onClick={onClose} className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black text-sm active:scale-95 transition-all">
             취소
           </button>
           <button onClick={onConfirm} className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2">
             <Sparkles size={16} />
             {targets.length}건 보정 시작
           </button>
        </div>

      </div>
    </div>
  );
};

export default EnrichmentModal;
