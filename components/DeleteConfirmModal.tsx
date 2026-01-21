
import React from 'react';
import { X, AlertTriangle, Trash2 } from 'lucide-react';
import { Asset } from '../types';

interface DeleteConfirmModalProps {
  asset: Asset;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ asset, onClose, onConfirm }) => {
  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Background Overlay */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in" 
        onClick={onClose}
      ></div>
      
      {/* Modal / Bottom Sheet */}
      <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-slide-up sm:animate-fade-in">
        <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-4"></div>
        
        <div className="p-8">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center text-rose-500 mb-6 shadow-sm border border-rose-100/50">
              <AlertTriangle size={40} className="animate-pulse" />
            </div>
            
            <h3 className="text-2xl font-black text-slate-800 tracking-tight mb-2">자산을 삭제할까요?</h3>
            <p className="text-sm text-slate-400 font-bold leading-relaxed">
              <span className="text-indigo-600 font-black">[{asset.institution}] {asset.name}</span><br />
              정보와 관련된 모든 기록이 영구적으로 삭제됩니다.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={onConfirm}
              className="w-full bg-rose-500 text-white py-5 rounded-2xl font-black text-sm shadow-xl shadow-rose-100 hover:bg-rose-600 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Trash2 size={18} />
              예, 삭제하겠습니다
            </button>
            
            <button 
              onClick={onClose}
              className="w-full bg-slate-100 text-slate-600 py-5 rounded-2xl font-black text-sm hover:bg-slate-200 active:scale-95 transition-all"
            >
              취소
            </button>
          </div>
          
          <p className="mt-6 text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
            This action cannot be undone
          </p>
        </div>
      </div>

      <style>{`
        .animate-fade-in { animation: fadeIn 0.3s ease-out; }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { 
          from { transform: translateY(100%); } 
          to { transform: translateY(0); } 
        }
      `}</style>
    </div>
  );
};

export default DeleteConfirmModal;
