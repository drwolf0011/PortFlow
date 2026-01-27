
import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { getAIDiagnosis, getAIStrategy, generateGoalPrompt } from '../services/geminiService';
import { Asset, RebalancingStrategy, SavedStrategy, Account, UserProfile, DiagnosisResponse } from '../types';
import { 
  Sparkles, Loader2, Target, Activity, Zap, Briefcase, 
  ArrowRight, Lightbulb, ShieldCheck, Wallet,
  BookOpen, Trash2, Settings2, X, PlayCircle, 
  CheckCircle2, ChevronRight, ChevronLeft, MessageSquare,
  FileText, RefreshCw, BookmarkCheck, Layers, Coins, Hourglass, Heart, Check
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
  const [isSavedModalOpen, setIsSavedModalOpen] = useState(false);
  
  // API 호출 최소화를 위한 컨텍스트 해시 관리
  // 자산 상태(수량, 가격) + 사용자 목표 정보를 결합
  const contextHash = useMemo(() => {
    const assetsKey = assets.map(a => `${a.id}-${a.quantity}-${a.currentPrice}`).join('|');
    const userKey = `${user?.investmentGoal || ''}-${user?.goalPrompt || ''}`;
    return `${assetsKey}#${userKey}`;
  }, [assets, user]);

  const lastAnalyzedHash = useRef<string | null>(null);
  const lastStrategyHash = useRef<string | null>(null);

  const fetchDiagnosis = async () => {
    if (assets.length === 0) { alert("자산을 먼저 등록해주세요."); return; }
    
    // 이미 동일한 자산 및 목표로 분석된 결과가 있다면 중복 호출 방지
    if (diagnosis && lastAnalyzedHash.current === contextHash) {
      alert("이미 최신 데이터를 기반으로 분석된 결과입니다.");
      return;
    }

    setLoading(true);
    setDiagnosis(null);
    setStrategy(null);
    try {
      const result = await getAIDiagnosis(assets, accounts, exchangeRate, user);
      setDiagnosis(result);
      lastAnalyzedHash.current = contextHash;
    } catch (err: any) {
      const isQuota = err.message?.includes('429') || err.message?.includes('quota');
      alert(isQuota ? "AI 분석 할당량이 초과되었습니다. 잠시 후 시도하거나 개인 API 키를 등록해주세요." : (err.message || "진단 중 오류 발생"));
    } finally {
      setLoading(false);
    }
  };

  const fetchStrategy = async () => {
    if (!diagnosis) return;
    
    // 동일 컨텍스트에서 이미 전략이 생성되었다면 중복 호출 방지
    if (strategy && lastStrategyHash.current === contextHash) {
      alert("이미 현재 상황에 최적화된 전략이 수립되어 있습니다.");
      return;
    }

    setStrategyLoading(true);
    try {
      const result = await getAIStrategy(assets, accounts, exchangeRate, diagnosis.currentDiagnosis, user);
      setStrategy(result);
      lastStrategyHash.current = contextHash;
    } catch (err: any) {
      const isQuota = err.message?.includes('429') || err.message?.includes('quota');
      alert(isQuota ? "전략 수립 할당량이 초과되었습니다." : (err.message || "전략 생성 중 오류 발생"));
    } finally {
      setStrategyLoading(false);
    }
  };

  const isDataChanged = lastAnalyzedHash.current !== contextHash;
  const isStrategyChanged = lastStrategyHash.current !== contextHash;

  // Goal Wizard 관련 상태
  const [isGoalWizardOpen, setIsGoalWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardAnswers, setWizardAnswers] = useState({ age: '', risk: '', purpose: '', horizon: '', preference: '', customRequest: '' });
  const [isWizardProcessing, setIsWizardProcessing] = useState(false);

  const handleCompleteGoalWizard = async () => {
    if (!user) return;
    setIsWizardProcessing(true);
    try {
      const { goal, prompt } = await generateGoalPrompt(wizardAnswers);
      onUpdateUser({ ...user, investmentGoal: goal, goalPrompt: prompt });
      setIsGoalWizardOpen(false);
      setWizardStep(0);
      setWizardAnswers({ age: '', risk: '', purpose: '', horizon: '', preference: '', customRequest: '' });
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
             <BookOpen size={12} className="text-indigo-600" /> 보관함 ({savedStrategies.length})
           </button>
         </div>

         <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-3 overflow-hidden">
             <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0"><Target size={18} /></div>
             <div className="overflow-hidden">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Investment Goal</p>
               <h3 className="text-sm font-black text-slate-800 truncate">{user?.investmentGoal || '목표 미설정'}</h3>
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
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-1">Elite Portfolio Analysis</p>
              <h2 className="text-2xl font-black tracking-tight leading-tight">PortFlow AI Expert</h2>
            </div>
          </div>
          
          <div className="space-y-3">
            <button 
              onClick={fetchDiagnosis} 
              disabled={loading || (diagnosis && !isDataChanged)} 
              className={`w-full py-4.5 rounded-[1.5rem] font-black text-sm flex items-center justify-center gap-2.5 shadow-xl active:scale-95 transition-all ${diagnosis && !isDataChanged ? 'bg-emerald-500 text-white' : 'bg-white text-slate-900'}`}
            >
              {loading ? <Loader2 size={18} className="animate-spin text-indigo-600" /> : (diagnosis && !isDataChanged ? <Check size={18} /> : <Sparkles size={18} className="text-indigo-600" />)}
              {loading ? '자산 정밀 분석 중...' : (diagnosis && !isDataChanged ? '최신 분석 완료됨' : '신규 자산 분석 시작')}
            </button>
          </div>
        </div>
      </section>

      {diagnosis && !loading && (
        <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-700">
          <section className="bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Activity size={20} /></div>
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">정밀 진단 리포트</h4>
              </div>
              <button onClick={() => {
                const name = prompt("진단 리포트 저장명:", `자산 진단 (${new Date().toLocaleDateString()})`);
                if (name) onSaveStrategy({ type: 'DIAGNOSIS', name: name.trim(), diagnosis: { ...diagnosis } });
              }} className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full">저장</button>
            </div>
            <div className="prose prose-slate prose-sm max-w-none text-slate-600 leading-relaxed pt-2">
              <ReactMarkdown>{diagnosis.currentDiagnosis}</ReactMarkdown>
            </div>
          </section>

          <section className="space-y-4">
            {!strategy ? (
              <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-center space-y-5 shadow-xl">
                <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center mx-auto text-white"><Zap size={32} /></div>
                <div className="text-white">
                  <h4 className="font-black text-lg">최적화 실행 전략 수립</h4>
                  <p className="text-[11px] font-medium opacity-80 mt-1">사용자 목표에 맞춘 맞춤형 포트폴리오 조정 제안</p>
                </div>
                <button 
                  onClick={fetchStrategy} 
                  disabled={strategyLoading} 
                  className="w-full py-4.5 bg-white text-indigo-600 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                >
                  {strategyLoading ? <Loader2 size={18} className="animate-spin" /> : <PlayCircle size={18} />}
                  {strategyLoading ? 'AI 전략 설계 중...' : '액션 플랜 생성하기'}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between px-1">
                  <h3 className="font-black text-slate-800 text-lg flex items-center gap-2"><ShieldCheck size={20} className="text-indigo-600" />추천 실행 전략</h3>
                  <div className="flex gap-2">
                    <button onClick={fetchStrategy} disabled={strategyLoading || !isStrategyChanged} className={`p-2 rounded-xl transition-all ${isStrategyChanged ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`} title="새로고침"><RefreshCw size={16} className={strategyLoading ? 'animate-spin' : ''} /></button>
                    <button onClick={() => {
                      const name = prompt("전략 리포트 저장명:", strategy.name || "통합 자산 전략");
                      if (name) onSaveStrategy({ type: 'STRATEGY', name: name.trim(), diagnosis: diagnosis ? { ...diagnosis } : undefined, strategy: { ...strategy } });
                    }} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-full text-[10px] font-black"><BookmarkCheck size={12} /> 저장</button>
                  </div>
                </div>

                <div className="p-7 rounded-[2.5rem] border-2 border-indigo-600 bg-white shadow-xl relative overflow-hidden">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h4 className="font-black text-slate-800 text-lg leading-tight">{strategy.name}</h4>
                      <p className="text-[11px] font-bold text-indigo-500 mt-1">{strategy.targetSectorAllocation}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400">기대 수익률</p>
                      <p className="text-2xl font-black text-rose-500">+{strategy.predictedReturnRate}%</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><p className="text-[11px] font-medium text-slate-600 leading-relaxed">{strategy.description}</p></div>
                    <div className="flex items-start gap-3 p-4 bg-indigo-50 text-indigo-700 rounded-2xl border border-indigo-100"><Lightbulb size={18} className="shrink-0" /><div><p className="text-[11px] font-bold leading-relaxed">{strategy.rationale}</p></div></div>
                  </div>
                </div>

                <div className="bg-white rounded-[3rem] p-8 shadow-2xl border border-indigo-50 space-y-8">
                  <div className="flex items-center gap-2.5 mb-2"><Layers size={22} className="text-indigo-600" /><h4 className="font-black text-slate-800 text-xl tracking-tight">상세 매매 리스트</h4></div>
                  <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex items-center justify-between">
                    <div className="flex-1"><p className="text-[10px] font-black text-blue-500 uppercase mb-1">매도 확보 자금</p><p className="text-base font-black text-slate-800">+{planSummary.sell.toLocaleString()}원</p></div>
                    <ArrowRight className="text-slate-200" />
                    <div className="flex-1 text-right"><p className="text-[10px] font-black text-rose-500 uppercase mb-1">매수 필요 자금</p><p className="text-base font-black text-slate-800">-{planSummary.buy.toLocaleString()}원</p></div>
                  </div>
                  {strategy.executionGroups?.map((group, gIdx) => (
                    <div key={gIdx} className="border border-slate-100 rounded-[2.5rem] p-6 bg-slate-50/30">
                      <div className="flex items-center gap-3 mb-5"><div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center"><Wallet size={20} className="text-indigo-600" /></div><div><h5 className="font-black text-slate-800 text-sm">{group.accountName || group.institution}</h5><p className="text-[10px] font-bold text-slate-400">{group.institution}</p></div></div>
                      <div className="space-y-3">
                        {group.items?.map((item, i) => (
                          <div key={i} className={`p-4 rounded-[1.8rem] border bg-white ${item.action === 'BUY' ? 'border-rose-100 shadow-sm shadow-rose-50' : item.action === 'SELL' ? 'border-blue-100 shadow-sm shadow-blue-50' : 'border-slate-100'}`}>
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex gap-3">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-[9px] ${item.action === 'BUY' ? 'bg-rose-500 text-white' : item.action === 'SELL' ? 'bg-blue-500 text-white' : 'bg-slate-400 text-white'}`}>{item.action[0]}</div>
                                <div><p className="text-xs font-black text-slate-800">{item.assetName}</p><p className="text-[9px] font-bold text-slate-400">{item.quantity}주 • {Math.floor(item.estimatedPrice).toLocaleString()}원</p></div>
                              </div>
                              <p className="text-xs font-black text-slate-900">{Math.floor(item.totalAmount || 0).toLocaleString()}원</p>
                            </div>
                            <p className="text-[10px] font-bold text-slate-500 pl-11">{item.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* 보관함 모달 */}
      {isSavedModalOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSavedModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 max-h-[80vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-800">전략 보관함</h3>
              <button onClick={() => setIsSavedModalOpen(false)}><X size={20}/></button>
            </div>
            <div className="space-y-3">
              {savedStrategies.length === 0 ? (
                <div className="py-12 text-center opacity-30"><FileText size={48} className="mx-auto mb-2"/><p className="text-xs font-bold">저장된 내역이 없습니다.</p></div>
              ) : (
                savedStrategies.map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-300 transition-all group">
                    <button onClick={() => { if (s.diagnosis) setDiagnosis(s.diagnosis); if (s.strategy) setStrategy(s.strategy); setIsSavedModalOpen(false); }} className="flex-1 text-left">
                      <p className="text-[10px] font-black text-indigo-600 uppercase mb-0.5">{s.type}</p>
                      <h4 className="text-sm font-black text-slate-800 truncate">{s.name}</h4>
                      <p className="text-[9px] font-bold text-slate-400">{new Date(s.createdAt).toLocaleString()}</p>
                    </button>
                    <button onClick={() => onDeleteStrategy(s.id)} className="p-2 text-slate-300 hover:text-rose-500"><Trash2 size={16}/></button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Goal Wizard */}
      {isGoalWizardOpen && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setIsGoalWizardOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90dvh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center bg-white shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-800">투자 목표 설정</h3>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-0.5">Wizard Step {wizardStep + 1} of 6</p>
              </div>
              <button onClick={() => setIsGoalWizardOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={20}/></button>
            </div>
            <div className="p-8 overflow-y-auto no-scrollbar flex-1 relative">
              <div className="flex gap-1.5 mb-10">
                {[0, 1, 2, 3, 4, 5].map(step => (
                  <div key={step} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${wizardStep >= step ? 'bg-indigo-600' : 'bg-slate-100'}`}></div>
                ))}
              </div>

              {wizardStep === 0 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6"><Target size={32} /></div>
                  <h4 className="text-xl font-black text-slate-800 leading-tight">나이대를 선택해주세요.</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {['20대 이하', '30대', '40대', '50대', '60대 이상'].map(age => (
                      <button key={age} onClick={() => { setWizardAnswers({...wizardAnswers, age}); setWizardStep(1); }} className="w-full p-5 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl font-black text-sm text-slate-700 transition-all flex justify-between items-center group">{age} <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-600" /></button>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mb-6"><Activity size={32} /></div>
                  <h4 className="text-xl font-black text-slate-800 leading-tight">투자 성향을 알려주세요.</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {['공격투자형 (High Risk)', '적극투자형', '위험중립형', '안정추구형', '안정형 (Low Risk)'].map(risk => (
                      <button key={risk} onClick={() => { setWizardAnswers({...wizardAnswers, risk}); setWizardStep(2); }} className="w-full p-5 text-left bg-slate-50 hover:bg-rose-50 border border-slate-100 hover:border-rose-200 rounded-2xl font-black text-sm text-slate-700 transition-all flex justify-between items-center group">{risk} <ChevronRight size={18} className="text-slate-300 group-hover:text-rose-600" /></button>
                    ))}
                  </div>
                  <button onClick={() => setWizardStep(0)} className="flex items-center gap-1 text-xs font-black text-slate-400 mt-4"><ChevronLeft size={16} /> 이전으로</button>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6"><Coins size={32} /></div>
                  <h4 className="text-xl font-black text-slate-800 leading-tight">주된 투자 목적이 무엇인가요?</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {['노후 자금 마련', '내 집 마련', '자녀 교육 및 결혼', '목돈 굴리기', '비상금 확보'].map(purpose => (
                      <button key={purpose} onClick={() => { setWizardAnswers({...wizardAnswers, purpose}); setWizardStep(3); }} className="w-full p-5 text-left bg-slate-50 hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 rounded-2xl font-black text-sm text-slate-700 transition-all flex justify-between items-center group">{purpose} <ChevronRight size={18} className="text-slate-300 group-hover:text-emerald-600" /></button>
                    ))}
                  </div>
                  <button onClick={() => setWizardStep(1)} className="flex items-center gap-1 text-xs font-black text-slate-400 mt-4"><ChevronLeft size={16} /> 이전으로</button>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-6"><Hourglass size={32} /></div>
                  <h4 className="text-xl font-black text-slate-800 leading-tight">예상하는 투자 기간은 어느 정도인가요?</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {['1년 미만 (초단기)', '1년 ~ 3년', '3년 ~ 5년', '5년 ~ 10년', '10년 이상 (장기)'].map(horizon => (
                      <button key={horizon} onClick={() => { setWizardAnswers({...wizardAnswers, horizon}); setWizardStep(4); }} className="w-full p-5 text-left bg-slate-50 hover:bg-amber-50 border border-slate-100 hover:border-amber-200 rounded-2xl font-black text-sm text-slate-700 transition-all flex justify-between items-center group">{horizon} <ChevronRight size={18} className="text-slate-300 group-hover:text-amber-600" /></button>
                    ))}
                  </div>
                  <button onClick={() => setWizardStep(2)} className="flex items-center gap-1 text-xs font-black text-slate-400 mt-4"><ChevronLeft size={16} /> 이전으로</button>
                </div>
              )}

              {wizardStep === 4 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6"><Heart size={32} /></div>
                  <h4 className="text-xl font-black text-slate-800 leading-tight">특별히 선호하는 자산군이 있나요?</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {['국내 우량 주식', '미국 빅테크 주식', '배당 성장주', '안전 자산 (채권/금)', '가상자산/AI 섹터'].map(preference => (
                      <button key={preference} onClick={() => { setWizardAnswers({...wizardAnswers, preference}); setWizardStep(5); }} className="w-full p-5 text-left bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl font-black text-sm text-slate-700 transition-all flex justify-between items-center group">{preference} <ChevronRight size={18} className="text-slate-300 group-hover:text-indigo-600" /></button>
                    ))}
                  </div>
                  <button onClick={() => setWizardStep(3)} className="flex items-center gap-1 text-xs font-black text-slate-400 mt-4"><ChevronLeft size={16} /> 이전으로</button>
                </div>
              )}

              {wizardStep === 5 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><MessageSquare size={24} /></div>
                  <h4 className="text-xl font-black text-slate-800 leading-tight">나만의 목표나 추가 요청이 있나요? (선택)</h4>
                  <textarea value={wizardAnswers.customRequest} onChange={(e) => setWizardAnswers({...wizardAnswers, customRequest: e.target.value})} placeholder="예: 배당주 위주로 포트폴리오를 구성해줘..." className="w-full h-40 p-5 bg-slate-50 border border-slate-200 rounded-[1.5rem] text-sm font-bold text-slate-700 outline-none focus:border-indigo-500 focus:bg-white transition-all resize-none" />
                  <div className="flex flex-col gap-3 pt-2">
                    <button onClick={handleCompleteGoalWizard} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-base shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"><CheckCircle2 size={20} /> 설정 완료</button>
                    <button onClick={() => setWizardStep(4)} className="flex items-center gap-1 text-xs font-black text-slate-400 justify-center"><ChevronLeft size={16} /> 이전으로</button>
                  </div>
                </div>
              )}

              {isWizardProcessing && (
                <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-[310] flex flex-col items-center justify-center p-8 text-center animate-in fade-in">
                  <div className="w-24 h-24 bg-indigo-600 rounded-[3rem] flex items-center justify-center text-white mb-8 shadow-2xl shadow-indigo-200">
                    <Sparkles size={48} className="animate-pulse" />
                  </div>
                  <h4 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">AI 맞춤형 가이드 생성 중...</h4>
                  <Loader2 className="animate-spin text-indigo-600 mt-10" size={32} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIAdvisor;
