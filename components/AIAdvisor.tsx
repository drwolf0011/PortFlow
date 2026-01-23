
import React, { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { getAIAnalysis, getStockDeepDive, AnalysisResponse } from '../services/geminiService';
import { Asset, RebalancingStrategy, SavedStrategy } from '../types';
import { 
  Sparkles, ChevronDown, ChevronUp,
  Loader2, Search, ExternalLink, Target, TrendingUp, Info, 
  Link as LinkIcon, Activity, Zap, Globe, Briefcase, 
  BarChart3, Scale, Banknote, ArrowRight, 
  Calculator, Lightbulb, CheckCircle2, ShieldCheck, AlertTriangle, Wallet,
  Bookmark, BookOpen, Trash2, Calendar
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface AIAdvisorProps {
  assets: Asset[];
  onApplyRebalancing: (institution: string) => void;
  exchangeRate: number;
  onSaveStrategy: (strategy: RebalancingStrategy) => void;
  savedStrategies: SavedStrategy[];
  onDeleteStrategy: (id: string) => void;
}

const AIAdvisor: React.FC<AIAdvisorProps> = ({ 
  assets, onApplyRebalancing, exchangeRate, 
  onSaveStrategy, savedStrategies, onDeleteStrategy 
}) => {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [showSources, setShowSources] = useState(false);
  const [stockQuery, setStockQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [stockDeepDive, setStockDeepDive] = useState<{ text: string, sources: { title: string; uri: string }[] } | null>(null);
  const [isSavedModalOpen, setIsSavedModalOpen] = useState(false);

  const fetchAnalysis = async () => {
    if (assets.length === 0) {
      alert("분석할 자산이 없습니다. 먼저 자산을 등록해주세요.");
      return;
    }
    setLoading(true);
    setData(null);
    try {
      const result = await getAIAnalysis(assets, exchangeRate);
      setData(result);
    } catch (err) {
      console.error(err);
      alert("분석 로드 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeepDiveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockQuery.trim() || searchLoading) return;
    setSearchLoading(true);
    try {
      const result = await getStockDeepDive(stockQuery);
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

  // Funding Plan Summary calculation (Aggregate all groups)
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

  return (
    <div className="p-5 space-y-8 pb-32 animate-in fade-in duration-500">
      
      {/* 1. Header & Goal Banner */}
      <div className="flex items-center justify-between px-1">
         <h2 className="text-xl font-black text-slate-800 tracking-tight">AI 자산관리자</h2>
         <button 
           onClick={() => setIsSavedModalOpen(true)}
           className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-[10px] font-black text-slate-500 hover:text-indigo-600 transition-colors shadow-sm"
         >
           <BookOpen size={12} /> 전략 보관함 ({savedStrategies.length})
         </button>
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
                <span className="text-white font-black underline decoration-indigo-500 underline-offset-4">2029년 성장기</span>와 <span className="text-white font-black underline decoration-emerald-500 underline-offset-4">2030년 인컴기</span>를 대비한 최적의 마스터 전략을 도출합니다.
              </p>
            </div>
          </div>

          <button 
            onClick={fetchAnalysis}
            disabled={loading}
            className="w-full bg-white text-slate-900 py-4.5 rounded-[1.5rem] font-black text-sm flex items-center justify-center gap-2.5 hover:bg-indigo-50 transition-all active:scale-95 disabled:opacity-50 shadow-xl"
          >
            {loading ? <Loader2 size={18} className="animate-spin text-indigo-600" /> : <Sparkles size={18} className="text-indigo-600" />}
            {loading ? '자산 특성 및 연금 규정 정밀 진단 중...' : '포트폴리오 정밀 진단 시작'}
          </button>
        </div>
      </section>

      {/* 2. Loading State */}
      {loading && (
        <div className="py-24 flex flex-col items-center justify-center text-center space-y-4 animate-pulse">
          <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          <div>
            <p className="text-sm font-black text-slate-800">보유 자산 데이터를 기반으로 팩트 체크 중</p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">자산별 특성(주식/채권/연금) 분석 • 퇴직연금 운용 규정 검토</p>
          </div>
        </div>
      )}

      {/* 3. Analysis Content */}
      {data && !loading && (
        <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-700">
          
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

          {/* ROI Simulation Chart */}
          <section className="bg-white rounded-[2.5rem] p-7 shadow-sm border border-slate-50">
            <div className="flex items-center gap-2 mb-8">
              <BarChart3 size={18} className="text-indigo-600" />
              <h4 className="font-black text-slate-800 text-sm">전략 실행 시 자산 변동 예측</h4>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[{name: '현재 포트폴리오', val: 100}, {name: 'AI 전략 실행 후', val: 100 + data.bestStrategy.predictedReturnRate}]} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 800, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={[0, 150]} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }} />
                  <Bar dataKey="val" radius={[12, 12, 0, 0]} barSize={60}>
                    <Cell fill="#e2e8f0" />
                    <Cell fill="#4F46E5" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Detailed Action Plan (Grouped by Account) */}
          <section className="bg-white rounded-[3rem] p-8 shadow-2xl border border-indigo-50 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-600 to-indigo-400"></div>
            <div className="flex items-center gap-2.5 mb-8">
              <Zap size={22} className="text-indigo-600" fill="currentColor" />
              <h4 className="font-black text-slate-800 text-xl tracking-tight">실행 액션 플랜</h4>
            </div>

            {/* Self-Funding Summary */}
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
                    {group.isPension && (
                      <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black flex items-center gap-1.5 border border-emerald-200">
                        <ShieldCheck size={12} /> 규정 준수 (IRP/DC)
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    {group.items?.map((item, i) => (
                      <div key={i} className={`p-4 rounded-[1.5rem] border transition-all bg-white ${item.action === 'BUY' ? 'border-rose-100' : item.action === 'SELL' ? 'border-blue-100' : 'border-slate-100'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-[9px] ${
                              item.action === 'BUY' ? 'bg-rose-500 text-white' : 
                              item.action === 'SELL' ? 'bg-blue-500 text-white' : 'bg-slate-400 text-white'
                            }`}>
                              {item.action === 'BUY' ? '매수' : item.action === 'SELL' ? '매도' : '유지'}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-black text-slate-800">{item.assetName}</p>
                                {item.isNew && <span className="text-[8px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-black">NEW</span>}
                              </div>
                              <p className="text-[9px] font-bold text-slate-400">{item.ticker}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-slate-900">{Math.floor(item.totalAmount || 0).toLocaleString()}원</p>
                            <p className="text-[9px] font-black text-slate-400">{item.quantity?.toLocaleString()}주</p>
                          </div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 leading-relaxed pl-11">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={() => alert("실제 매매는 각 증권사/은행 앱에서 진행해주세요. 위 계획은 분석된 가이드라인입니다.")}
              className="w-full mt-10 py-5 bg-slate-900 text-white rounded-2xl font-black text-sm shadow-xl hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <CheckCircle2 size={18} /> 위 계획대로 리밸런싱 실행
            </button>
          </section>

          {/* Analysis Sources */}
          {data.sources && data.sources.length > 0 && (
            <section className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-50">
              <button 
                onClick={() => setShowSources(!showSources)}
                className="flex items-center justify-between w-full text-slate-400 group"
              >
                <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 group-hover:text-indigo-500 transition-colors">
                  <LinkIcon size={12} /> Research Evidence & Sources
                </span>
                {showSources ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showSources && (
                <div className="mt-5 space-y-2.5 animate-in slide-in-from-top-2">
                  {data.sources.map((s, i) => (
                    <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-indigo-50 transition-all border border-slate-100 group">
                      <span className="text-[11px] font-black text-slate-700 group-hover:text-indigo-600 truncate mr-4">{s.title}</span>
                      <ExternalLink size={12} className="text-slate-300 group-hover:text-indigo-400 shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Stock Research Section (Always Visible) */}
      <section className="space-y-5 pt-12 border-t border-slate-100">
        <div className="flex items-center gap-2.5 px-1">
          <Search size={22} className="text-indigo-600" />
          <h4 className="font-black text-slate-800 text-lg">인텔리전스 종목 리서치</h4>
        </div>
        <form onSubmit={handleDeepDiveSearch} className="relative">
          <input 
            type="text"
            value={stockQuery}
            onChange={(e) => setStockQuery(e.target.value)}
            placeholder="분석할 종목명 또는 티커를 입력하세요..."
            className="w-full pl-6 pr-36 py-5.5 bg-white border border-slate-100 rounded-[2rem] shadow-sm text-sm font-bold focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-300"
          />
          <button 
            type="submit"
            disabled={searchLoading || !stockQuery.trim()}
            className="absolute right-3 top-3 bottom-3 bg-indigo-600 text-white px-7 rounded-[1.5rem] text-[11px] font-black flex items-center gap-2 hover:bg-indigo-700 disabled:bg-slate-200 transition-all shadow-lg shadow-indigo-100"
          >
            {searchLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            심층 분석
          </button>
        </form>

        {stockDeepDive && !searchLoading && (
          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white mt-8 animate-in slide-in-from-bottom-6 duration-500 relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 p-8 opacity-5"><Zap size={120} /></div>
            <div className="prose prose-invert prose-sm max-w-none prose-p:text-slate-300 prose-p:leading-loose prose-strong:text-indigo-400 prose-headings:font-black leading-relaxed relative z-10">
              <ReactMarkdown>{stockDeepDive.text}</ReactMarkdown>
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

            <div className="p-6 overflow-y-auto no-scrollbar pb-12 space-y-4">
              {savedStrategies.length === 0 ? (
                <div className="py-20 text-center opacity-40">
                  <Bookmark size={48} className="mx-auto mb-4 text-slate-400" />
                  <p className="font-bold text-slate-500">저장된 전략이 없습니다.</p>
                </div>
              ) : (
                savedStrategies.map(saved => (
                  <div key={saved.id} className="p-5 bg-white border border-slate-100 rounded-[2rem] shadow-sm relative group">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                         <div className="flex items-center gap-2 mb-1">
                           <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md text-[9px] font-black uppercase">
                             {saved.strategy.riskLevel} Risk
                           </span>
                           <span className="flex items-center gap-1 text-[10px] font-bold text-slate-300">
                             <Calendar size={10} /> {new Date(saved.createdAt).toLocaleDateString()}
                           </span>
                         </div>
                         <h4 className="font-black text-slate-800 text-sm leading-tight">{saved.strategy.name}</h4>
                      </div>
                      <button 
                        onClick={() => onDeleteStrategy(saved.id)}
                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    <p className="text-[11px] text-slate-500 font-medium line-clamp-2 mb-4">
                      {saved.strategy.description}
                    </p>

                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                       <span className="text-[10px] font-black text-slate-400">예상 수익률</span>
                       <span className="text-sm font-black text-rose-500">+{saved.strategy.predictedReturnRate}%</span>
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
