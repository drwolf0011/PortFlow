
import React, { useState, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { getAIDiagnosis, getAIStrategy, getStockDeepDive, generateGoalPrompt } from '../services/geminiService';
import { Asset, RebalancingStrategy, SavedStrategy, Account, UserProfile, DiagnosisResponse } from '../types';
import { 
  Sparkles, Loader2, Search, Target, TrendingUp,
  Activity, Zap, Globe, Briefcase, 
  Scale, ArrowRight, 
  Lightbulb, ShieldCheck, Wallet,
  Bookmark, BookOpen, Trash2, Calendar, Settings2,
  X, FileSearch, Save, PlayCircle, CheckCircle2, ChevronRight, ChevronLeft, MessageSquare,
  FileText, ClipboardCheck
} from 'lucide-react';

interface AIAdvisorProps {
  assets: Asset[];
  accounts: Account[];
  onApplyRebalancing: (institution: string) => void;
  exchangeRate: number;
  onSaveStrategy: (data: { 
    type: 'DIAGNOSIS' | 'STRATEGY', 
    name: string, 
    diagnosis?: DiagnosisResponse, 
    strategy?: RebalancingStrategy 
  }) => void;
  savedStrategies: SavedStrategy[];
  onDeleteStrategy: (id: string) => void;
  user: UserProfile | null;
  onUpdateUser: (updatedUser: UserProfile) => void;
}

const AIAdvisor: React.FC<AIAdvisorProps> = ({ 
  assets, accounts, onApplyRebalancing, exchangeRate, 
  onSaveStrategy, savedStrategies, onDeleteStrategy,
  user, onUpdateUser
}) => {
  const [diagnosis, setDiagnosis] = useState<DiagnosisResponse | null>(null);
  const [strategy, setStrategy] = useState<RebalancingStrategy | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [strategyLoading, setStrategyLoading] = useState<boolean>(false);
  const [stockQuery, setStockQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [stockDeepDive, setStockDeepDive] = useState<{ text: string, sources: { title: string; uri: string }[] } | null>(null);
  const [isSavedModalOpen, setIsSavedModalOpen] = useState(false);
  
  // Goal Wizard State
  const [isGoalWizardOpen, setIsGoalWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardAnswers, setWizardAnswers] = useState({
    age: '',
    risk: '',
    purpose: '',
    horizon: '',
    preference: '',
    customRequest: ''
  });
  const [isWizardProcessing, setIsWizardProcessing] = useState(false);

  const researchSectionRef = useRef<HTMLDivElement>(null);

  const fetchDiagnosis = async () => {
    if (assets.length === 0) { alert("자산을 먼저 등록해주세요."); return; }
    setLoading(true);
    setDiagnosis(null);
    setStrategy(null);
    try {
      const result = await getAIDiagnosis(assets, accounts, exchangeRate, user);
      setDiagnosis(result);
    } catch (err: any) { alert(err.message || "진단 중 오류 발생"); }
    finally { setLoading(false); }
  };

  const fetchStrategy = async () => {
    if (!diagnosis) return;
    setStrategyLoading(true);
    try {
      const result = await getAIStrategy(assets, accounts, exchangeRate, diagnosis.currentDiagnosis, user);
      setStrategy(result);
    } catch (err: any) { alert(err.message || "전략 생성 중 오류 발생"); }
    finally { setStrategyLoading(false); }
  };

  const handleSaveDiagnosis = () => {
    if (!diagnosis) {
      alert("저장할 진단 결과가 없습니다.");
      return;
    }
    const defaultName = `자산 진단 (${new Date().toLocaleDateString()})`;
    const name = prompt("진단 리포트 저장명:", defaultName);
    if (name === null) return;
    
    const finalName = name.trim() || defaultName;
    onSaveStrategy({ 
      type: 'DIAGNOSIS', 
      name: finalName, 
      diagnosis: { ...diagnosis } 
    });
  };

  const handleSaveStrategyClick = () => {
    if (!strategy) {
      alert("저장할 전략이 없습니다.");
      return;
    }
    const defaultName = strategy.name || "통합 자산 관리 전략";
    const name = prompt("통합 전략 리포트 저장명:", defaultName);
    if (name === null) return;
    
    const finalName = name.trim() || defaultName;
    // 전략 저장 시 현재 진단 결과가 있다면 함께 저장하여 링크함
    onSaveStrategy({ 
      type: 'STRATEGY', 
      name: finalName, 
      diagnosis: diagnosis ? { ...diagnosis } : undefined,
      strategy: { ...strategy } 
    });
  };

  const handleLoadSavedItem = (saved: SavedStrategy) => {
    // 진단과 전략을 동시에 로드하여 맥락을 유지
    if (saved.diagnosis) setDiagnosis(saved.diagnosis);
    else setDiagnosis(null);

    if (saved.strategy) setStrategy(saved.strategy);
    else setStrategy(null);

    setIsSavedModalOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeepDiveSearch = async (queryInput?: string) => {
    const finalQuery = queryInput || stockQuery;
    if (!finalQuery.trim() || searchLoading) return;
    setSearchLoading(true);
    setStockQuery(finalQuery);
    setStockDeepDive(null);
    researchSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const result = await getStockDeepDive(finalQuery);
      setStockDeepDive(result);
    } catch (err) { alert("분석 오류"); }
    finally { setSearchLoading(false); }
  };

  const handleCompleteGoalWizard = async () => {
    if (!user) return;
    setIsWizardProcessing(true);
    try {
      const { goal, prompt } = await generateGoalPrompt(wizardAnswers);
      onUpdateUser({
        ...user,
        investmentGoal: goal,
        goalPrompt: prompt
      });
      setIsGoalWizardOpen(false);
      setWizardStep(0);
      alert("투자 목표가 성공적으로 업데이트되었습니다. 이제 AI가 이 목표를 바탕으로 자산을 진단합니다.");
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

  return (
    <div className="p-5 space-y-8 pb-40 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 px-1">
         <div className="flex items-center justify-between">
           <h2 className="text-xl font-black text-slate-800 tracking-tight">AI 자산관리자</h2>
           <button onClick={() => setIsSavedModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 rounded-full text-[10px] font-black text-slate-600 shadow-sm active:scale-95 transition-all">
             <BookOpen size={12} className="text-indigo-600" /> 전략 보관함 ({savedStrategies.length})
           </button>
         </div>

         <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-3 overflow-hidden">
             <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0"><Target size={18} /></div>
             <div className="overflow-hidden">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Investment Goal</p>
               <h3 className="text-sm font-black text-slate-800 truncate">{user?.investmentGoal || '목표를 설정해주세요'}</h3>
             </div>
           </div>
           <button onClick={() => setIsGoalWizardOpen(true)} className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:text-indigo-600 transition-all">
             <Settings2 size={18} />
           </button>
         </div>
      </div>

      <section className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg"><Briefcase className="text-white" size={28} /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-1">Elite Wealth Management</p>
              <h2 className="text-2xl font-black tracking-tight leading-tight">PortFlow AI</h2>
            </div>
          </div>
          <button onClick={fetchDiagnosis} disabled={loading} className="w-full bg-white text-slate-900 py-4.5 rounded-[1.5rem] font-black text-sm flex items-center justify-center gap-2.5 shadow-xl active:scale-95 transition-all">
            {loading ? <Loader2 size={18} className="animate-spin text-indigo-600" /> : <Sparkles size={18} className="text-indigo-600" />}
            {loading ? '자산 정밀 진단 중...' : '신규 자산 분석 시작'}
          </button>
        </div>
      </section>

      {diagnosis && !loading && (
        <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-700">
          <section className="bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0"><Activity size={20} /></div>
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">자산 정밀 진단 리포트</h4>
              </div>
              <button onClick={handleSaveDiagnosis} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-full text-[10px] font-black transition-all">
                <Save size={12} /> 진단 저장
              </button>
            </div>
            <div className="prose prose-slate prose-sm max-w-none text-slate-600 leading-relaxed pt-2">
              <ReactMarkdown>{diagnosis.currentDiagnosis}</ReactMarkdown>
            </div>
          </section>

          {!strategy && (
            <div className="bg-indigo-50/50 p-8 rounded-[2.5rem] border border-indigo-100 text-center space-y-5">
              <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto text-indigo-600"><Target size={32} /></div>
              <div>
                <h4 className="font-black text-slate-800">구체적인 실행 전략이 필요하신가요?</h4>
                <p className="text-xs text-slate-500 font-medium mt-1">계좌별 최적의 매매 타이밍과 수량을 제안해 드립니다.</p>
              </div>
              <button onClick={fetchStrategy} disabled={strategyLoading} className="w-full py-4.5 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95">
                {strategyLoading ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                {strategyLoading ? '전략 수립 중...' : '리밸런싱 액션 플랜 생성'}
              </button>
            </div>
          )}

          {strategy && (
            <section className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="font-black text-slate-800 text-lg flex items-center gap-2"><ShieldCheck size={20} className="text-indigo-600" />AI 추천 마스터 전략</h3>
                <button onClick={handleSaveStrategyClick} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-full text-[10px] font-black active:scale-95"><Bookmark size={12} /> 전략 저장</button>
              </div>
              <div className="p-7 rounded-[2.5rem] border-2 border-indigo-600 bg-indigo-50/10 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-black px-4 py-2 rounded-bl-2xl">AI Optimized</div>
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-emerald-100 text-emerald-600"><Scale size={24} /></div>
                    <div><h4 className="font-black text-slate-800 text-lg leading-tight">{strategy.name}</h4><p className="text-[11px] font-bold text-slate-400 mt-0.5">{strategy.targetSectorAllocation}</p></div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400">예상 수익률</p>
                    <p className="text-2xl font-black text-rose-500">+{strategy.predictedReturnRate}%</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="bg-white/60 p-4 rounded-2xl border border-white shadow-sm"><p className="text-xs font-medium text-slate-600">{strategy.description}</p></div>
                  <div className="flex items-start gap-3 p-4 bg-indigo-600 text-white rounded-2xl shadow-lg"><Lightbulb size={18} className="shrink-0" /><div><p className="text-xs font-bold leading-relaxed">{strategy.rationale}</p></div></div>
                </div>
              </div>

              <div className="bg-white rounded-[3rem] p-8 shadow-2xl border border-indigo-50 space-y-8">
                <div className="flex items-center gap-2.5 mb-8"><Zap size={22} className="text-indigo-600" fill="currentColor" /><h4 className="font-black text-slate-800 text-xl tracking-tight">Step-by-Step 액션 플랜</h4></div>
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex items-center justify-between gap-4">
                  <div className="flex-1"><p className="text-[10px] font-black text-blue-500 uppercase">매도 확보 자금</p><p className="text-base font-black text-slate-800">+{planSummary.sell.toLocaleString()}원</p></div>
                  <ArrowRight className="text-slate-200" /><div className="flex-1 text-right"><p className="text-[10px] font-black text-rose-500 uppercase">매수 필요 자금</p><p className="text-base font-black text-slate-800">-{planSummary.buy.toLocaleString()}원</p></div>
                </div>
                {strategy.executionGroups?.map((group, gIdx) => (
                  <div key={gIdx} className="border border-slate-100 rounded-[2rem] p-6 bg-slate-50/50">
                    <div className="flex items-center gap-3 mb-5"><div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center"><Wallet size={20} className="text-indigo-600" /></div><div><h5 className="font-black text-slate-800 text-sm">{group.accountName || group.institution}</h5><p className="text-[10px] font-bold text-slate-400">{group.institution}</p></div></div>
                    <div className="space-y-3">
                      {group.items?.map((item, i) => (
                        <div key={i} onClick={() => handleDeepDiveSearch(item.assetName)} className={`p-4 rounded-[1.5rem] border bg-white cursor-pointer active:scale-95 ${item.action === 'BUY' ? 'border-rose-100' : item.action === 'SELL' ? 'border-blue-100' : 'border-slate-100'}`}>
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex gap-3">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-[9px] ${item.action === 'BUY' ? 'bg-rose-500 text-white' : 'bg-blue-500 text-white'}`}>
                                {item.action === 'BUY' ? '매수' : item.action === 'SELL' ? '매도' : '유지'}
                              </div>
                              <div><p className="text-xs font-black text-slate-800">{item.assetName}</p></div>
                            </div>
                            <div className="text-right"><p className="text-xs font-black text-slate-900">{Math.floor(item.totalAmount || 0).toLocaleString()}원</p></div>
                          </div>
                          <p className="text-[10px] font-bold text-slate-500 pl-11">{item.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Goal Wizard Modal */}
      {isGoalWizardOpen && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setIsGoalWizardOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90dvh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center bg-white shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-800">투자 목표 설정</h3>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-0.5">Investment Goal Discovery</p>
              </div>
              <button onClick={() => setIsGoalWizardOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={20}/></button>
            </div>
            
            <div className="p-8 overflow-y-auto no-scrollbar flex-1">
              {/* Progress Bar */}
              <div className="flex gap-1.5 mb-8">
                {[0, 1, 2, 3, 4, 5].map(step => (
                  <div key={step} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${wizardStep >= step ? 'bg-indigo-600' : 'bg-slate-100'}`}></div>
                ))}
              </div>

              {wizardStep === 0 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6"><Target size={32} /></div>
                  <h4 className="text-xl font-black text-slate-800 leading-tight">나의 투자 성향에 맞춘<br/>스마트한 자산관리를 시작하세요.</h4>
                  <p className="text-sm font-bold text-slate-400 leading-relaxed">연령, 자산 규모, 리스크 감수도를 분석하여 AI가 최적의 포트폴리오 가이드를 생성합니다.</p>
                  <div className="grid grid-cols-1 gap-3 pt-4">
                    {['20대 이하', '30대', '40대', '50대', '60대 이상'].map(age => (
                      <button key={age} onClick={() => { setWizardAnswers({...wizardAnswers, age}); setWizardStep(1); }} className="w-full p-5 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl font-black text-sm text-slate-700 transition-all flex justify-between items-center group">
                        {age} <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-600" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <h4 className="text-xl font-black text-slate-800 leading-tight">어떤 투자 스타일을 선호하시나요?</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { label: '안정형', desc: '원금 손실을 최소화하고 예적금보다 조금 높은 수익을 원함', val: 'CONSERVATIVE' },
                      { label: '중립형', desc: '적절한 위험을 감수하며 예적금 대비 의미 있는 수익을 원함', val: 'BALANCED' },
                      { label: '공격형', desc: '높은 수익을 위해 일시적인 자산 가치 하락을 감수할 수 있음', val: 'AGGRESSIVE' }
                    ].map(risk => (
                      <button key={risk.val} onClick={() => { setWizardAnswers({...wizardAnswers, risk: risk.val}); setWizardStep(2); }} className="w-full p-5 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl transition-all group">
                        <p className="font-black text-sm text-slate-800 mb-1">{risk.label}</p>
                        <p className="text-[11px] font-bold text-slate-400 group-hover:text-indigo-400">{risk.desc}</p>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setWizardStep(0)} className="flex items-center gap-1 text-xs font-black text-slate-300 mt-4"><ChevronLeft size={16} /> 이전으로</button>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <h4 className="text-xl font-black text-slate-800 leading-tight">가장 중요한 투자 목적은 무엇인가요?</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {['노후 자금 마련', '내 집 마련', '자녀 교육 및 증여', '현금 흐름(배당) 창출', '단기 고수익 추구'].map(purpose => (
                      <button key={purpose} onClick={() => { setWizardAnswers({...wizardAnswers, purpose}); setWizardStep(3); }} className="w-full p-5 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl font-black text-sm text-slate-700 transition-all flex justify-between items-center group">
                        {purpose} <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-600" />
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setWizardStep(1)} className="flex items-center gap-1 text-xs font-black text-slate-300 mt-4"><ChevronLeft size={16} /> 이전으로</button>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <h4 className="text-xl font-black text-slate-800 leading-tight">얼마 동안 투자할 계획이신가요?</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {['1년 미만', '1~3년', '3~5년', '5~10년', '10년 이상'].map(horizon => (
                      <button key={horizon} onClick={() => { setWizardAnswers({...wizardAnswers, horizon}); setWizardStep(4); }} className="w-full p-5 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl font-black text-sm text-slate-700 transition-all flex justify-between items-center group">
                        {horizon} <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-600" />
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setWizardStep(2)} className="flex items-center gap-1 text-xs font-black text-slate-300 mt-4"><ChevronLeft size={16} /> 이전으로</button>
                </div>
              )}

              {wizardStep === 4 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <h4 className="text-xl font-black text-slate-800 leading-tight">특별히 선호하는 자산군이 있나요?</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {['국내 주식 위주', '미국 등 해외 주식 위주', '채권 및 배당주 위주', '상관 없음 (AI 최적화)'].map(pref => (
                      <button key={pref} onClick={() => { setWizardAnswers({...wizardAnswers, preference: pref}); setWizardStep(5); }} className="w-full p-5 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl font-black text-sm text-slate-700 transition-all flex justify-between items-center group">
                        {pref} <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-600" />
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setWizardStep(3)} className="flex items-center gap-1 text-xs font-black text-slate-300 mt-4"><ChevronLeft size={16} /> 이전으로</button>
                </div>
              )}

              {wizardStep === 5 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><MessageSquare size={24} /></div>
                  <h4 className="text-xl font-black text-slate-800 leading-tight">AI에게 전달할 추가 요청 사항이 있나요?</h4>
                  <p className="text-xs font-bold text-slate-400">구체적으로 입력할수록 더 정교한 자산 관리가 가능합니다. (건너뛰기 가능)</p>
                  
                  <textarea 
                    value={wizardAnswers.customRequest}
                    onChange={(e) => setWizardAnswers({...wizardAnswers, customRequest: e.target.value})}
                    placeholder="예: 배당주 위주로 포트폴리오를 구성해줘, 기술주 비중은 30% 이하로 유지하고 싶어, 환경 친화적 기업(ESG)에 투자하고 싶어 등..."
                    className="w-full h-40 p-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 focus:bg-white transition-all resize-none"
                  />
                  
                  <div className="flex flex-col gap-3 pt-2">
                    <button 
                      onClick={handleCompleteGoalWizard}
                      className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={20} /> 설정 완료
                    </button>
                    <button onClick={() => setWizardStep(4)} className="flex items-center gap-1 text-xs font-black text-slate-300 justify-center"><ChevronLeft size={16} /> 이전으로</button>
                  </div>
                </div>
              )}

              {isWizardProcessing && (
                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-[310] flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
                  <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center text-white mb-6 shadow-2xl shadow-indigo-200">
                    <Sparkles size={40} className="animate-pulse" />
                  </div>
                  <h4 className="text-xl font-black text-slate-800 mb-2">AI가 투자 가이드를 생성 중입니다</h4>
                  <p className="text-sm font-bold text-slate-400">입력하신 정보와 요청 사항을 바탕으로 가장 스마트한 관리 전략을 설계하고 있습니다. 잠시만 기다려주세요.</p>
                  <div className="mt-10 flex gap-2">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                    <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                    <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isSavedModalOpen && (
        <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSavedModalOpen(false)}></div>
          <div className="relative bg-[#F4F7FB] w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90dvh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center bg-white border-b border-slate-100 shrink-0">
              <h3 className="text-2xl font-black text-slate-800">전략 보관함</h3>
              <button onClick={() => setIsSavedModalOpen(false)} className="p-2 text-slate-400"><X size={20}/></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              {savedStrategies.map(saved => (
                <div key={saved.id} className="p-5 bg-white border border-slate-100 rounded-[2.2rem] shadow-sm relative group cursor-pointer hover:border-indigo-200 transition-all" onClick={() => handleLoadSavedItem(saved)}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                       <div className="flex items-center gap-2 mb-3">
                         <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${saved.type === 'DIAGNOSIS' ? 'bg-blue-50 text-blue-600' : 'bg-indigo-50 text-indigo-600'}`}>
                           {saved.type === 'DIAGNOSIS' ? '진단 리포트' : '통합 전략'}
                         </span>
                         <div className="flex gap-1">
                           {/* Fix: Wrapped Lucide icons in spans with title attributes to fix type error where title is not accepted directly on the icon component */}
                           {saved.diagnosis && <span title="진단 포함"><FileText size={10} className="text-slate-400" /></span>}
                           {saved.strategy && <span title="전략 포함"><ClipboardCheck size={10} className="text-indigo-400" /></span>}
                         </div>
                       </div>
                       <h4 className="font-black text-slate-800 text-sm mb-2 leading-tight">{saved.name}</h4>
                       <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                         <Calendar size={10} /> {new Date(saved.createdAt).toLocaleDateString()}
                       </p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onDeleteStrategy(saved.id); }} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
              {savedStrategies.length === 0 && (
                <div className="text-center py-20">
                  <BookOpen size={48} className="mx-auto text-slate-100 mb-4" />
                  <p className="text-slate-300 font-bold">보관된 전략이 없습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <section ref={researchSectionRef} className="space-y-6 pt-12 border-t border-slate-200">
        <div className="flex items-center gap-2.5 px-1"><Search size={22} className="text-indigo-600" /><h4 className="font-black text-slate-800 text-lg">인텔리전스 종목 리서치</h4></div>
        <form onSubmit={(e) => { e.preventDefault(); handleDeepDiveSearch(); }} className="relative">
          <input type="text" value={stockQuery} onChange={(e) => setStockQuery(e.target.value)} placeholder="분석할 종목명 (예: 엔비디아...)" className="w-full pl-6 pr-36 py-6 bg-white border-2 border-slate-100 rounded-[2.2rem] shadow-sm text-sm font-bold outline-none transition-all" />
          <button type="submit" disabled={searchLoading || !stockQuery.trim()} className="absolute right-3 top-3 bottom-3 bg-indigo-600 text-white px-7 rounded-[1.8rem] text-[11px] font-black flex items-center gap-2 active:scale-95 shadow-lg transition-all">
            {searchLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}분석
          </button>
        </form>
        {stockDeepDive && (
          <div className="bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4 animate-in fade-in">
             <div className="flex items-center gap-2 mb-4"><div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><FileSearch size={18} /></div><h4 className="text-sm font-black text-slate-800">'{stockQuery}' 심층 분석</h4></div>
             <div className="prose prose-slate prose-sm max-w-none text-slate-600 leading-relaxed"><ReactMarkdown>{stockDeepDive.text}</ReactMarkdown></div>
          </div>
        )}
      </section>
    </div>
  );
};

export default AIAdvisor;
