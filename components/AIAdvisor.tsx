
import React, { useState, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { getAIDiagnosis, getAIStrategy, generateGoalPrompt, getStockDeepDive } from '../services/geminiService';
import { Asset, RebalancingStrategy, Account, UserProfile, DiagnosisResponse, SavedStrategy } from '../types';
import { 
  Sparkles, Loader2, Target, Activity, Zap, Briefcase, 
  ArrowRight, Lightbulb, ShieldCheck, Wallet,
  Settings2, X, PlayCircle, Save,
  CheckCircle2, ChevronRight, ChevronLeft,
  RefreshCw, Layers, Archive, Trash2, Calendar, User, Compass, TrendingUp, Heart, Search, FileText, BarChart2
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
  
  const [isGoalWizardOpen, setIsGoalWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardAnswers, setWizardAnswers] = useState({ age: '', risk: '', purpose: '', horizon: '', preference: '', customRequest: '' });
  const [isWizardProcessing, setIsWizardProcessing] = useState(false);

  // Save Modal State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  // Stock Deep Dive State
  const [deepDiveQuery, setDeepDiveQuery] = useState('');
  const [deepDiveResult, setDeepDiveResult] = useState<{text: string, sources: any[]} | null>(null);
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);

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

  const handleDeepDive = async () => {
    if (!deepDiveQuery.trim()) return;
    setDeepDiveLoading(true);
    setDeepDiveResult(null);
    try {
      const result = await getStockDeepDive(deepDiveQuery);
      setDeepDiveResult(result);
    } catch (e: any) {
      showToast("분석 중 오류가 발생했습니다.");
    } finally {
      setDeepDiveLoading(false);
    }
  };

  const handleOpenSaveModal = () => {
    if (!diagnosis) return;
    const defaultName = `${strategy ? '전략' : '진단'}_${new Date().toLocaleDateString('ko-KR')}`;
    setSaveName(defaultName);
    setIsSaveModalOpen(true);
  };

  const handleConfirmSave = () => {
    if (!saveName.trim()) {
      alert("이름을 입력해주세요.");
      return;
    }
    
    // Pass the current state to the parent save handler
    onSaveStrategy({ 
      type: strategy ? 'STRATEGY' : 'DIAGNOSIS', 
      name: saveName, 
      diagnosis: diagnosis!, 
      strategy: strategy || undefined 
    });
    
    setIsSaveModalOpen(false);
  };

  const handleLoadSaved = (item: SavedStrategy) => {
    setDiagnosis(item.diagnosis || null);
    setStrategy(item.strategy || null);
    setIsArchiveOpen(false);
    showToast(`'${item.name}' 기록을 불러왔습니다.`);
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
    { title: '선호 자산 (다중 선택)', field: 'preference', options: ['국내 주식', '해외 주식', '채권', '배당주', 'ETF', '가상자산'], icon: <Compass size={24} />, multi: true },
    { title: '나만의 목표 (선택)', field: 'customRequest', type: 'textarea', icon: <Heart size={24} /> }
  ];

  return (
    <div className="pb-40 animate-in fade-in duration-500">
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-20 px-5 py-4 bg-[#F4F7FB]/95 backdrop-blur-xl border-b border-slate-200/50 flex items-center justify-between shadow-sm">
        <h2 className="text-xl font-black text-slate-800 tracking-tight">AI 자산관리자</h2>
        <button 
          onClick={() => setIsArchiveOpen(true)} 
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-2xl text-[11px] font-black shadow-md shadow-indigo-200 active:scale-95 transition-all"
        >
          <Archive size={14} /> 보관함 ({savedStrategies.length})
        </button>
      </div>

      <div className="p-5 space-y-8">
        <div className="flex flex-col gap-4">
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
                <button onClick={handleOpenSaveModal} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all">
                  <Save size={16} /> 결과 저장
                </button>
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
                  <button onClick={handleOpenSaveModal} className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-indigo-600 border border-indigo-100 rounded-lg text-xs font-bold shadow-sm">
                    <Save size={14} /> 전략 저장
                  </button>
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

                  {strategy.executionGroups && strategy.executionGroups.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-slate-100 space-y-5">
                      <h5 className="font-black text-slate-800 text-sm flex items-center gap-2">
                        <Layers size={16} className="text-indigo-600" /> 상세 매매 실행 계획
                      </h5>
                      {strategy.executionGroups.map((group, idx) => (
                        <div key={idx} className="space-y-3">
                           <div className="flex items-center gap-2 px-1">
                             <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                             <span className="text-xs font-black text-slate-600">{group.institution} <span className="text-slate-400 font-medium">({group.accountName})</span></span>
                           </div>
                           <div className="space-y-2.5">
                             {group.items.map((item, i) => (
                               <div 
                                 key={i} 
                                 onClick={() => setDeepDiveQuery(item.assetName)}
                                 className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm flex flex-col gap-2 cursor-pointer hover:border-indigo-500 hover:shadow-md transition-all active:scale-[0.98] group"
                                 title="클릭하여 심층 분석하기"
                               >
                                 <div className="flex justify-between items-start">
                                   <div className="flex items-center gap-2">
                                     <span className={`px-2 py-1 rounded-lg text-[10px] font-black ${
                                       item.action === 'BUY' ? 'bg-rose-50 text-rose-600' : 
                                       item.action === 'SELL' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'
                                     }`}>
                                       {item.action === 'BUY' ? '매수' : item.action === 'SELL' ? '매도' : '관망'}
                                     </span>
                                     <span className="text-xs font-black text-slate-800 group-hover:text-indigo-600 transition-colors">{item.assetName}</span>
                                   </div>
                                   <div className="text-right">
                                      <span className="text-xs font-black text-slate-900">{item.quantity}주</span>
                                      {item.totalAmount > 0 && <span className="text-[10px] font-medium text-slate-400 block">약 {Math.floor(item.totalAmount).toLocaleString()}원</span>}
                                   </div>
                                 </div>
                                 <p className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-lg leading-relaxed group-hover:bg-indigo-50 transition-colors">
                                   💡 {item.reason}
                                 </p>
                               </div>
                             ))}
                           </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stock Deep Dive Section */}
        <section className="bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-900 text-white rounded-xl">
              <Search size={20} />
            </div>
            <h4 className="font-black text-slate-800 text-sm">개별 종목 심층 분석</h4>
          </div>
          
          <div className="flex gap-2">
            <input 
              type="text" 
              value={deepDiveQuery}
              onChange={(e) => setDeepDiveQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleDeepDive()}
              placeholder="궁금한 종목명이나 티커를 입력하세요 (예: 테슬라)"
              className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-600 transition-all"
            />
            <button 
              onClick={handleDeepDive}
              disabled={deepDiveLoading || !deepDiveQuery.trim()}
              className="px-6 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl active:scale-95 disabled:bg-slate-200 transition-all flex items-center justify-center min-w-[80px]"
            >
              {deepDiveLoading ? <Loader2 size={20} className="animate-spin" /> : '분석'}
            </button>
          </div>

          {deepDiveResult && (
            <div className="animate-in slide-in-from-bottom-4 bg-slate-50 rounded-3xl p-6 border border-slate-100">
              <div className="prose prose-slate prose-sm max-w-none text-slate-600 leading-relaxed">
                <ReactMarkdown>{deepDiveResult.text}</ReactMarkdown>
              </div>
            </div>
          )}
        </section>

        {/* Save Modal */}
        {isSaveModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSaveModalOpen(false)}></div>
            <div className="relative bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in zoom-in-95">
              <h3 className="text-lg font-black text-slate-800 mb-4">보관함에 저장하기</h3>
              <input 
                type="text" 
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold mb-4 outline-none focus:border-indigo-600"
                placeholder="저장할 이름을 입력하세요"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleConfirmSave} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black text-sm active:scale-95 transition-all">저장</button>
                <button onClick={() => setIsSaveModalOpen(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-black text-sm active:scale-95 transition-all">취소</button>
              </div>
            </div>
          </div>
        )}

        {isGoalWizardOpen && (
          <div className="fixed inset-0 z-[1000] flex items-end justify-center p-0">
            <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-lg" onClick={() => setIsGoalWizardOpen(false)}></div>
            <div className="relative bg-white w-full max-w-md mx-auto rounded-t-[2.5rem] shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[85dvh] mb-20 overflow-hidden">
              <div className="px-8 pt-8 pb-4 flex justify-between items-center border-b border-slate-100 shrink-0">
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
                    {WIZARD_STEPS[wizardStep].options?.map(opt => {
                      const currentStepInfo = WIZARD_STEPS[wizardStep];
                      const field = currentStepInfo.field as keyof typeof wizardAnswers;
                      const isMulti = (currentStepInfo as any).multi;
                      const isSelected = isMulti 
                        ? (wizardAnswers[field] as string).split(', ').includes(opt)
                        : wizardAnswers[field] === opt;

                      return (
                        <button 
                          key={opt}
                          onClick={() => {
                            if (isMulti) {
                              const currentVal = wizardAnswers[field] as string;
                              const selectedArray = currentVal ? currentVal.split(', ') : [];
                              const nextArray = selectedArray.includes(opt)
                                ? selectedArray.filter(i => i !== opt)
                                : [...selectedArray, opt];
                              setWizardAnswers({ ...wizardAnswers, [field]: nextArray.join(', ') });
                            } else {
                              setWizardAnswers({ ...wizardAnswers, [field]: opt });
                              if (wizardStep < WIZARD_STEPS.length - 1) setWizardStep(wizardStep + 1);
                            }
                          }}
                          className={`w-full py-5 px-6 rounded-2xl text-left font-black text-sm transition-all flex justify-between items-center border-2 ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-100' : 'bg-white text-slate-600 border-slate-100 hover:border-indigo-200'}`}
                        >
                          {opt}
                          {isSelected && <CheckCircle2 size={18} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3 pb-safe shrink-0">
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
                    className="flex-1 py-5 bg-slate-900 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all"
                  >
                    다음 단계 <ChevronRight size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {isArchiveOpen && (
          <div className="fixed inset-0 z-[1000] flex items-end justify-center p-0">
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" onClick={() => setIsArchiveOpen(false)}></div>
            <div className="relative bg-white w-full max-w-md mx-auto rounded-t-[2.5rem] shadow-2xl flex flex-col max-h-[85dvh] animate-in slide-in-from-bottom duration-300 mb-20">
              <div className="px-8 pt-8 pb-4 flex justify-between items-center border-b border-slate-100 shrink-0">
                <h3 className="text-xl font-black text-slate-800">보관함</h3>
                <button onClick={() => setIsArchiveOpen(false)} className="p-2 text-slate-400"><X size={24}/></button>
              </div>
              <div className="p-6 overflow-y-auto no-scrollbar flex-1 space-y-3 pb-safe">
                {savedStrategies.length === 0 ? <p className="text-center py-20 text-slate-300 font-bold">저장된 기록이 없습니다.</p> : savedStrategies.map(item => (
                  <div key={item.id} className="flex gap-2">
                    <button onClick={() => handleLoadSaved(item)} className="flex-1 p-5 bg-slate-50 border border-slate-100 rounded-2xl text-left hover:border-indigo-600 transition-all group">
                      <div className="flex justify-between items-start">
                        <h5 className="text-sm font-black text-slate-800 group-hover:text-indigo-600">{item.name}</h5>
                        <div className="flex gap-1">
                          {item.diagnosis && <span className="p-1 rounded bg-indigo-50 text-indigo-400" title="진단 결과 포함"><FileText size={12} /></span>}
                          {item.strategy && <span className="p-1 rounded bg-emerald-50 text-emerald-400" title="실행 전략 포함"><BarChart2 size={12} /></span>}
                        </div>
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 mt-2">{new Date(item.createdAt).toLocaleDateString()}</p>
                    </button>
                    <button onClick={() => onDeleteStrategy(item.id)} className="p-4 text-slate-300 hover:text-rose-500"><Trash2 size={20}/></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAdvisor;
