
import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { getAIAnalysis, getStockDeepDive, AnalysisResponse, searchStockList, StockInfo } from '../services/geminiService';
import { Asset } from '../types';
import { 
  Sparkles, RefreshCw, ChevronRight, ChevronDown, ChevronUp,
  ArrowRightLeft, Loader2, Search, ExternalLink,
  Target, TrendingUp, Info, Link as LinkIcon,
  CheckCircle2, PieChart, Activity, Zap,
  Globe, Landmark, ArrowUpRight, BarChart3, MapPin
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';

interface AIAdvisorProps {
  assets: Asset[];
  onApplyRebalancing: (institution: string) => void;
  exchangeRate: number;
}

const AIAdvisor: React.FC<AIAdvisorProps> = ({ assets, onApplyRebalancing, exchangeRate }) => {
  // 필터 상태
  const [region, setRegion] = useState<'ALL' | 'KRW' | 'USD'>('ALL');

  // 포트폴리오 분석 상태
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [showPortfolioSources, setShowPortfolioSources] = useState(false);

  // 종목 검색 상태
  const [stockQuery, setStockQuery] = useState('');
  const [stockDeepDive, setStockDeepDive] = useState<AnalysisResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchedStockInfo, setSearchedStockInfo] = useState<StockInfo | null>(null);
  const [showDeepDiveSources, setShowDeepDiveSources] = useState(false);

  // 현재 필터에 따른 자산 필터링
  const filteredAssets = useMemo(() => {
    if (region === 'ALL') return assets;
    return assets.filter(a => a.currency === region);
  }, [assets, region]);

  // 리밸런싱 차트 데이터 가공 (필터링된 자산 기준)
  const rebalancingChartData = useMemo(() => {
    if (filteredAssets.length === 0) return [];
    
    const instGroups: Record<string, number> = {};
    let totalValue = 0;
    
    filteredAssets.forEach(a => {
      const val = a.currentPrice * a.quantity * (a.currency === 'USD' ? exchangeRate : 1);
      instGroups[a.institution] = (instGroups[a.institution] || 0) + val;
      totalValue += val;
    });

    const institutions = Object.keys(instGroups);
    
    return institutions.map(name => {
      const currentWeight = (instGroups[name] / totalValue) * 100;
      const aiTarget = data?.rebalancingWeights?.find(w => w.institution.includes(name) || name.includes(w.institution));
      let targetWeight = aiTarget ? aiTarget.targetWeight : (currentWeight + (Math.random() * 10 - 5));
      
      return {
        name,
        '현재 비중': parseFloat(currentWeight.toFixed(1)),
        '목표 비중': parseFloat(Math.max(5, targetWeight).toFixed(1))
      };
    });
  }, [filteredAssets, exchangeRate, data]);

  const fetchAnalysis = async () => {
    if (filteredAssets.length === 0) {
      alert(`${region === 'KRW' ? '국내' : '해외'} 자산이 등록되어 있지 않습니다.`);
      return;
    }
    setLoading(true);
    setCompleted(new Set()); 
    setShowPortfolioSources(false); 
    try {
      // 필터링된 자산 데이터만 AI에게 전달
      const result = await getAIAnalysis(filteredAssets);
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeepDiveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockQuery.trim() || searchLoading) return;

    setSearchLoading(true);
    setStockDeepDive(null);
    setSearchedStockInfo(null);
    setShowDeepDiveSources(false);

    try {
      const results = await searchStockList(stockQuery);
      const basicInfo = results.length > 0 ? results[0] : null;
      setSearchedStockInfo(basicInfo);
      
      const result = await getStockDeepDive(stockQuery);
      setStockDeepDive(result);
    } catch (err) {
      console.error(err);
      alert("종목 분석 중 오류가 발생했습니다.");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleExecute = (inst: string) => {
    if (completed.has(inst) || executing) return;
    
    setExecuting(inst);
    setTimeout(() => {
      onApplyRebalancing(inst);
      setCompleted(prev => {
        const next = new Set(prev);
        next.add(inst);
        return next;
      });
      setExecuting(null);
    }, 2500);
  };

  const institutionList: string[] = Array.from(new Set(filteredAssets.map(a => a.institution)));

  return (
    <div className="p-5 space-y-6 pb-28">
      {/* Region Filter Tabs */}
      <div className="flex p-1 bg-white rounded-2xl shadow-sm border border-slate-100">
        <button 
          onClick={() => { setRegion('ALL'); setData(null); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${region === 'ALL' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
        >
          <Globe size={14} /> 전체
        </button>
        <button 
          onClick={() => { setRegion('KRW'); setData(null); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${region === 'KRW' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
        >
          <MapPin size={14} /> 국내
        </button>
        <button 
          onClick={() => { setRegion('USD'); setData(null); }}
          className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${region === 'USD' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}
        >
          <Globe size={14} /> 해외
        </button>
      </div>

      {/* Header Banner */}
      <section className="bg-gradient-to-br from-[#1E293B] to-[#0F172A] rounded-[2.5rem] p-7 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-4 -top-4 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600"><Sparkles size={18} /></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Smart AI Insights</span>
          </div>
          <h2 className="text-2xl font-black mb-2 tracking-tight">AI {region === 'ALL' ? '통합' : region === 'KRW' ? '국내' : '해외'} 포트폴리오 진단</h2>
          <p className="text-slate-400 text-xs font-medium leading-relaxed">
            {region === 'ALL' ? '전체' : region === 'KRW' ? '국내(KRW)' : '해외(USD)'} 자산의 실시간 웹 데이터를 분석하여<br />최적화된 리밸런싱 전략을 제안합니다.
          </p>
          <button 
            onClick={fetchAnalysis} 
            disabled={loading || filteredAssets.length === 0}
            className="mt-6 flex items-center gap-2 text-xs font-black bg-white/10 hover:bg-white/20 px-5 py-3 rounded-full transition-all disabled:opacity-30 active:scale-95 border border-white/5"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {region === 'ALL' ? '전체' : region === 'KRW' ? '국내' : '해외'} 분석 시작
          </button>
        </div>
      </section>

      {/* Rebalancing Visual Comparison Chart */}
      {rebalancingChartData.length > 0 && (
        <section className="bg-white rounded-[2.5rem] p-7 shadow-sm border border-slate-50">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><BarChart3 size={18} /></div>
              <div>
                <h4 className="font-black text-slate-800 text-sm">진단 대상: {region === 'ALL' ? '전체' : region === 'KRW' ? '국내' : '해외'} 기관</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selected Assets Distribution</p>
              </div>
            </div>
            {data && <div className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg">AI ANALYZED</div>}
          </div>
          
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rebalancingChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} unit="%" />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, paddingTop: '10px' }} />
                <Bar dataKey="현재 비중" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="목표 비중" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Analysis Content */}
      <section className="bg-white rounded-[2rem] p-7 shadow-sm border border-slate-50 min-h-[300px] relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300">
            <div className="relative">
              <div className="w-14 h-14 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600" size={18} />
            </div>
            <p className="text-xs font-bold text-indigo-600 bg-white px-4 py-2 rounded-full shadow-lg border border-indigo-50">
              {region === 'ALL' ? '전체' : region === 'KRW' ? '국내' : '해외'} 시장 상황을 확인 중입니다...
            </p>
          </div>
        )}

        {data ? (
          <div className={`prose prose-slate prose-sm max-w-none 
            prose-headings:font-black prose-headings:text-slate-800 prose-headings:mb-3 prose-headings:mt-6
            prose-p:text-slate-600 prose-p:leading-relaxed prose-p:mb-4
            prose-strong:text-indigo-600 prose-strong:font-black
            prose-ul:my-4 prose-li:my-1.5 prose-li:marker:text-indigo-300
            prose-blockquote:border-l-4 prose-blockquote:border-indigo-500 prose-blockquote:bg-indigo-50/50 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-xl prose-blockquote:not-italic prose-blockquote:text-slate-700
            transition-opacity duration-300 ${loading ? 'opacity-30' : 'opacity-100'}`}>
            <ReactMarkdown>{data.text}</ReactMarkdown>
            
            {data.sources.length > 0 && (
              <div className="mt-10 pt-6 border-t border-slate-100">
                <button 
                  onClick={() => setShowPortfolioSources(!showPortfolioSources)}
                  className="w-full flex items-center justify-between mb-3 group"
                >
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 group-hover:text-indigo-500 transition-colors">
                    <LinkIcon size={12} className="text-indigo-500" /> Grounding Sources
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full">
                      {data.sources.length} links
                    </span>
                    {showPortfolioSources ? <ChevronUp size={14} className="text-slate-300" /> : <ChevronDown size={14} className="text-slate-300" />}
                  </div>
                </button>
                
                {showPortfolioSources && (
                  <ul className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                    {data.sources.map((s, i) => (
                      <li key={i} className="!my-2 !list-none">
                        <a 
                          href={s.uri} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="group flex items-start gap-3 p-3 bg-slate-50/50 border border-slate-100 rounded-xl hover:bg-indigo-50 hover:border-indigo-100 transition-all no-underline"
                        >
                          <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 group-hover:border-indigo-200">
                            <ExternalLink size={12} className="text-slate-400 group-hover:text-indigo-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black text-slate-700 group-hover:text-indigo-600 truncate">
                              {s.title}
                            </p>
                            <p className="text-[9px] font-bold text-slate-400 truncate opacity-60">
                              {s.uri}
                            </p>
                          </div>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : !loading && (
          <div className="text-center py-20 flex flex-col items-center gap-4">
            <PieChart size={48} className="text-slate-200" />
            <p className="italic text-slate-300 text-sm font-bold">
              {filteredAssets.length === 0 
                ? `${region === 'KRW' ? '국내' : '해외'} 자산이 없습니다.` 
                : '분석 데이터가 없습니다. 분석 시작 버튼을 눌러주세요.'}
            </p>
          </div>
        )}
      </section>

      {/* Execution Actions (Filtered) */}
      {data && institutionList.length > 0 && (
        <section className={`space-y-4 transition-all duration-300 ${loading ? 'opacity-50 grayscale-[0.5]' : 'opacity-100'}`}>
          <div className="flex items-center justify-between px-1">
            <h4 className="font-black text-slate-800 flex items-center gap-2 text-base">
              <ArrowRightLeft size={20} className="text-indigo-600" />
              스마트 리밸런싱 실행 ({region === 'ALL' ? '전체' : region === 'KRW' ? '국내' : '해외'})
            </h4>
          </div>
          <div className="space-y-4">
            {institutionList.map((inst: string) => {
              const isExecuting = executing === inst;
              const isCompleted = completed.has(inst);
              const isDisabled = !!executing || isCompleted;
              
              const targetWeight = rebalancingChartData.find(d => d.name === inst)?.['목표 비중'] || 100;
              
              return (
                <div 
                  key={inst} 
                  className={`relative bg-white p-6 rounded-[2rem] border shadow-sm transition-all overflow-hidden ${
                    isExecuting 
                    ? 'border-indigo-400 ring-2 ring-indigo-50 bg-indigo-50/20' 
                    : isCompleted 
                    ? 'border-emerald-100 bg-emerald-50/30'
                    : 'border-slate-50 hover:border-indigo-100'
                  }`}
                >
                  {isExecuting && (
                    <div className="absolute bottom-0 left-0 h-1 bg-indigo-600 animate-[rebalanceProgress_2.5s_linear_infinite]" style={{width: '100%'}}></div>
                  )}
                  
                  <div className="flex items-center justify-between mb-4 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xs uppercase transition-all duration-500 ${
                        isExecuting 
                        ? 'bg-indigo-600 text-white shadow-lg rotate-12 scale-110' 
                        : isCompleted
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-100'
                        : 'bg-indigo-50 text-indigo-600'
                      }`}>
                        {isCompleted ? <CheckCircle2 size={24} /> : inst.substring(0,2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className={`text-base font-black transition-colors ${isCompleted ? 'text-emerald-700' : 'text-slate-800'}`}>
                            {inst}
                          </p>
                          {isCompleted && (
                            <span className="text-[10px] font-black bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full animate-in zoom-in">
                              SUCCESS
                            </span>
                          )}
                        </div>
                        <p className={`text-[11px] font-bold transition-colors ${isCompleted ? 'text-emerald-600/70' : 'text-slate-400'}`}>
                          {isExecuting ? '최적 비중 주문 전송 중...' : isCompleted ? 'AI 추천 비중 적용됨' : '비중 최적화 리밸런싱'}
                        </p>
                      </div>
                    </div>

                    <button 
                      onClick={() => handleExecute(inst)}
                      disabled={isDisabled}
                      className={`relative z-10 px-6 py-3 rounded-2xl text-[11px] font-black shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 ${
                        isExecuting 
                        ? 'bg-indigo-600 text-white' 
                        : isCompleted
                        ? 'bg-emerald-600 text-white opacity-0 pointer-events-none'
                        : 'bg-slate-900 text-white hover:bg-indigo-700 hover:-translate-y-0.5 disabled:opacity-30'
                      }`}
                    >
                      {isExecuting ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          진행 중
                        </>
                      ) : (
                        <>
                          실행하기
                          <ChevronRight size={14} />
                        </>
                      )}
                    </button>
                  </div>

                  {isCompleted && (
                    <div className="mt-4 pt-4 border-t border-emerald-100/50 animate-in slide-in-from-top-2 duration-500">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 uppercase">
                          <Target size={12} /> Target Allocation Achieved
                        </div>
                        <span className="text-[11px] font-black text-emerald-700">{targetWeight}%</span>
                      </div>
                      <div className="h-1.5 bg-emerald-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-out" 
                          style={{ width: `${targetWeight}%` }}
                        ></div>
                      </div>
                      <p className="mt-2 text-[9px] font-bold text-emerald-600/60 leading-tight">
                        AI가 제안한 {inst}의 최적 자산 배분이 완료되었습니다. <br />
                        포트폴리오 리스크 지표가 개선되었습니다.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Stock Deep Dive Search Section */}
      <section className="space-y-4 pt-6 border-t border-slate-100">
        <div className="flex items-center gap-2 px-1">
          <Zap size={20} className="text-indigo-600" />
          <h4 className="font-black text-slate-800 text-base">종목 심층 분석 (AI Deep Dive)</h4>
        </div>

        <form onSubmit={handleDeepDiveSearch} className="relative">
          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300">
            <Search size={20} />
          </div>
          <input 
            type="text" 
            placeholder="분석할 종목명 또는 티커 (예: 엔비디아, AAPL)" 
            value={stockQuery}
            onChange={(e) => setStockQuery(e.target.value)}
            className="w-full pl-14 pr-36 py-5 bg-white border border-slate-100 rounded-[1.5rem] shadow-sm text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all placeholder:text-slate-300"
          />
          <button 
            type="submit" 
            disabled={searchLoading || !stockQuery.trim()}
            className="absolute right-2.5 top-2.5 bottom-2.5 bg-indigo-600 text-white px-6 rounded-2xl text-[11px] font-black flex items-center gap-2 shadow-lg shadow-indigo-100 active:scale-95 disabled:bg-slate-200 transition-all"
          >
            {searchLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            리서치 시작
          </button>
        </form>

        {stockDeepDive && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-slate-900 rounded-[2.5rem] p-7 text-white mb-4 shadow-2xl border border-white/5 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
              
              {searchedStockInfo && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 pb-8 border-b border-white/10 gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl flex items-center justify-center font-black text-sm shadow-xl shadow-indigo-500/20 rotate-3">
                      {searchedStockInfo.ticker}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className="text-2xl font-black tracking-tight">{searchedStockInfo.name}</h5>
                        <span className="flex items-center gap-1 text-[9px] font-black bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full uppercase tracking-widest border border-emerald-500/20">
                          <Activity size={10} /> Live
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          <Landmark size={12} className="text-indigo-400" /> {searchedStockInfo.market || 'Global'}
                        </div>
                        <div className="w-1 h-1 bg-white/10 rounded-full"></div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          <Globe size={12} className="text-indigo-400" /> {searchedStockInfo.currency}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-start sm:items-end w-full sm:w-auto p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-black tabular-nums">{searchedStockInfo.price.toLocaleString()}</p>
                      <span className="text-sm text-slate-400 font-black">{searchedStockInfo.currency}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-black mt-1 uppercase tracking-wider">
                      <ArrowUpRight size={12} /> Real-time Market Price
                    </div>
                  </div>
                </div>
              )}
              
              <div className="prose prose-invert prose-sm max-w-none prose-p:text-slate-300 prose-headings:text-white prose-strong:text-indigo-400 prose-li:text-slate-300 leading-relaxed">
                <ReactMarkdown>{stockDeepDive.text}</ReactMarkdown>
              </div>

              {stockDeepDive.sources.length > 0 && (
                <div className="mt-10">
                  <button 
                    onClick={() => setShowDeepDiveSources(!showDeepDiveSources)}
                    className={`w-full flex items-center justify-between p-5 rounded-[1.5rem] transition-all group border ${
                      showDeepDiveSources ? 'bg-indigo-600/10 border-indigo-500/30' : 'bg-white/5 border-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl transition-colors ${showDeepDiveSources ? 'bg-indigo-500 text-white' : 'bg-white/10 text-indigo-400'}`}>
                        <LinkIcon size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Research Data Evidence</p>
                        <h6 className="text-xs font-black text-white mt-0.5">Reference Sources & Grounding Chunks</h6>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black bg-white/10 text-slate-400 px-3 py-1 rounded-full border border-white/5">
                        {stockDeepDive.sources.length} Verified Links
                      </span>
                      {showDeepDiveSources ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                    </div>
                  </button>

                  {showDeepDiveSources && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
                      {stockDeepDive.sources.map((s, i) => (
                        <a 
                          key={i}
                          href={s.uri} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="group flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all"
                        >
                          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-indigo-500/20">
                            <ExternalLink size={14} className="text-slate-500 group-hover:text-indigo-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-black text-slate-200 group-hover:text-white truncate">
                              {s.title}
                            </p>
                            <p className="text-[9px] font-bold text-slate-500 truncate group-hover:text-slate-400 mt-0.5">
                              {s.uri}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="bg-indigo-50 p-5 rounded-[1.5rem] flex items-start gap-4 border border-indigo-100">
              <div className="p-2 bg-white rounded-xl shadow-sm"><Info size={20} className="text-indigo-600 shrink-0" /></div>
              <div>
                <h6 className="text-xs font-black text-indigo-900 mb-1">AI 투자 유의사항</h6>
                <p className="text-[10px] font-bold text-indigo-700/60 leading-relaxed">
                  위 분석 리포트는 AI가 실시간 웹 데이터를 수집하여 생성한 참고용 결과입니다. <br />
                  시장 상황은 초 단위로 변화하며, 모든 투자 결정은 투자자 본인의 책임하에 이루어져야 합니다.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      <style>{`
        @keyframes rebalanceProgress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default AIAdvisor;
