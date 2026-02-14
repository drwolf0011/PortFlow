
import React, { useState } from 'react';
import { Account, Asset, AccountType } from '../types';
import { 
  Plus, Trash2, ArrowLeft, CreditCard, 
  ShieldCheck, ChevronRight, Eye, EyeOff, AlertCircle, Briefcase, Landmark,
  Edit3, Save, X, Archive, ChevronDown, ChevronUp
} from 'lucide-react';
import * as ReactRouterDOM from 'react-router-dom';
const { Link } = ReactRouterDOM;

interface AccountManagerProps {
  accounts: Account[];
  setAccounts: React.Dispatch<React.SetStateAction<Account[]>>;
  assets: Asset[]; 
  exchangeRate: number;
}

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

interface AccountCardProps {
  account: Account;
  balance: number;
  onEdit: (account: Account) => void;
  onToggleHide: (id: string) => void;
  onDelete: (account: Account) => void;
}

const AccountCard: React.FC<AccountCardProps> = ({ account, balance, onEdit, onToggleHide, onDelete }) => {
  const canDelete = balance === 0;

  return (
    <div className={`bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-100 relative group overflow-hidden transition-all hover:shadow-md hover:border-indigo-100 ${account.isHidden ? 'opacity-75 bg-slate-50' : ''}`}>
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
              {account.isHidden && <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-200 px-1.5 rounded">Hidden</span>}
            </div>
            <h4 className={`text-base font-black mt-1 truncate ${account.isHidden ? 'text-slate-500' : 'text-slate-800'}`}>{account.nickname}</h4>
            <p className="text-[10px] font-bold text-slate-400 font-mono tracking-tight mt-0.5">{account.accountNumber}</p>
          </div>
        </div>
        <div className="flex gap-2">
           <button onClick={() => onEdit(account)} className="p-2 text-slate-300 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors">
             <Edit3 size={18} />
           </button>
           <button onClick={() => onToggleHide(account.id)} className="p-2 text-slate-300 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors" title={account.isHidden ? "보이기" : "숨기기"}>
             {account.isHidden ? <Eye size={18} /> : <EyeOff size={18} />}
           </button>
           {canDelete && (
             <button onClick={() => onDelete(account)} className="p-2 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors">
               <Trash2 size={18} />
             </button>
           )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Balance</span>
         <span className="text-sm font-black text-slate-800">{Math.floor(balance).toLocaleString()}원</span>
      </div>
    </div>
  );
};

const AccountManager: React.FC<AccountManagerProps> = ({ accounts, setAccounts, assets, exchangeRate }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [isHiddenSectionOpen, setIsHiddenSectionOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Account>>({
    institution: '',
    nickname: '',
    accountNumber: '',
    type: AccountType.GENERAL
  });

  // Separate accounts
  const visibleAccounts = accounts.filter(a => !a.isHidden);
  const hiddenAccounts = accounts.filter(a => a.isHidden);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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

  return (
    <div className="p-5 space-y-6 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 -ml-2 text-slate-400 hover:text-indigo-600 transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">계좌 관리</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Accounts & Portfolios</p>
          </div>
        </div>
        <button 
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-2xl text-[11px] font-black shadow-lg shadow-indigo-200 active:scale-95 transition-all"
        >
          <Plus size={16} /> 계좌 추가
        </button>
      </div>

      {/* Account Stats */}
      <div className="bg-slate-900 rounded-[2rem] p-6 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex items-center justify-between">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg">
               <Briefcase size={24} className="text-white" />
             </div>
             <div>
               <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Active Accounts</p>
               <h3 className="text-2xl font-black">{visibleAccounts.length}개 <span className="text-sm font-medium opacity-50">/ {accounts.length}</span></h3>
             </div>
           </div>
        </div>
      </div>

      {/* Active Accounts List */}
      <div className="space-y-4">
        {visibleAccounts.length > 0 ? (
          visibleAccounts.map(account => (
            <AccountCard 
              key={account.id} 
              account={account} 
              balance={getAccountBalance(account.id)}
              onEdit={handleOpenEdit}
              onToggleHide={handleToggleHide}
              onDelete={handleDelete}
            />
          ))
        ) : (
          <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-[2rem]">
            <p className="text-sm font-bold text-slate-400 mb-1">등록된 계좌가 없습니다</p>
            <p className="text-[10px] text-slate-300">새 계좌를 추가하여 자산을 관리해보세요.</p>
          </div>
        )}
      </div>

      {/* Hidden Accounts Section */}
      {hiddenAccounts.length > 0 && (
        <div className="pt-4 border-t border-slate-100">
          <button 
            onClick={() => setIsHiddenSectionOpen(!isHiddenSectionOpen)}
            className="w-full flex items-center justify-between p-4 bg-slate-100 rounded-2xl text-slate-500 hover:bg-slate-200 transition-colors mb-4"
          >
            <div className="flex items-center gap-2">
              <Archive size={16} />
              <span className="text-xs font-black">숨긴 계좌 ({hiddenAccounts.length})</span>
            </div>
            {isHiddenSectionOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          
          {isHiddenSectionOpen && (
            <div className="space-y-4 animate-in slide-in-from-top-2">
              {hiddenAccounts.map(account => (
                <AccountCard 
                  key={account.id} 
                  account={account} 
                  balance={getAccountBalance(account.id)}
                  onEdit={handleOpenEdit}
                  onToggleHide={handleToggleHide}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsAdding(false)}></div>
          <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 overflow-hidden">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center bg-white border-b border-slate-50">
              <div>
                <h3 className="text-xl font-black text-slate-800">{editingAccountId ? '계좌 수정' : '새 계좌 추가'}</h3>
                <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">Account Details</p>
              </div>
              <button onClick={() => setIsAdding(false)} className="p-2 text-slate-300 hover:bg-slate-50 rounded-full transition-colors"><X size={20}/></button>
            </div>
            
            <div className="p-8 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">금융기관</label>
                <div className="relative">
                  <Landmark className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input 
                    type="text" 
                    name="institution"
                    placeholder="예: 토스증권, 삼성증권" 
                    value={formData.institution} 
                    onChange={handleChange} 
                    className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 transition-all" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">계좌 별칭</label>
                <div className="relative">
                  <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input 
                    type="text" 
                    name="nickname"
                    placeholder="예: 월급통장, 공모주용" 
                    value={formData.nickname} 
                    onChange={handleChange} 
                    className="w-full pl-11 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 transition-all" 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">계좌 번호 (선택)</label>
                <input 
                  type="text" 
                  name="accountNumber"
                  placeholder="123-45-67890" 
                  value={formData.accountNumber} 
                  onChange={handleChange} 
                  className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 transition-all" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">계좌 유형 (세제혜택)</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300" size={16} />
                  <select 
                    name="type" 
                    value={formData.type} 
                    onChange={handleChange} 
                    className="w-full pl-11 pr-4 py-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-sm font-bold outline-none appearance-none text-indigo-700 focus:border-indigo-500 transition-all"
                  >
                    {Object.values(AccountType).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="pt-4">
                <button 
                  onClick={handleSave}
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Save size={18} /> 계좌 정보 저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountManager;
