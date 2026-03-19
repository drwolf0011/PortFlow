
import React from 'react';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'info' | 'success';
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmText = '확인', 
  cancelText = '취소',
  type = 'info'
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'danger': return <AlertCircle size={40} className="text-rose-500" />;
      case 'success': return <CheckCircle2 size={40} className="text-emerald-500" />;
      default: return <AlertCircle size={40} className="text-indigo-500" />;
    }
  };

  const getButtonClass = () => {
    switch (type) {
      case 'danger': return 'bg-rose-500 hover:bg-rose-600 shadow-rose-100';
      case 'success': return 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100';
      default: return 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100';
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onCancel}></div>
      <div className="relative bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8">
          <div className="flex flex-col items-center text-center mb-8">
            <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-sm border ${type === 'danger' ? 'bg-rose-50 border-rose-100' : type === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-indigo-50 border-indigo-100'}`}>
              {getIcon()}
            </div>
            
            <h3 className="text-xl font-black text-slate-800 tracking-tight mb-2">{title}</h3>
            <p className="text-sm text-slate-400 font-bold leading-relaxed whitespace-pre-wrap">
              {message}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={onConfirm}
              className={`w-full text-white py-4 rounded-2xl font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2 active:scale-95 ${getButtonClass()}`}
            >
              {confirmText}
            </button>
            
            <button 
              onClick={onCancel}
              className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-sm hover:bg-slate-200 active:scale-95 transition-all"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
