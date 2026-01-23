
import React, { useState, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { getAIAnalysis, getStockDeepDive, generateGoalPrompt, AnalysisResponse } from '../services/geminiService';
import { Asset, RebalancingStrategy, SavedStrategy, Account, UserProfile } from '../types';
import { 
  Sparkles, ChevronDown, ChevronUp,
  Loader2, Search, ExternalLink, Target, TrendingUp, Info, 
  Link as LinkIcon, Activity, Zap, Globe, Briefcase, 
  BarChart3, Scale, Banknote, ArrowRight, 
  Calculator, Lightbulb, CheckCircle2, ShieldCheck, AlertTriangle, Wallet,
  Bookmark, BookOpen, Trash2, Calendar, FolderOpen, User, Settings2, Check,
  X, FileText, BarChart, MoveUpRight, Quote, Clock3
} from 'lucide-react';
import { BarChart as ReBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface AIAdvisorProps {
  assets: Asset[];
  accounts: Account[];
  onApplyRebalancing: (institution: string) => void;
  exchangeRate: number;
  onSaveStrategy: (strategy: RebalancingStrategy) => void;
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
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [showSources, setShowSources] = useState(false); // 리서치 리포트 소스 접기 상태
  const [stockQuery, setStockQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [stockDeepDive, setStockDeepDive] = useState<{ text: string, sources: { title: string; uri: string }[] } | null>(null);
  const [isSavedModalOpen, setIsSavedModalOpen] = useState(false);
  const [isGoalWizardOpen, setIsGoalWizardOpen] = useState(false);
  const [loadedStrategyId, setLoadedStrategyId] = useState<string | null>(null);
  const researchSectionRef = useRef<HTMLDivElement>(null);

  // Goal Wizard State
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardAnswers, setWizardAnswers] = useState({
    age: '',
    risk: '',
    purpose: '',
    horizon: '',
    preference: ''
  });
  const [isWizardProcessing, setIsWizardProcessing] = useState(false);
  const [suggestedGoal, setSuggestedGoal] = useState<{ goal: string, prompt: string } | null>(null);

  const fetchAnalysis = async () => {
    if (assets.length === 0) {
      alert("분석할 자산이 없습니다. 먼저 자산을 등록해주세요.");
      return;
    }
    setLoading(true);
    setData(null);
    setLoadedStrategyId(null);
    try {
      const result = await getAIAnalysis(assets, accounts || [], exchangeRate, user);
      setData(result);
    } catch (err) {
      console.error(err);
      alert("분석 로드 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeepDiveSearch = async (queryInput?: string) => {
    const finalQuery = queryInput || stockQuery;
    if (!finalQuery.trim() || searchLoading) return;
    
    setSearchLoading(true);
    setStockQuery(finalQuery);
    setStockDeepDive(null);
    setShowSources(false); // 새로운 검색 시 소스 목록 초기화(접힘)
    
    // Scroll to research section
    researchSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const result = await getStockDeepDive(finalQuery);
      setStockDeepDive(result);
    } catch (err) {
      alert("분석 오류가 발생했습니다.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSaveCurrentStrategy = () => {
    if (data?.bestStrategy) {
      onSaveStrategy(data.bestStrategy);
    }
  };

  const handleLoadStrategy = (saved: SavedStrategy) => {
    const reconstructedData: AnalysisResponse = {
      currentDiagnosis: "*(저장된 전략을 불러왔습니다. 과거 시점의 진단 내용이 없을 수 있습니다.)*",
      marketConditions: "저장된 기록",
      bestStrategy: saved.strategy,
      sources: []
    };
    setData(reconstructedData);
    setLoadedStrategyId(saved.id);
    setIsSavedModalOpen(false);
  };

  // Funding Plan Summary calculation
  const planSummary = useMemo(() => {
    if (!data?.bestStrategy?.executionGroups) return { buy: 0, sell: 0, net: 0 };
    let buy = 0, sell = 0;
    data.bestStrategy.executionGroups.forEach(group => {
      group.items?.forEach(item => {
        const amount = item.totalAmount || 0;
        if (item.action === 'BUY') buy += amount;
        else if (item.action === 'SELL') sell += amount;
      });
    });
    return { buy, sell, net: sell - buy };
  }, [data]);

  // Goal Wizard Handlers
  const wizardQuestions = [
    { key: 'age', label: '현재 연령대가 어떻게 되시나요?', options: ['20대 이하', '30대', '40대', '50대', '60대 이상'] },
    { key: 'risk', label: '선호하는 투자 위험 수준은?', options: ['안정 지향 (원금 보존 우선)', '중립성 (적정 수익과 위험)', '공격 투자 (높은 수익 추구)'] },
    { key: 'purpose', label: '투자의 주된 목적은 무엇인가요?', options: ['노후 자금 마련', '주택 구입/확장', '자녀 교육/증여', '자산 증식 (Growth)', '현금 흐름 (Income)'] },
    { key: 'horizon', label: '목표 달성까지 예상 기간은?', options: ['3년 미만', '3~10년', '10~20년', '20년 이상'] },
    { key: 'preference', label: '특별히 선호하는 자산이나 제약사항이 있나요?', placeholder: '예: 미국 주식 선호, ESG 투자 관심, 가상자산 제외 등' }
  ];

  const handleWizardNext = () => {
    if (wizardStep < wizardQuestions.length - 1) {
      setWizardStep(prev => prev + 1);
    } else {
      processWizard();
    }
  };

  const processWizard = async () => {
    setIsWizardProcessing(true);
    try {
      const suggestion = await generateGoalPrompt(wizardAnswers);
      setSuggestedGoal(suggestion);
    } catch (e) {
      alert("지침 생성 중 오류가 발생했습니다.");
    } finally {
      setIsWizardProcessing(false);
    }
  };

  const saveGoalSetting = () => {
    if (suggestedGoal && user) {
      onUpdateUser({
        ...user,
        investmentGoal: suggestedGoal.goal,
        goalPrompt: suggestedGoal.prompt
      });
      setIsGoalWizardOpen(false);
      setSuggestedGoal(null);
      setWizardStep(0);
      setWizardAnswers({ age: '', risk: '', purpose: '', horizon: '', preference: '' });
      alert("투자 목표가 업데이트되었습니다. 이제 새로운 목표로 진단받을 수 있습니다.");
    }
  };

  return (
    <div className="p-5 space-y-8 pb-40 animate-in fade-in duration-500">
      
      {/* 1. Header & Goal Status */}
      <div className="flex flex-col gap-4 px-1">
         <div className="flex items-center justify-between">
           <h2 className="text-xl font-black text-slate-800 tracking-tight">AI 자산관리자</h2>
           <button 
             onClick={() => setIsSavedModalOpen(true)}
             className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-[10px] font-black text-slate-500 hover:text-indigo-600 transition-colors shadow-sm"
           >
             <BookOpen size={12} /> 전략 보관함 ({savedStrategies.length})
           </button>
         </div>

         {/* Current Goal Banner */}
         <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between group">
           <div className="flex items-center gap-3 overflow-hidden">
             <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0"><Target size={18} /></div>
             <div className="overflow-hidden">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Investment Goal</p>
               <h3 className="text-sm font-black text-slate-800 truncate">{user?.investmentGoal || '목표를 설정해주세요'}</h3>
             </div>
           </div>
           <button 
            onClick={() => { setWizardStep(0); setSuggestedGoal(null); setIsGoalWizardOpen(true); }}
            className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:text-indigo-600 hover:bg-indigo-50 transition-all shrink-0"
           >
             <Settings2 size={18} />
           </button>
         </div>
      </div>

      <section className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-indigo-600/20 rounded-full blur-[100px]"></div>
        <div className="relative z-10 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Briefcase className="text-white" size={28} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 mb-1">Elite Wealth Management</p>
              <h2 className="text-2xl font-black tracking-tight leading-tight">PortFlow AI</h2>
            </div>
          </div>
          
          <div className="bg-white/5 border border-white/10 p-5 rounded-3xl backdrop-blur-md">
            <div className="flex gap-4">
              <div className="w-1 h-auto bg-indigo-500 rounded-full"></div>
              <p className="text-sm font-medium text-slate-300 leading-relaxed">
                <span className="text-white font-black underline decoration-indigo-500 underline-offset-4">{user?.investmentGoal || '개인별 목표'}</span>에 맞춰 
                <span className="text-white font-black underline decoration-emerald-500 underline-offset-4 ml-1">스마트 포트폴리오</span>를 제안합니다.
              </p>
            </div>
          </div>

          <button 
            onClick={fetchAnalysis}
            disabled={loading}
            className="w-full bg-white text-slate-900 py-4.5 rounded-[1.5rem] font-black text-sm flex items-center justify-center gap-2.5 hover:bg-indigo-50 transition-all active:scale-95 disabled:opacity-50 shadow-xl"
          >
            {loading ? <Loader2 size={18} className="animate-spin text-indigo-600" /> : <Sparkles size={18} className="text-indigo-600" />}
            {loading ? '맞춤 지침에 따른 진단 중...' : '포트폴리오 정밀 진단 시작'}
          </button>
        </div>
      </section>

      {/* 2. Analysis Content */}
      {loading && (
        <div className="py-24 flex flex-col items-center justify-center text-center space-y-4 animate-pulse">
          <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          <div>
            <p className="text-sm font-black text-slate-800">개인별 맞춤 지침 분석 중</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">계좌별 규정 • 사용자 목표 • 시장 상황 대조 중</p>
          </div>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-700">
          
          {loadedStrategyId && (
             <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-center gap-3 text-amber-700">
               <FolderOpen size={18} />
               <p className="text-xs font-bold">보관함에서 불러온 과거 전략입니다. 현재 시세와 다를 수 있습니다.</p>
             </div>
          )}

          {/* Portfolio Diagnosis */}
          <section className="bg-white p-7 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl shrink-0"><Activity size={20} /></div>
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">보유 자산 현황 및 팩트 진단</h4>
            </div>
            <div className="prose prose-slate prose-sm max-w-none text-slate-600 leading-relaxed prose-p:mb-2">
              <ReactMarkdown>{data.currentDiagnosis}</ReactMarkdown>
            </div>
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100">
               <Globe size={14} className="text-slate-400" />
               <p className="text-[11px] font-bold text-slate-500">{data.marketConditions}</p>
            </div>
          </section>

          {/* Optimized Strategy */}
          <section className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-indigo-600" />
                <h3 className="font-black text-slate-800 text-lg">AI 권고 마스터 전략</h3>
              </div>
              <button 
                onClick={handleSaveCurrentStrategy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black hover:bg-indigo-100 transition-colors"
              >
                <Bookmark size={12} /> 전략 저장
              </button>
            </div>
            
            <div className="p-7 rounded-[2.5rem] border-2 border-indigo-600 bg-indigo-50/10 shadow-xl shadow-indigo-100/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-black px-4 py-2 rounded-bl-2xl">OPTIMIZED</div>
              
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${data.bestStrategy.riskLevel === 'HIGH' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {data.bestStrategy.riskLevel === 'HIGH' ? <TrendingUp size={24} /> : <Scale size={24} />}
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 text-lg">{data.bestStrategy.name}</h4>
                    <p className="text-[11px] font-bold text-slate-400">{data.bestStrategy.targetSectorAllocation}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400">연 예상 기대 수익</p>
                  <p className="text-2xl font-black text-rose-500">+{data.bestStrategy.predictedReturnRate}%</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-white/60 p-4 rounded-2xl border border-white shadow-sm">
                  <p className="text-xs font-medium text-slate-600 leading-relaxed">{data.bestStrategy.description}</p>
                </div>
                <div className="flex items-start gap-3 p-4 bg-indigo-600 text-white rounded-2xl shadow-lg">
                  <Lightbulb size={18} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-black uppercase opacity-60 mb-1">Strategy Rationale</p>
                    <p className="text-xs font-bold leading-relaxed">{data.bestStrategy.rationale}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Action Plan Summary */}
          <section className="bg-white rounded-[3rem] p-8 shadow-2xl border border-indigo-50 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 to-indigo-400"></div>
            <div className="flex items-center gap-2.5 mb-8">
              <Zap size={22} className="text-indigo-600" fill="currentColor" />
              <h4 className="font-black text-slate-800 text-xl tracking-tight">실행 액션 플랜</h4>
            </div>

            <div className="mb-10 bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
              <div className="flex items-center gap-2 mb-5">
                <Banknote size={16} className="text-slate-400" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Self-Funding Summary</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-[10px] font-black text-blue-500 uppercase mb-1">매도 확보 자금</p>
                  <p className="text-base font-black text-slate-800">+{planSummary.sell.toLocaleString()}원</p>
                </div>
                <ArrowRight className="text-slate-200" />
                <div className="flex-1 text-right">
                  <p className="text-[10px] font-black text-rose-500 uppercase mb-1">매수 소요 자금</p>
                  <p className="text-base font-black text-slate-800">-{planSummary.buy.toLocaleString()}원</p>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {data.bestStrategy.executionGroups?.map((group, gIdx) => (
                <div key={gIdx} className="border border-slate-100 rounded-[2rem] p-6 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
                        <Wallet size={20} className="text-indigo-600" />
                      </div>
                      <div>
                        <h5 className="font-black text-slate-800 text-sm">{group.accountName || group.institution}</h5>
                        <p className="text-[10px] font-bold text-slate-400">{group.institution}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {group.items?.map((item, i) => (
                      <div 
                        key={i} 
                        onClick={() => handleDeepDiveSearch(item.assetName)}
                        className={`p-4 rounded-[1.5rem] border transition-all bg-white cursor-pointer group/item relative hover:shadow-lg active:scale-95 ${item.action === 'BUY' ? 'border-rose-100 hover:border-rose-300' : item.action === 'SELL' ? 'border-blue-100 hover:border-blue-300' : 'border-slate-100 hover:border-indigo-200'}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-[9px] ${
                              item.action === 'BUY' ? 'bg-rose-500 text-white shadow-sm' : 
                              item.action === 'SELL' ? 'bg-blue-500 text-white shadow-sm' : 'bg-slate-400 text-white'
                            }`}>
                              {item.action === 'BUY' ? '매수' : item.action === 'SELL' ? '매도' : '유지'}
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                {item.assetName}
                                <span className="text-indigo-600 opacity-0 group-hover/item:opacity-100 transition-opacity"><Search size={10} /></span>
                              </p>
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{item.ticker}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-slate-900">{Math.floor(item.totalAmount || 0).toLocaleString()}원</p>
                            <p className="text-[8px] font-bold text-slate-400">{item.quantity.toLocaleString()}주 내외</p>
                          </div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 leading-relaxed pl-11">{item.reason}</p>
                        <div className="absolute right-4 bottom-4 opacity-0 group-hover/item:opacity-100 transition-opacity">
                          <div className="flex items-center gap-1 text-[9px] font-black text-indigo-500 uppercase tracking-widest">
                            Deep Dive <MoveUpRight size={10} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Goal Wizard Modal */}
      {isGoalWizardOpen && (
        <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsGoalWizardOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90dvh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-800">투자 목표 설정 마법사</h3>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-0.5">Custom Persona Wizard</p>
              </div>
              <button onClick={() => setIsGoalWizardOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={20}/></button>
            </div>

            <div className="px-8 pt-4 pb-44 overflow-y-auto no-scrollbar flex-1 pb-safe">
              {!suggestedGoal ? (
                <div className="space-y-8">
                  {/* Step Progress */}
                  <div className="flex gap-2">
                    {wizardQuestions.map((_, i) => (
                      <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= wizardStep ? 'bg-indigo-600' : 'bg-slate-100'}`}></div>
                    ))}
                  </div>

                  <div className="space-y-6">
                    <h4 className="text-lg font-black text-slate-800">{wizardQuestions[wizardStep].label}</h4>
                    
                    {wizardQuestions[wizardStep].options ? (
                      <div className="grid grid-cols-1 gap-3">
                        {wizardQuestions[wizardStep].options.map(opt => (
                          <button
                            key={opt}
                            onClick={() => {
                              setWizardAnswers(prev => ({ ...prev, [wizardQuestions[wizardStep].key]: opt }));
                            }}
                            className={`p-5 rounded-2xl border text-left text-sm font-bold transition-all ${
                              wizardAnswers[wizardQuestions[wizardStep].key as keyof typeof wizardAnswers] === opt
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg'
                                : 'bg-slate-50 text-slate-600 border-slate-100 hover:border-slate-200'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <textarea
                        className="w-full p-5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-indigo-600 focus:bg-white transition-all min-h-[120px]"
                        placeholder={wizardQuestions[wizardStep].placeholder}
                        value={wizardAnswers.preference}
                        onChange={e => setWizardAnswers(prev => ({ ...prev, preference: e.target.value }))}
                      />
                    )}
                  </div>

                  <div className="pt-4">
                    <button
                      onClick={handleWizardNext}
                      disabled={isWizardProcessing || (!wizardAnswers[wizardQuestions[wizardStep].key as keyof typeof wizardAnswers] && wizardStep < wizardQuestions.length - 1)}
                      className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl active:scale-95 disabled:opacity-30 transition-all flex items-center justify-center gap-2"
                    >
                      {isWizardProcessing ? <Loader2 size={18} className="animate-spin" /> : null}
                      {wizardStep === wizardQuestions.length - 1 ? '지침 생성하기' : '다음 단계로'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-8 animate-in zoom-in-95">
                  <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-[2rem] text-center">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-indigo-50 text-indigo-600">
                      <Target size={32} />
                    </div>
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Generated Goal</p>
                    <h4 className="text-xl font-black text-indigo-900">{suggestedGoal.goal}</h4>
                  </div>

                  <div className="space-y-4">
                    <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">AI 지침 프리뷰</h5>
                    <div className="p-6 bg-slate-900 text-slate-300 rounded-[2rem] text-sm font-medium leading-relaxed italic">
                      "{suggestedGoal.prompt}"
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setSuggestedGoal(null)}
                      className="flex-1 py-5 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm"
                    >
                      재시도
                    </button>
                    <button
                      onClick={saveGoalSetting}
                      className="flex-[2] py-5 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl flex items-center justify-center gap-2"
                    >
                      <Check size={18} /> 목표로 설정
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Deep Dive Research */}
      <section ref={researchSectionRef} className="space-y-6 pt-12 border-t border-slate-100">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <Search size={22} className="text-indigo-600" />
            <h4 className="font-black text-slate-800 text-lg">인텔리전스 종목 리서치</h4>
          </div>
          <div className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-md text-[9px] font-black uppercase tracking-widest">Powered by Gemini 3</div>
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); handleDeepDiveSearch(); }} className="relative group">
          <div className="absolute inset-0 bg-indigo-500/10 rounded-[2rem] blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
          <input 
            type="text"
            value={stockQuery}
            onChange={(e) => setStockQuery(e.target.value)}
            placeholder="심층 분석할 종목명을 입력하세요 (예: 엔비디아, TQQQ...)"
            className="w-full pl-6 pr-36 py-6 bg-white border-2 border-slate-100 rounded-[2.2rem] shadow-sm text-sm font-bold focus:ring-0 focus:border-indigo-600 outline-none transition-all placeholder:text-slate-300 relative z-10"
          />
          <button 
            type="submit"
            disabled={searchLoading || !stockQuery.trim()}
            className="absolute right-3 top-3 bottom-3 bg-indigo-600 text-white px-7 rounded-[1.8rem] text-[11px] font-black flex items-center gap-2 hover:bg-indigo-700 disabled:bg-slate-200 transition-all shadow-lg shadow-indigo-100 active:scale-95 z-20"
          >
            {searchLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            분석 요청
          </button>
        </form>

        {searchLoading && (
          <div className="py-20 text-center space-y-5 animate-in fade-in duration-500">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
              <Search size={24} className="absolute inset-0 m-auto text-indigo-600 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800">시장 및 종목 리포트 생성 중</p>
              <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">Searching Global Financial Data...</p>
            </div>
          </div>
        )}

        {stockDeepDive && !searchLoading && (
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl mt-8 animate-in slide-in-from-bottom-8 duration-700 relative overflow-hidden group/report">
            {/* Report Header Accent */}
            <div className="h-2 w-full bg-indigo-600"></div>
            
            <div className="p-8 space-y-8 relative z-10">
              <div className="flex items-center justify-between border-b border-slate-100 pb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-black uppercase tracking-widest border border-indigo-100">Confidential Analyst View</span>
                  </div>
                  <h5 className="text-3xl font-black text-slate-900 tracking-tight leading-none uppercase">{stockQuery} 분석 리포트</h5>
                  <div className="flex items-center gap-2 mt-3 text-slate-400">
                    <Clock3 size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{new Date().toLocaleString()} 발행</span>
                  </div>
                </div>
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-indigo-600 border border-slate-200 shadow-sm">
                  <BarChart size={28} />
                </div>
              </div>

              {/* Main Report Body */}
              <div className="relative">
                <Quote className="absolute -top-4 -left-4 text-indigo-50/50 w-16 h-16 -z-10" />
                <div className="prose prose-slate prose-sm max-w-none 
                  prose-p:text-slate-700 prose-p:leading-relaxed prose-p:text-[15px] prose-p:mb-5
                  prose-strong:text-indigo-600 prose-strong:font-black
                  prose-headings:text-slate-900 prose-headings:font-black prose-headings:mb-4 prose-headings:mt-10
                  prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
                  prose-li:text-slate-700 prose-li:my-2 prose-li:text-[14px]
                  prose-ul:my-6 prose-ul:list-disc prose-ul:pl-5
                  prose-ol:my-6 prose-ol:list-decimal prose-ol:pl-5
                  prose-blockquote:border-l-4 prose-blockquote:border-indigo-100 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-slate-500">
                  <ReactMarkdown>{stockDeepDive.text}</ReactMarkdown>
                </div>
              </div>

              {stockDeepDive.sources.length > 0 && (
                <div className="pt-6 border-t border-slate-100">
                  <button 
                    onClick={() => setShowSources(!showSources)}
                    className="flex items-center justify-between w-full px-4 py-3 bg-slate-50 rounded-xl hover:bg-indigo-50 transition-colors group/sourcebtn"
                  >
                    <div className="flex items-center gap-2">
                      <Globe size={14} className="text-slate-400 group-hover/sourcebtn:text-indigo-600" />
                      <h6 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.1em] group-hover/sourcebtn:text-indigo-900">
                        참조 데이터 소스 ({stockDeepDive.sources.length})
                      </h6>
                    </div>
                    {showSources ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </button>

                  {showSources && (
                    <div className="flex flex-wrap gap-2 mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                      {stockDeepDive.sources.map((src, i) => (
                        <a 
                          key={i} 
                          href={src.uri} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 transition-all shadow-sm"
                        >
                          <LinkIcon size={12} /> {src.title.length > 30 ? src.title.substring(0, 30) + '...' : src.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              <div className="pt-8 text-center">
                <p className="text-[9px] font-bold text-slate-300 italic">본 리포트는 AI에 의해 생성되었으며 투자 판단의 최종 책임은 본인에게 있습니다.</p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Saved Strategies Modal */}
      {isSavedModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsSavedModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90dvh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-800">전략 보관함</h3>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-0.5">Saved Strategies</p>
              </div>
              <button onClick={() => setIsSavedModalOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:bg-slate-100"><ArrowRight size={20}/></button>
            </div>

            <div className="p-6 overflow-y-auto no-scrollbar pb-44 space-y-4 pb-safe">
              {savedStrategies.length === 0 ? (
                <div className="py-20 text-center opacity-40">
                  <Bookmark size={48} className="mx-auto mb-4 text-slate-400" />
                  <p className="font-bold text-slate-500">저장된 전략이 없습니다.</p>
                </div>
              ) : (
                savedStrategies.map(saved => (
                  <div key={saved.id} className="p-5 bg-white border border-slate-100 rounded-[2rem] shadow-sm relative group hover:border-indigo-100 transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <div className="cursor-pointer flex-1" onClick={() => handleLoadStrategy(saved)}>
                         <div className="flex items-center gap-2 mb-1">
                           <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[9px] font-black uppercase">
                             {saved.strategy.riskLevel} Risk
                           </span>
                           <span className="flex items-center gap-1 text-[10px] font-bold text-slate-300">
                             <Calendar size={10} /> {new Date(saved.createdAt).toLocaleDateString()}
                           </span>
                         </div>
                         <h4 className="font-black text-slate-800 text-sm leading-tight group-hover:text-indigo-600 transition-colors">{saved.strategy.name}</h4>
                      </div>
                      <button 
                        onClick={() => onDeleteStrategy(saved.id)}
                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIAdvisor;
