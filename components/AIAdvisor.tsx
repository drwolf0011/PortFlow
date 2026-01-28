
import React, { useState, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { getAIDiagnosis, getAIStrategy, generateGoalPrompt } from '../services/geminiService';
import { Asset, RebalancingStrategy, Account, UserProfile, DiagnosisResponse, SavedStrategy } from '../types';
import { 
  Sparkles, Loader2, Target, Activity, Zap, Briefcase, 
  ArrowRight, Lightbulb, ShieldCheck, Wallet,
  Settings2, X, PlayCircle, Save,
  CheckCircle2, ChevronRight, ChevronLeft,
  RefreshCw, Layers, Archive, Trash2, Calendar, User, Compass, TrendingUp, Heart
} from 'lucide-react';

interface AIAdvisorProps {
  assets: Asset[];
  accounts: Account[];
  onApplyRebalancing: (institution: string) => void;
  exchangeRate: number;
  user: UserProfile | null;
  onUpdateUser: (updatedUser: UserProfile) => void;
  savedStrategies: SavedStrategy[];
  onSaveStrategy: (data: { type: 'DIAGNOSIS' | 'STRATEGY', name: string, diagnosis?: DiagnosisResponse, strategy?: RebalancingStrategy }) => void;
  onDeleteStrategy: (id: string) => void;
  showToast: (msg: string) => void;
}

const AIAdvisor: React.FC<AIAdvisorProps> = ({ 
  assets, accounts, onApplyRebalancing, exchangeRate, 
  user, onUpdateUser, savedStrategies, onSaveStrategy, onDeleteStrategy, showToast
}) => {
  const [diagnosis, setDiagnosis] = useState<DiagnosisResponse | null>(null);
  const [strategy, setStrategy] = useState<RebalancingStrategy | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [strategyLoading, setStrategyLoading] = useState<boolean>(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isSavedThisSession, setIsSavedThisSession] = useState(false);
  
  const [isGoalWizardOpen, setIsGoalWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardAnswers, setWizardAnswers] = useState({ age: '', risk: '', purpose: '', horizon: '', preference: '', customRequest: '' });
  const [isWizardProcessing, setIsWizardProcessing] = useState(false);

  const contextHash = useMemo(() => {
    const assetsKey = assets.map(a => `${a.id}-${a.quantity}-${a.currentPrice}`).join('|');
    return `${assetsKey}#${user?.investmentGoal || ''}`;
  }, [assets, user]);

  const lastAnalyzedHash = useRef<string | null>(null);
  const lastStrategyHash = useRef<string | null>(null);

  const fetchDiagnosis = async () => {
    if (assets.length === 0) { alert("자산을 먼저 등록해주세요."); return; }
    setLoading(true);
    try {
      const result = await getAIDiagnosis(assets, accounts, exchangeRate, user);
      setDiagnosis(result);
      lastAnalyzedHash.current = contextHash;
    } catch (err: any) {
      alert(err.message || "진단 중 오류 발생");
    } finally {
      setLoading(false);
    }
  };

  const fetchStrategy = async () => {
    if (!diagnosis) return;
    setStrategyLoading(true);
    try {
      const result = await getAIStrategy(assets, accounts, exchangeRate, diagnosis.currentDiagnosis, user);
      setStrategy(result);
      lastStrategyHash.current = contextHash;
    } catch (err: any) {
      alert(err.message || "전략 생성 중 오류 발생");
    } finally {
      setStrategyLoading(false);
    }
  };

  const handleSave = () => {
    if (!diagnosis) return;
    const name = window.prompt("저장할 기록의 이름을 입력하세요:", `${strategy ? '전략' : '진단'}_${new Date().toLocaleDateString()}`);
    if (!name) return;
    onSaveStrategy({ type: strategy ? 'STRATEGY' : 'DIAGNOSIS', name, diagnosis, strategy: strategy || undefined });
    setIsSavedThisSession(true);
  };

  const handleLoadSaved = (item: SavedStrategy) => {
    if (item.diagnosis) setDiagnosis(item.diagnosis);
    if (item.strategy) setStrategy(item.strategy);
    setIsArchiveOpen(false);
    showToast("기록을 불러왔습니다.");
  };

  const handleCompleteGoalWizard = async () => {
    if (!user) return;
    setIsWizardProcessing(true);
    try {
      const { goal, prompt } = await generateGoalPrompt(wizardAnswers);
      onUpdateUser({ ...user, investmentGoal: goal, goalPrompt: prompt });
      setIsGoalWizardOpen(false);
      setWizardStep(0);
    } catch (error) { 
      alert("목표 설정 중 오류가 발생했습니다."); 
    } finally { 
      setIsWizardProcessing(false); 
    }
  };

  const planSummary = useMemo(() => {
    if (!strategy || !strategy.executionGroups) return { buy: 0, sell: 0 };
    let buy = 0, sell = 0;
    strategy.executionGroups.forEach(g => g.items?.forEach(i => {
      if (i.action === 'BUY') buy += i.totalAmount || 0;
      else if (i.action === 'SELL') sell += i.totalAmount || 0;
    }));
    return { buy, sell };
  }, [strategy]);

  const WIZARD_STEPS = [
    { title: '연령대 선택', field: 'age', options: ['20대 이하', '30대', '40대', '50대', '60대 이상'], icon: <User size={24} /> },
    { title: '투자 성향', field: 'risk', options: ['안정형', '안정추구형', '위험중립형', '적극투자형', '공격투자형'], icon: <TrendingUp size={24} /> },
    { title: '투자 목적', field: 'purpose', options: ['노후 자금', '주택 마련', '자녀 교육', '목돈 마련', '파이어족'], icon: <Target size={24} /> },
    { title: '투자 기간', field: 'horizon', options: ['1년 미만', '1-3년', '3-5년', '5-10년', '10년 이상'], icon: <Calendar size={24} /> },
    { title: '선호 자산', field: 'preference', options: ['국내 주식', '해외 주식', '채권', '배당주', 'ETF', '가상자산'], icon: <Compass size={24} /> },
    { title: '나만의 목표 (선택)', field: 'customRequest', type: 'textarea', icon: <Heart size={24} /> }
  ];

  return (
    <div className="p-5 space-y-8 pb-40 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 px-1">
         <div className="flex items-center justify-between">
           <h2 className="text-xl font-black text-slate-800 tracking-tight">AI 자산관리자</h2>
           <button onClick={() => setIsArchiveOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-white text-indigo-600 border border-indigo-100 rounded-2xl text-[11px] font-black shadow-sm active:scale-95 transition-all">
             <Archive size={14} /> 보관함
           </button>
         </div>

         <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Target size={18} /></div>
             <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Investment Goal</p>
               <h3 className="text-sm font-black text-slate-800">{user?.investmentGoal || '목표 미설정'}</h3>
             </div>
           </div>
           <button onClick={() => { setWizardStep(0); setIsGoalWizardOpen(true); }} className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:text-indigo-600 transition-all">
             <Settings2 size={18} />
           </button>
         </div>
      </div>

      <section className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg"><Briefcase className="text-white" size={28} /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-1">Elite Portfolio Analysis</p>
              <h2 className="text-2xl font-black tracking-tight leading-tight">PortFlow AI Expert</h2>
            </div>
          </div>
          <button onClick={fetchDiagnosis} disabled={loading} className="w-full py-4.5 bg-white text-slate-900 rounded-[1.5rem] font-black text-sm flex items-center justify-center gap-2.5 shadow-xl active:scale-95 transition-all">
            {loading ? <Loader2 size={18} className="animate-spin text-indigo-600" /> : <Sparkles size={18} className="text-indigo-600" />}
            {loading ? '자산 정밀 분석 중...' : '신규 자산 분석 시작'}
          </button>
        </div>
      </section>

      {diagnosis && !loading && (
        <div className="space-y-10 animate-in slide-in-from-bottom-4">
          <section className="bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5"><div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Activity size={20} /></div><h4 className="text-sm font-black text-slate-800">정밀 진단 리포트</h4></div>
              <button onClick={handleSave} className="p-2.5 text-slate-400 hover:text-indigo-600 transition-all"><Save size={20} /></button>
            </div>
            <div className="prose prose-slate prose-sm max-w-none text-slate-600 leading-relaxed pt-2">
              <ReactMarkdown>{diagnosis.currentDiagnosis}</ReactMarkdown>
            </div>
          </section>

          {!strategy ? (
            <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-center space-y-5 shadow-xl">
              <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center mx-auto text-white"><Zap size={32} /></div>
              <div className="text-white"><h4 className="font-black text-lg">최적화 실행 전략 수립</h4><p className="text-[11px] font-medium opacity-80 mt-1">목표에 맞춘 맞춤형 조정 제안</p></div>
              <button onClick={fetchStrategy} disabled={strategyLoading} className="w-full py-4.5 bg-white text-indigo-600 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all">
                {strategyLoading ? <Loader2 size={18} className="animate-spin" /> : <PlayCircle size={18} />} 실행 전략 생성
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-black text-slate-800 text-lg flex items-center gap-2"><ShieldCheck size={20} className="text-indigo-600" />추천 실행 전략</h3>
                <button onClick={handleSave} className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Save size={16} /></button>
              </div>
              <div className="p-7 rounded-[2.5rem] border-2 border-indigo-600 bg-white shadow-xl">
                <div className="flex justify-between items-start mb-6">
                  <div><h4 className="font-black text-slate-800 text-lg">{strategy.name}</h4><p className="text-[11px] font-bold text-indigo-500 mt-1">{strategy.targetSectorAllocation}</p></div>
                  <div className="text-right"><p className="text-[10px] font-black text-slate-400">기대 수익률</p><p className="text-2xl font-black text-rose-500">+{strategy.predictedReturnRate}%</p></div>
                </div>
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><p className="text-[11px] font-medium text-slate-600">{strategy.description}</p></div>
                  <div className="flex items-start gap-3 p-4 bg-indigo-50 text-indigo-700 rounded-2xl border border-indigo-100"><Lightbulb size={18} className="shrink-0" /><p className="text-[11px] font-bold">{strategy.rationale}</p></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {isGoalWizardOpen && (
        <div className="fixed inset-0 z-[400] flex items-end justify-center p-0">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsGoalWizardOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90dvh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center border-b border-slate-100">
              <div>
                <h3 className="text-xl font-black text-slate-800">투자 목표 설정</h3>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-0.5">Goal Setting Wizard ({wizardStep + 1}/{WIZARD_STEPS.length})</p>
              </div>
              <button onClick={() => setIsGoalWizardOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={20}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center shadow-sm">
                  {WIZARD_STEPS[wizardStep].icon}
                </div>
                <h4 className="text-2xl font-black text-slate-800 tracking-tight">{WIZARD_STEPS[wizardStep].title}</h4>
              </div>

              {WIZARD_STEPS[wizardStep].type === 'textarea' ? (
                <textarea 
                  className="w-full h-40 p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl text-sm font-medium outline-none focus:border-indigo-600 transition-all resize-none"
                  placeholder="예: 5년 안에 아파트 중도금을 마련하고 싶어요. 또는 특정 종목에 집중하고 싶어요."
                  value={wizardAnswers.customRequest}
                  onChange={(e) => setWizardAnswers({ ...wizardAnswers, customRequest: e.target.value })}
                />
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {WIZARD_STEPS[wizardStep].options?.map(opt => (
                    <button 
                      key={opt}
                      onClick={() => {
                        const field = WIZARD_STEPS[wizardStep].field as keyof typeof wizardAnswers;
                        setWizardAnswers({ ...wizardAnswers, [field]: opt });
                        if (wizardStep < WIZARD_STEPS.length - 1) setWizardStep(wizardStep + 1);
                      }}
                      className={`w-full py-5 px-6 rounded-2xl text-left font-black text-sm transition-all flex justify-between items-center border-2 ${wizardAnswers[WIZARD_STEPS[wizardStep].field as keyof typeof wizardAnswers] === opt ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-100' : 'bg-white text-slate-600 border-slate-100 hover:border-indigo-200'}`}
                    >
                      {opt}
                      {wizardAnswers[WIZARD_STEPS[wizardStep].field as keyof typeof wizardAnswers] === opt && <CheckCircle2 size={18} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
              {wizardStep > 0 && (
                <button onClick={() => setWizardStep(wizardStep - 1)} className="p-5 bg-white border border-slate-200 text-slate-400 rounded-2xl active:scale-95 transition-all"><ChevronLeft size={24} /></button>
              )}
              {WIZARD_STEPS[wizardStep].type === 'textarea' ? (
                <>
                  <button onClick={handleCompleteGoalWizard} disabled={isWizardProcessing} className="flex-1 py-5 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all">
                    {isWizardProcessing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} 설정 완료하기
                  </button>
                  <button onClick={handleCompleteGoalWizard} className="px-6 py-5 bg-slate-200 text-slate-500 rounded-2xl font-black text-sm active:scale-95 transition-all">건너뛰기</button>
                </>
              ) : (
                <button 
                  onClick={() => wizardStep < WIZARD_STEPS.length - 1 && setWizardStep(wizardStep + 1)}
                  disabled={!wizardAnswers[WIZARD_STEPS[wizardStep].field as keyof typeof wizardAnswers]}
                  className="flex-1 py-5 bg-slate-900 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl disabled:bg-slate-200 active:scale-95 transition-all"
                >
                  다음 단계 <ChevronRight size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {isArchiveOpen && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center p-0">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsArchiveOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] shadow-2xl flex flex-col max-h-[85dvh] animate-in slide-in-from-bottom duration-300">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center border-b border-slate-100">
              <h3 className="text-xl font-black text-slate-800">보관함</h3>
              <button onClick={() => setIsArchiveOpen(false)} className="p-2 text-slate-400"><X size={24}/></button>
            </div>
            <div className="p-6 overflow-y-auto no-scrollbar flex-1 space-y-3">
              {savedStrategies.length === 0 ? <p className="text-center py-20 text-slate-300 font-bold">저장된 기록이 없습니다.</p> : savedStrategies.map(item => (
                <div key={item.id} className="flex gap-2">
                  <button onClick={() => handleLoadSaved(item)} className="flex-1 p-5 bg-slate-50 border border-slate-100 rounded-2xl text-left hover:border-indigo-600 transition-all">
                    <h5 className="text-sm font-black text-slate-800">{item.name}</h5>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">{new Date(item.createdAt).toLocaleDateString()}</p>
                  </button>
                  <button onClick={() => onDeleteStrategy(item.id)} className="p-4 text-slate-300 hover:text-rose-500"><Trash2 size={20}/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIAdvisor;
