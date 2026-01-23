
import React, { useState } from 'react';
import { Account, Asset, AccountType } from '../types';
import { 
  Plus, Trash2, ArrowLeft, CreditCard, 
  ShieldCheck, ChevronRight, Eye, EyeOff, AlertCircle, Briefcase, Landmark,
  Edit3, Save, X
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
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Account>>({
    institution: '',
    nickname: '',
    accountNumber: '',
    type: AccountType.GENERAL
  });

  const getAccountBalance = (accountId: string) => {
    return assets
      .filter(a => a.accountId === accountId)
      .reduce((acc, curr) => {
        const mult = curr.currency === 'USD' ? exchangeRate : 1;
        return acc + (curr.currentPrice * curr.quantity * mult);
      }, 0);
  };

  const handleOpenAdd = () => {
    setFormData({ institution: '', nickname: '', accountNumber: '', type: AccountType.GENERAL });
    setEditingAccountId(null);
    setIsAdding(true);
  };

  const handleOpenEdit = (account: Account) => {
    setFormData({ ...account });
    setEditingAccountId(account.id);
    setIsAdding(true);
  };

  const handleSave = () => {
    if (!formData.institution || !formData.nickname) return;

    if (editingAccountId) {
      // Update existing account
      setAccounts(prev => prev.map(a => 
        a.id === editingAccountId ? { ...a, ...formData as Account } : a
      ));
    } else {
      // Create new account
      const account: Account = {
        id: Math.random().toString(36).substr(2, 9),
        institution: formData.institution!,
        nickname: formData.nickname!,
        accountNumber: formData.accountNumber || '계좌번호 미등록',
        type: formData.type || AccountType.GENERAL,
        color: '#4F46E5',
        isHidden: false
      };
      setAccounts([...accounts, account]);
    }
    
    setIsAdding(false);
    setEditingAccountId(null);
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

  const getTypeBadgeStyle = (type: AccountType) => {
    switch (type) {
      case AccountType.IRP:
      case AccountType.DC:
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case AccountType.PENSION:
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case AccountType.ISA:
        return 'bg-blue-100 text-blue-700 border-blue-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="min-h-full bg-[#F4F7FB] pb-32">
      <div className="bg-white px-5 py-6 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link to="/assets" className="p-2 -ml-2 text-slate-400 hover:text-indigo-600 transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">계좌 관리</h2>
        </div>
        <button 
          onClick={handleOpenAdd}
          className="p-2 bg-indigo-600 text-white rounded-full shadow-lg shadow-indigo-100 active:scale-95 transition-all"
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {isAdding && (
          <div className="bg-white p-6 rounded-[2rem] shadow-xl border-2 border-indigo-500 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-800">{editingAccountId ? '계좌 정보 수정' : '새 계좌 등록'}</h3>
              <button onClick={() => setIsAdding(false)} className="text-slate-400 p-1"><X size={18}/></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">금융기관</label>
                <input 
                  type="text" 
                  placeholder="예: 삼성증권, 토스뱅크"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold mt-1 outline-none focus:border-indigo-500 transition-all"
                  value={formData.institution}
                  onChange={e => setFormData({...formData, institution: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">계좌 유형</label>
                <div className="relative">
                  <Landmark className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <select 
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold mt-1 outline-none focus:border-indigo-500 appearance-none cursor-pointer"
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value as AccountType})}
                  >
                    {Object.values(AccountType).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">계좌 별칭</label>
                <input 
                  type="text" 
                  placeholder="예: 월급통장, 노후연금"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold mt-1 outline-none focus:border-indigo-500 transition-all"
                  value={formData.nickname}
                  onChange={e => setFormData({...formData, nickname: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">계좌번호 (선택)</label>
                <input 
                  type="text" 
                  placeholder="123-456-789"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold mt-1 outline-none focus:border-indigo-500 transition-all"
                  value={formData.accountNumber}
                  onChange={e => setFormData({...formData, accountNumber: e.target.value})}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleSave} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all">
                  <Save size={16} /> 저장
                </button>
                <button onClick={() => setIsAdding(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-black text-sm active:scale-95 transition-all">취소</button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {accounts.map(account => {
            const balance = getAccountBalance(account.id);
            const canDelete = balance === 0;

            return (
              <div key={account.id} className={`bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 relative group overflow-hidden transition-all hover:shadow-md hover:border-indigo-100 ${account.isHidden ? 'opacity-60 bg-slate-50' : ''}`}>
                <div className={`absolute top-0 left-0 w-1.5 h-full ${account.isHidden ? 'bg-slate-300' : 'bg-indigo-600'}`}></div>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${account.isHidden ? 'bg-slate-200 text-slate-400' : 'bg-indigo-50 text-indigo-600'}`}>
                      <CreditCard size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${getTypeBadgeStyle(account.type)}`}>
                          {account.type}
                        </span>
                        <span className={`text-[10px] font-bold text-slate-400 truncate max-w-[100px]`}>
                          {account.institution}
                        </span>
                        {account.isHidden && <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Hidden</span>}
                      </div>
                      <h4 className={`text-base font-black mt-1 truncate ${account.isHidden ? 'text-slate-500 line-through decoration-2' : 'text-slate-800'}`}>
                        {account.nickname}
                      </h4>
                      <p className="text-xs text-slate-400 font-medium">
                        잔액: {Math.floor(balance).toLocaleString()}원
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button 
                      onClick={() => handleToggleHide(account.id)}
                      className={`p-2 rounded-xl transition-colors ${account.isHidden ? 'text-slate-400 bg-slate-100 hover:text-indigo-600' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}
                      title={account.isHidden ? "표시하기" : "숨기기"}
                    >
                      {account.isHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    <button 
                      onClick={() => handleOpenEdit(account)}
                      className="p-2 rounded-xl text-slate-400 bg-slate-50 hover:text-indigo-600 hover:bg-indigo-100 transition-colors"
                      title="수정"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button 
                      onClick={() => handleDelete(account)}
                      className={`p-2 rounded-xl transition-colors ${canDelete ? 'text-slate-300 hover:text-rose-500 hover:bg-rose-50' : 'text-slate-200 cursor-not-allowed'}`}
                      title={canDelete ? "삭제" : "잔액이 있어 삭제 불가"}
                      disabled={!canDelete}
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
            <h4 className="font-black text-indigo-900 text-sm">계좌 유형별 스마트 관리</h4>
          </div>
          <ul className="space-y-2 text-xs text-indigo-800/80 font-medium">
            <li className="flex gap-2"><span className="text-indigo-500">•</span> <strong>IRP/DC형:</strong> 위험자산(주식형) 70% 제한 규정 체크 및 안전자산 배분 제안</li>
            <li className="flex gap-2"><span className="text-indigo-500">•</span> <strong>ISA:</strong> 비과세 혜택을 극대화할 수 있는 고배당 자산 우선 추천</li>
            <li className="flex gap-2"><span className="text-indigo-500">•</span> <strong>개인연금:</strong> ETF 투자를 통한 연금 자산 증식 전략 수립</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AccountManager;
