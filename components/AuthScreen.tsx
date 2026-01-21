
import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  ChevronRight, 
  X, 
  Fingerprint, 
  AlertCircle,
  Grid3X3,
  ArrowRight,
  UserCircle,
  Edit3
} from 'lucide-react';

interface AuthScreenProps {
  onLoginSuccess: (user: { name: string; id: string }) => void;
}

type AuthStep = 'initial' | 'setup_name' | 'setup_pin' | 'login_pin';

const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [step, setStep] = useState<AuthStep>('initial');
  const [pin, setPin] = useState('');
  const [userName, setUserName] = useState('');
  const [shuffledKeys, setShuffledKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [storedPin, setStoredPin] = useState<string | null>(localStorage.getItem('portflow_pin'));
  const [storedName, setStoredName] = useState<string | null>(localStorage.getItem('portflow_user_name'));

  const shuffleKeypad = useCallback(() => {
    const nums = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'clear', 'del'];
    setShuffledKeys([...nums].sort(() => Math.random() - 0.5));
  }, []);

  useEffect(() => {
    if (step === 'setup_pin' || step === 'login_pin') {
      shuffleKeypad();
    }
  }, [step, shuffleKeypad]);

  const handleKeyClick = (key: string) => {
    setError(null);
    if (key === 'clear') {
      setPin('');
    } else if (key === 'del') {
      setPin(prev => prev.slice(0, -1));
    } else if (pin.length < 6) {
      const newPin = pin + key;
      setPin(newPin);
      
      if (newPin.length === 6) {
        if (step === 'setup_pin') {
          localStorage.setItem('portflow_pin', newPin);
          localStorage.setItem('portflow_user_name', userName || '사용자');
          setStoredPin(newPin);
          setStoredName(userName || '사용자');
          
          setTimeout(() => {
            onLoginSuccess({ name: userName || '사용자', id: 'user_me' });
          }, 500);
        } else if (step === 'login_pin') {
          if (newPin === storedPin) {
            setTimeout(() => {
              onLoginSuccess({ name: storedName || '사용자', id: 'user_me' });
            }, 500);
          } else {
            setError('간편비밀번호가 일치하지 않습니다.');
            setPin('');
            shuffleKeypad();
          }
        }
      }
    }
  };

  const handleResetAuth = () => {
    if (window.confirm('저장된 모든 자산 및 설정 정보가 초기화됩니다. 계속하시겠습니까?')) {
      try {
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace(window.location.origin + window.location.pathname);
      } catch (e) {
        localStorage.clear();
        window.location.reload();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col font-sans overflow-hidden h-[100dvh]">
      <div className="h-2 bg-indigo-600 w-full shrink-0"></div>
      
      <div className="flex-1 flex flex-col md:max-w-md md:mx-auto w-full overflow-y-auto no-scrollbar">
        {step === 'initial' && (
          <div className="flex-1 flex flex-col justify-center animate-fade-in py-10 px-8">
            <div className="mb-12">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-6 shadow-sm">
                <ShieldCheck size={36} />
              </div>
              
              {storedPin ? (
                <>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mb-4">
                    반가워요, <br />
                    <span className="text-indigo-600">{storedName}님</span>
                  </h1>
                  <p className="text-slate-400 font-bold text-sm leading-relaxed">
                    본인 전용 포트폴리오 매니저입니다.<br />안전하게 로그인을 시작하세요.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight mb-4">
                    PortFlow<br />
                    <span className="text-indigo-600">Personal Advisor</span>
                  </h1>
                  <p className="text-slate-400 font-bold text-sm leading-relaxed">
                    자산 관리의 시작, <br />나만의 포트폴리오를 구성해보세요.
                  </p>
                </>
              )}
            </div>

            <div className="space-y-4">
              {storedPin ? (
                <>
                  <button 
                    onClick={() => setStep('login_pin')}
                    className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95 transition-all"
                  >
                    <Fingerprint size={24} />
                    간편비밀번호 로그인
                  </button>
                  <button 
                    onClick={handleResetAuth}
                    className="w-full py-4 text-slate-400 font-bold text-xs flex items-center justify-center gap-2 hover:text-slate-600 transition-colors"
                  >
                    사용자 정보 초기화
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setStep('setup_name')}
                  className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95 transition-all"
                >
                  <Edit3 size={24} />
                  사용자 등록 시작하기
                </button>
              )}
            </div>
            
            <div className="mt-auto pt-8 border-t border-slate-50 flex items-center gap-3 grayscale opacity-40">
              <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-400">
                <UserCircle size={20} />
              </div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest invisible">Local-First Wealth Management</p>
            </div>
          </div>
        )}

        {step === 'setup_name' && (
          <div className="flex-1 flex flex-col animate-slide-up py-10 px-8 justify-center min-h-0">
            <h2 className="text-2xl font-black text-slate-900 mb-1 tracking-tight">사용자 이름 설정</h2>
            <p className="text-xs text-slate-400 font-bold mb-8 uppercase tracking-widest">What should we call you?</p>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">이름</label>
                <input 
                  type="text" 
                  placeholder="본인 이름 또는 별명" 
                  className="w-full px-5 py-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-indigo-600 focus:bg-white transition-all text-xl"
                  value={userName}
                  onChange={e => setUserName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="pb-20">
                <button 
                  onClick={() => setStep('setup_pin')}
                  disabled={!userName.trim()}
                  className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                >
                  비밀번호 설정하기 <ArrowRight size={20} />
                </button>
              </div>
            </div>
          </div>
        )}

        {(step === 'setup_pin' || step === 'login_pin') && (
          <div className="flex-1 flex flex-col animate-slide-up px-8">
            <div className="text-center mb-10 pt-12">
              <div className="w-16 h-16 bg-slate-900 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl relative">
                <Lock size={28} />
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">
                {step === 'setup_pin' ? '비밀번호 설정' : `${storedName}님 환영합니다`}
              </h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                Enter 6-digit PIN code
              </p>
              
              <div className="flex justify-center gap-4 mt-8">
                {[...Array(6)].map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-4 h-4 rounded-full transition-all duration-300 ${i < pin.length ? 'bg-indigo-600 scale-125 shadow-lg shadow-indigo-100' : 'bg-slate-200'}`}
                  ></div>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-rose-50 rounded-xl text-[11px] text-rose-600 font-bold mb-6 animate-shake justify-center">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="mt-auto pb-8">
              <div className="bg-slate-100 p-4 rounded-[2.5rem] border border-slate-200 grid grid-cols-3 gap-3">
                {shuffledKeys.map((key) => (
                  <button 
                    key={key} 
                    type="button"
                    onClick={() => handleKeyClick(key)}
                    className="h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center font-black text-xl text-slate-800 hover:bg-indigo-600 hover:text-white transition-all active:scale-90"
                  >
                    {key === 'clear' ? <X size={20} /> : key === 'del' ? <ChevronRight size={20} className="rotate-180" /> : key}
                  </button>
                ))}
              </div>
              
              <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-slate-400 font-bold">
                <Grid3X3 size={12} className="text-indigo-500" />
                나만 사용하는 기기에 안전하게 저장됩니다.
              </div>
            </div>
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.3s ease-in-out; }
        .animate-fade-in { animation: fadeIn 0.6s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
};

export default AuthScreen;
