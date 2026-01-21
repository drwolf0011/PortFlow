
import React, { useState } from 'react';
import { Account, Asset } from '../types';
import { 
  Plus, Trash2, ArrowLeft, CreditCard, 
  ShieldCheck, ChevronRight, Eye, EyeOff, AlertCircle 
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface AccountManagerProps {
  accounts: Account[];
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
  assets: Asset[]; 
  exchangeRate: number;
}

const AccountManager: React.FC<AccountManagerProps> = ({ accounts, setAccounts, assets, exchangeRate }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newAccount, setNewAccount] = useState<Partial<Account>>({
    institution: '',
    nickname: '',
    accountNumber: ''
  });

  const getAccountBalance = (accountId: string) => {
    return assets
      .filter(a => a.accountId === accountId)
      .reduce((acc, curr) => {
        const mult = curr.currency === 'USD' ? exchangeRate : 1;
        return acc + (curr.currentPrice * curr.quantity * mult);
      }, 0);
  };

  const handleAdd = () => {
    if (!newAccount.institution || !newAccount.nickname) return;
    const account: Account = {
      id: Math.random().toString(36).substr(2, 9),
      institution: newAccount.institution!,
      nickname: newAccount.nickname!,
      accountNumber: newAccount.accountNumber || '계좌번호 미등록',
      color: '#4F46E5',
      isHidden: false
    };
    setAccounts([...accounts, account]);
    setIsAdding(false);
    setNewAccount({ institution: '', nickname: '', accountNumber: '' });
  };

  const handleDelete = (account: Account) => {
    const balance = getAccountBalance(account.id);
    
    if (balance > 0) {
      alert(`해당 계좌에 아직 ${Math.floor(balance).toLocaleString()}원의 자산이 남아있어 삭제할 수 없습니다. 자산을 먼저 이동시키거나 삭제해주세요.`);
      return;
    }

    if (window.confirm(`'${account.nickname}' 계좌를 삭제하시겠습니까?`)) {
      setAccounts(accounts.filter(a => a.id !== account.id));
    }
  };

  const handleToggleHide = (id: string) => {
    setAccounts(prev => prev.map(a => 
      a.id === id ? { ...a, isHidden: !a.isHidden } : a
    ));
  };

  return (
    <div className="min-h-full bg-[#F4F7FB] pb-32">
      <div className="bg-white px-5 py-6 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/assets" className="p-2 -ml-2 text-slate-400">
            <ArrowLeft size={24} />
          </Link>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">계좌 관리</h2>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="p-2 bg-indigo-600 text-white rounded-full shadow-lg shadow-indigo-100"
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {isAdding && (
          <div className="bg-white p-6 rounded-[2rem] shadow-xl border-2 border-indigo-500 animate-in zoom-in-95 duration-200">
            <h3 className="font-black text-slate-800 mb-4">새 계좌 등록</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">금융기관</label>
                <input 
                  type="text" 
                  placeholder="예: 삼성증권"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold mt-1 outline-none focus:border-indigo-500"
                  value={newAccount.institution}
                  onChange={e => setNewAccount({...newAccount, institution: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">계좌 별칭</label>
                <input 
                  type="text" 
                  placeholder="예: 주거래 주식계좌"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold mt-1 outline-none focus:border-indigo-500"
                  value={newAccount.nickname}
                  onChange={e => setNewAccount({...newAccount, nickname: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">계좌번호 (선택)</label>
                <input 
                  type="text" 
                  placeholder="123-456-789"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold mt-1 outline-none focus:border-indigo-500"
                  value={newAccount.accountNumber}
                  onChange={e => setNewAccount({...newAccount, accountNumber: e.target.value})}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleAdd} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black text-sm">저장</button>
                <button onClick={() => setIsAdding(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-black text-sm">취소</button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {accounts.map(account => {
            const balance = getAccountBalance(account.id);
            const canDelete = balance === 0;

            return (
              <div key={account.id} className={`bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 relative group overflow-hidden transition-all ${account.isHidden ? 'opacity-60 bg-slate-50' : ''}`}>
                <div className={`absolute top-0 left-0 w-1.5 h-full ${account.isHidden ? 'bg-slate-300' : 'bg-indigo-600'}`}></div>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${account.isHidden ? 'bg-slate-200 text-slate-400' : 'bg-indigo-50 text-indigo-600'}`}>
                      <CreditCard size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${account.isHidden ? 'bg-slate-200 text-slate-500' : 'bg-indigo-50 text-indigo-600'}`}>
                          {account.institution}
                        </span>
                        {account.isHidden && <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Hidden</span>}
                        {!account.isHidden && <ShieldCheck size={12} className="text-emerald-500" />}
                      </div>
                      <h4 className={`text-base font-black mt-1 ${account.isHidden ? 'text-slate-500 line-through decoration-2' : 'text-slate-800'}`}>
                        {account.nickname}
                      </h4>
                      <p className="text-xs text-slate-400 font-medium">
                        잔액: {Math.floor(balance).toLocaleString()}원
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleToggleHide(account.id)}
                      className={`p-2 rounded-xl transition-colors ${account.isHidden ? 'text-slate-400 bg-slate-100' : 'text-indigo-600 bg-indigo-50'}`}
                      title={account.isHidden ? "표시하기" : "숨기기"}
                    >
                      {account.isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    <button 
                      onClick={() => handleDelete(account)}
                      className={`p-2 rounded-xl transition-colors ${canDelete ? 'text-slate-300 hover:text-rose-500 hover:bg-rose-50' : 'text-slate-200 cursor-not-allowed'}`}
                      title={canDelete ? "삭제" : "잔액이 있어 삭제 불가"}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                {account.isHidden && (
                  <div className="mt-3 flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-tight">
                    <AlertCircle size={10} /> 숨김 처리된 계좌는 전체 자산 통계에서 제외됩니다.
                  </div>
                )}
              </div>
            );
          })}

          {accounts.length === 0 && !isAdding && (
            <div className="py-20 text-center space-y-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
                <CreditCard size={32} />
              </div>
              <p className="text-slate-400 font-bold italic">등록된 계좌가 없습니다.<br />우측 상단 + 버튼을 눌러 계좌를 등록하세요.</p>
            </div>
          )}
        </div>

        <div className="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100 mt-8">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck size={20} className="text-indigo-600" />
            <h4 className="font-black text-indigo-900 text-sm">안전한 데이터 관리</h4>
          </div>
          <p className="text-xs text-indigo-700/70 leading-relaxed font-medium">
            잔액이 남아있는 계좌는 실수를 방지하기 위해 삭제가 불가능합니다. 또한 '숨기기' 기능을 통해 특정 계좌를 일시적으로 대시보드 합계에서 제외할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AccountManager;
