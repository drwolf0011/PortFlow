
import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldCheck, Lock, ChevronRight, X, Fingerprint, 
  AlertCircle, Grid3X3, ArrowRight, UserCircle, Edit3, 
  Loader2, UserPlus, LogIn, Sparkles, Database, ShieldAlert
} from 'lucide-react';
import { fetchUsersRegistry, registerUser, CloudAuthError } from '../services/storageService';
import { SUPABASE_URL, SUPABASE_KEY } from '../constants';
import { UserProfile, AppData, SyncConfig } from '../types';
import { triggerHaptic } from '../utils/mobile';

interface AuthScreenProps {
  onLoginSuccess: (user: UserProfile) => void;
}

type AuthStep = 'initial' | 'enter_name' | 'verify_pin' | 'setup_pin' | 'processing' | 'cloud_error';

const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [step, setStep] = useState<AuthStep>('initial');
  const [userName, setUserName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shuffledKeys, setShuffledKeys] = useState<string[]>([]);
  const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  
  // Local Config for Supabase
  const [localConfig, setLocalConfig] = useState<{url: string, key: string} | null>(null);

  useEffect(() => {
      // Check for locally stored config
      try {
          const stored = localStorage.getItem('portflow_sync_config');
          if (stored) {
              const parsed: SyncConfig = JSON.parse(stored);
              if (parsed.supabaseUrl && parsed.supabaseKey) {
                  setLocalConfig({ url: parsed.supabaseUrl, key: parsed.supabaseKey });
              }
          }
      } catch (e) {
          console.error(e);
      }
  }, []);

  const getEffectiveCredentials = () => {
      const url = SUPABASE_URL || localConfig?.url;
      const key = SUPABASE_KEY || localConfig?.key;
      return { url, key };
  };

  const shuffleKeypad = useCallback(() => {
    const nums = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'clear', 'del'];
    setShuffledKeys([...nums].sort(() => Math.random() - 0.5));
  }, []);

  const handleNameSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userName.trim()) return;

    const { url, key } = getEffectiveCredentials();

    // 연결 정보가 없으면 로컬 모드로 진행
    if (!url || !key) {
      setStep('setup_pin');
      shuffleKeypad();
      return;
    }

    setStep('processing');
    setLoadingMessage('사용자 정보를 확인하고 있습니다...');
    setError(null);

    try {
      const registry = await fetchUsersRegistry(url, key);
      const user = registry.users.find(u => u.name === userName.trim());

      if (user) {
        setTargetUser(user);
        setStep('verify_pin');
      } else {
        setStep('setup_pin');
      }
      shuffleKeypad();
    } catch (err: any) {
      if (err instanceof CloudAuthError) {
        setStep('cloud_error');
      } else {
        // Fallback to local setup if connection fails but show toast/alert in real app? 
        // For now, allow local setup or retry
        setError(err.message || '로그인 중 오류가 발생했습니다.');
        setStep('enter_name');
      }
    }
  };

  const handleLocalModeStart = () => {
    triggerHaptic('medium');
    const localUser: UserProfile = {
      id: `local_${Date.now()}`,
      name: userName.trim() || '로컬 사용자',
      pin: '000000', 
      dataBinId: '' 
    };
    onLoginSuccess(localUser);
  };

  const handlePinComplete = async (finalPin: string) => {
    setStep('processing');
    const { url, key } = getEffectiveCredentials();
    
    // 로컬 모드 처리
    if ((!url || !key) && !targetUser) {
      setLoadingMessage('로컬 프로필을 생성합니다...');
      setTimeout(() => {
        const localUser: UserProfile = {
          id: `local_${Date.now()}`,
          name: userName.trim(),
          pin: finalPin,
          dataBinId: ''
        };
        onLoginSuccess(localUser);
      }, 500);
      return;
    }
    
    if (targetUser) {
      // 로그인 시도
      setLoadingMessage('비밀번호를 확인하고 있습니다...');
      if (targetUser.pin === finalPin) {
        setLoadingMessage('클라우드 데이터를 동기화합니다...');
        // Ensure credentials are passed to App
        targetUser.cloudSync = { supabaseUrl: url, supabaseKey: key };
        setTimeout(() => onLoginSuccess(targetUser), 800);
      } else {
        setError('비밀번호가 일치하지 않습니다.');
        setPin('');
        setStep('verify_pin');
        shuffleKeypad();
        triggerHaptic('error');
      }
    } else {
      // 회원가입 시도
      setLoadingMessage('새로운 클라우드 계정을 생성하고 있습니다...');
      try {
        if (!url || !key) throw new Error("Cloud config missing");

        const newUser: UserProfile = {
          id: `user_${Date.now()}`,
          name: userName.trim(),
          pin: finalPin,
          dataBinId: '', // Legacy placeholder
          cloudSync: { supabaseUrl: url, supabaseKey: key }
        };

        await registerUser(url, key, newUser);

        setLoadingMessage('가입이 완료되었습니다! 로그인합니다...');
        triggerHaptic('success');
        setTimeout(() => onLoginSuccess(newUser), 1000);
      } catch (err: any) {
        setError(err.message || '가입 처리 중 오류가 발생했습니다.');
        setPin('');
        setStep('setup_pin');
        triggerHaptic('error');
      }
    }
  };

  const handleKeyClick = (key: string) => {
    setError(null);
    triggerHaptic('light');
    if (key === 'clear') setPin('');
    else if (key === 'del') setPin(prev => prev.slice(0, -1));
    else if (pin.length < 6) {
      const newPin = pin + key;
      setPin(newPin);
      if (newPin.length === 6) handlePinComplete(newPin);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col font-sans h-[100dvh]">
      <div className="h-2 bg-indigo-600 w-full shrink-0"></div>
      
      <div className="flex-1 flex flex-col md:max-w-md md:mx-auto w-full relative">
        {step === 'initial' && (
          <div className="flex-1 flex flex-col justify-center px-10 animate-in fade-in duration-500">
            <div className="w-20 h-20 bg-indigo-50 rounded-[2.5rem] flex items-center justify-center text-indigo-600 mb-8 shadow-sm">
              <ShieldCheck size={40} />
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter leading-tight mb-4">
              모든 자산을<br />
              <span className="text-indigo-600">하나의 흐름으로</span>
            </h1>
            <p className="text-slate-400 font-bold text-sm leading-relaxed mb-12">
              Supabase 기반 AI 자산관리 포트폴리오.<br />안전하고 확장 가능한 데이터베이스.
            </p>
            <button 
              onClick={() => { setStep('enter_name'); triggerHaptic('medium'); }}
              className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg shadow-2xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95 transition-all"
            >
              로그인 / 시작하기
              <ArrowRight size={20} />
            </button>
            {!getEffectiveCredentials().url && (
               <p className="text-center text-[10px] text-slate-300 font-bold mt-4 uppercase tracking-widest">
                 현재 로컬 모드로 시작됩니다 (DB 미설정)
               </p>
            )}
          </div>
        )}

        {step === 'enter_name' && (
          <div className="flex-1 flex flex-col justify-center px-10 animate-in slide-in-from-bottom-4">
            <button onClick={() => setStep('initial')} className="absolute top-8 left-6 p-2 text-slate-300"><X size={24}/></button>
            <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">이름을 입력하세요</h2>
            <p className="text-xs text-slate-400 font-bold mb-8 uppercase tracking-widest">Identify Yourself</p>
            <form onSubmit={handleNameSubmit} className="space-y-6">
              <input 
                type="text" 
                placeholder="성함 또는 닉네임" 
                className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] font-black outline-none focus:border-indigo-600 focus:bg-white transition-all text-xl"
                value={userName}
                onChange={e => setUserName(e.target.value)}
                autoFocus
              />
              {error && <p className="text-xs font-bold text-rose-500 flex items-center gap-1.5"><AlertCircle size={14}/> {error}</p>}
              <button 
                type="submit"
                className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                다음 단계로 <ChevronRight size={20} />
              </button>
            </form>
          </div>
        )}

        {(step === 'verify_pin' || step === 'setup_pin') && (
          <div className="flex-1 flex flex-col px-8 pt-16 animate-in slide-in-from-bottom-4">
            <div className="text-center mb-10">
              <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
                {step === 'verify_pin' ? <LogIn size={28}/> : <UserPlus size={28}/>}
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">
                {step === 'verify_pin' ? '비밀번호 입력' : '비밀번호 설정'}
              </h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                {step === 'verify_pin' ? `${userName}님, 돌아오신 것을 환영합니다` : '나만의 6자리 PIN을 만드세요'}
              </p>
              <div className="flex justify-center gap-4 mt-8">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className={`w-4 h-4 rounded-full transition-all duration-300 ${i < pin.length ? 'bg-indigo-600 scale-125 shadow-lg' : 'bg-slate-200'}`}></div>
                ))}
              </div>
            </div>
            {error && <p className="text-xs font-bold text-rose-500 text-center mb-6">{error}</p>}
            <div className="mt-auto pb-10">
              <div className="bg-slate-50 p-4 rounded-[2.5rem] grid grid-cols-3 gap-3 border border-slate-100">
                {shuffledKeys.map((key) => (
                  <button 
                    key={key} 
                    onClick={() => handleKeyClick(key)}
                    className="h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center font-black text-xl text-slate-800 hover:bg-indigo-600 hover:text-white transition-all active:scale-90"
                  >
                    {key === 'clear' ? <X size={20}/> : key === 'del' ? <ChevronRight size={20} className="rotate-180"/> : key}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'cloud_error' && (
          <div className="flex-1 flex flex-col items-center justify-center px-10 text-center animate-in fade-in">
            <div className="w-24 h-24 bg-rose-50 text-rose-500 rounded-[3rem] flex items-center justify-center mb-8 shadow-xl border border-rose-100">
              <ShieldAlert size={48} className="animate-bounce" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">클라우드 연결 불가</h3>
            <p className="text-sm font-bold text-slate-400 leading-relaxed mb-10">
              Supabase 연결에 실패했습니다.<br />권한이 없거나 네트워크 문제입니다.<br />로컬 모드로 진행하시겠습니까?
            </p>
            
            <div className="w-full space-y-3">
              <button 
                onClick={handleLocalModeStart}
                className="w-full py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Database size={20} /> 로컬 모드로 시작하기
              </button>
              <button 
                onClick={() => setStep('enter_name')}
                className="w-full py-4 bg-slate-100 text-slate-500 rounded-[1.5rem] font-black text-sm active:scale-95 transition-all"
              >
                다시 시도하기
              </button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="flex-1 flex flex-col items-center justify-center px-10 text-center animate-in fade-in">
            <div className="w-24 h-24 bg-indigo-600 rounded-[3rem] flex items-center justify-center text-white mb-8 shadow-2xl shadow-indigo-200">
              <Sparkles size={48} className="animate-pulse" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">잠시만 기다려주세요</h3>
            <p className="text-sm font-bold text-slate-400 leading-relaxed">{loadingMessage}</p>
            <Loader2 className="animate-spin text-indigo-600 mt-8" size={32} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthScreen;
