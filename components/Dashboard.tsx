
import React, { useMemo, useState } from 'react';
import { Asset, Account, AssetType } from '../types';
import { 
  TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, 
  RefreshCw, Building2, PieChart as PieChartIcon, 
  ChevronRight, Clock, Target, ShieldAlert, Zap, Globe, ListFilter,
  X, Info, CheckCircle2, AlertTriangle, HelpCircle, ShieldCheck, Activity,
  Layers, Coins, ArrowRightLeft, Trophy, AlertCircle,
  TrendingDown, Landmark, Tag
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { 
  Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';

interface DashboardProps {
  assets: Asset[];
  accounts: Account[];
  transactions: any[];
  user: any;
  history: {date: string, value: number}[];
  onRefresh: () => void;
  isUpdating?: boolean;
  lastUpdated?: string;
  exchangeRate: number;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b', '#2dd4bf', '#fb7185'];

const Dashboard: React.FC<DashboardProps> = ({ assets, accounts, user, onRefresh, isUpdating, lastUpdated, history, exchangeRate }) => {
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
  const [compTab, setCompTab] = useState<'TYPE' | 'INST' | 'CURRENCY' | 'TICKER'>('TYPE');

  const stats = useMemo(() => {
    let total = 0, totalCost = 0;
    const typeDist: Record<string, { val: number; cost: number }> = {};
    const instDist: Record<string, { val: number; profit: number; count: number }> = {};
    const currencyDist: Record<string, number> = { KRW: 0, USD: 0 };
    const tickerDist: Record<string, number> = {};
    
    const hiddenAccountIds = new Set(accounts.filter(a => a.isHidden).map(a => a.id));

    const processedAssets = assets.filter(a => !a.accountId || !hiddenAccountIds.has(a.accountId))
      .map(a => {
        const mult = a.currency === 'USD' ? (exchangeRate || 1350) : 1;
        const currentVal = (Number(a.currentPrice) || 0) * (Number(a.quantity) || 0) * mult;
        const defaultPriceKRW = a.purchasePrice * (a.currency === 'USD' ? (exchangeRate || 1350) : 1);
        const costVal = (a.quantity || 0) * (a.purchasePriceKRW || defaultPriceKRW);
        const profit = currentVal - costVal;
        const profitRate = costVal > 0 ? (profit / costVal) * 100 : 0;
        
        return { ...a, currentVal, costVal, profit, profitRate };
      })
      .sort((a, b) => b.currentVal - a.currentVal);

    processedAssets.forEach(a => {
      total += a.currentVal;
      totalCost += a.costVal;
      
      if (!typeDist[a.type]) typeDist[a.type] = { val: 0, cost: 0 };
      typeDist[a.type].val += a.currentVal;
      typeDist[a.type].cost += a.costVal;

      if (!instDist[a.institution]) instDist[a.institution] = { val: 0, profit: 0, count: 0 };
      instDist[a.institution].val += a.currentVal;
      instDist[a.institution].profit += a.profit;
      instDist[a.institution].count += 1;

      currencyDist[a.currency] = (currencyDist[a.currency] || 0) + a.currentVal;

      const tickerKey = a.name || a.ticker || '기타';
      tickerDist[tickerKey] = (tickerDist[tickerKey] || 0) + a.currentVal;
    });

    const profit = total - totalCost;
    const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0;

    // Best / Worst Performance
    const winners = [...processedAssets].filter(a => a.costVal > 0).sort((a, b) => b.profitRate - a.profitRate).slice(0, 3);
    const losers = [...processedAssets].filter(a => a.costVal > 0).sort((a, b) => a.profitRate - b.profitRate).slice(0, 3);

    const topInstEntry = Object.entries(instDist).sort((a, b) => b[1].val - a[1].val)[0];
    const instRiskWeight = total > 0 ? (topInstEntry ? topInstEntry[1].val / total : 0) : 0;
    const stockWeight = total > 0 ? (typeDist[AssetType.STOCK]?.val || 0) / total : 0;
    const currencyRiskWeight = total > 0 ? Math.max(...Object.values(currencyDist)) / total : 1;

    const riskBreakdown = {
      inst: { score: Math.max(0, 100 - instRiskWeight * 100), label: topInstEntry?.[0] || '없음', weight: instRiskWeight },
      asset: { score: Math.max(0, 100 - stockWeight * 100), label: '주식 비중', weight: stockWeight },
      currency: { score: Math.max(0, 100 - (currencyRiskWeight > 0.9 ? 50 : 0)), label: '외환 노출', weight: currencyRiskWeight }
    };

    const overallRisk = instRiskWeight > 0.6 || stockWeight > 0.8 ? 'HIGH' : instRiskWeight > 0.4 || stockWeight > 0.6 ? 'MEDIUM' : 'LOW';

    const divScore = Math.min(100, processedAssets.length * 20);
    const allocScore = Math.max(0, 100 - Math.abs(50 - (stockWeight * 100)) * 2);
    const stabScore = overallRisk === 'HIGH' ? 40 : overallRisk === 'MEDIUM' ? 70 : 100;
    const healthScore = total > 0 ? (divScore * 0.3 + allocScore * 0.4 + stabScore * 0.3) : 0;

    return { 
      total, profit, profitRate, processedAssets, 
      typeDist, instDist, currencyDist, tickerDist, healthScore,
      riskLevel: overallRisk, riskBreakdown, topInstName: topInstEntry?.[0],
      winners, losers
    };
  }, [assets, accounts, exchangeRate]);

  const pieChartData = useMemo(() => {
    if (compTab === 'TYPE') {
      return Object.entries(stats.typeDist).map(([name, data]) => ({ name, value: (data as { val: number }).val })).filter(d => d.value > 0);
    } else if (compTab === 'INST') {
      return Object.entries(stats.instDist).map(([name, data]) => ({ name, value: (data as { val: number }).val })).filter(d => d.value > 0);
    } else if (compTab === 'CURRENCY') {
      return Object.entries(stats.currencyDist).map(([name, value]) => ({ name, value: value as number })).filter(d => d.value > 0);
    } else {
      return Object.entries(stats.tickerDist)
        .map(([name, value]) => ({ name, value: value as number }))
        .filter(d => d.value > 0)
        .sort((a,b) => b.value - a.value)
        .slice(0, 8);
    }
  }, [stats, compTab]);

  return (
    <div className="p-5 space-y-6 pb-40">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-slate-800 tracking-tight">
              안녕하세요, <span className="text-indigo-600">{user?.name || '사용자'}</span>님
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mt-1">
              <Clock size={12} className={isUpdating ? 'animate-pulse text-indigo-500' : ''} /> {isUpdating ? '실시간 현재가 반영 중...' : (lastUpdated || '시세 확인 중...')}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-2 bg-white rounded-2xl shadow-sm flex items-center gap-1.5 border border-slate-50">
              <Globe size={12} className="text-indigo-600" />
              <span className="text-[10px] font-black text-slate-600">USD/KRW: {exchangeRate.toLocaleString()}</span>
            </div>
            <button 
              onClick={onRefresh}
              disabled={isUpdating}
              className={`p-3 bg-white rounded-full shadow-sm text-slate-400 hover:text-indigo-600 transition-all active:scale-95 ${isUpdating ? 'animate-spin text-indigo-600' : ''}`}
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-indigo-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-10"><Wallet size={120} /></div>
          <div className="relative z-10">
            <p className="text-indigo-100 text-[10px] font-black uppercase tracking-widest mb-1 opacity-80">Visible Net Worth</p>
            <h3 className="text-4xl font-black mb-6 tracking-tighter">{stats.total.toLocaleString()}원</h3>
            <div className="flex flex-wrap items-center gap-3">
              <div className={`px-4 py-2 rounded-2xl flex items-center gap-1.5 text-xs font-black ${stats.profit >= 0 ? 'bg-rose-500/20 text-rose-100' : 'bg-blue-500/20 text-blue-100'}`}>
                {stats.profit >= 0 ? <TrendingUp size={14} /> : <ArrowDownRight size={14} />}
                {stats.profitRate.toFixed(1)}% ({Math.floor(stats.profit).toLocaleString()}원)
              </div>
              <div className="bg-white/10 px-4 py-2 rounded-2xl text-xs font-black flex items-center gap-1.5">
                <Coins size={14} /> {stats.currencyDist.USD > 0 ? `해외 ${(stats.currencyDist.USD / stats.total * 100).toFixed(0)}%` : '국내 100%'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Institution Distribution Summary */}
      <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50">
         <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-slate-50 text-slate-500 rounded-xl">
              <Landmark size={18} />
            </div>
            <h4 className="font-black text-slate-800 text-sm">금융기관별 분산 투자 현황</h4>
         </div>
         <div className="grid grid-cols-2 gap-3">
            {Object.entries(stats.instDist).map(([name, data]: [string, any], idx) => (
              <div key={name} className="p-4 bg-slate-50 rounded-2xl border border-slate-100/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black text-slate-400 truncate pr-2">{name}</span>
                  <span className="text-[9px] font-black text-indigo-500 px-1.5 py-0.5 bg-indigo-50 rounded-lg">{data.count}건</span>
                </div>
                <p className="text-sm font-black text-slate-800">{Math.floor(data.val).toLocaleString()}원</p>
                <div className="flex items-center gap-1 mt-1">
                   {data.profit >= 0 ? <TrendingUp size={10} className="text-rose-500" /> : <TrendingDown size={10} className="text-blue-500" />}
                   <span className={`text-[10px] font-bold ${data.profit >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
                    {data.profit >= 0 ? '+' : ''}{(data.profit / (data.val - data.profit) * 100).toFixed(1)}%
                   </span>
                </div>
              </div>
            ))}
         </div>
      </section>

      {/* Portfolio Composition Sections with Multi-Tabs */}
      <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50">
        <div className="flex flex-col gap-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <PieChartIcon size={18} />
              </div>
              <h4 className="font-black text-slate-800 text-sm">포트폴리오 다차원 분석</h4>
            </div>
          </div>
          <div className="flex bg-slate-100 rounded-2xl p-1 shadow-inner overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setCompTab('TYPE')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${compTab === 'TYPE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
            >
              <Layers size={14} /> 자산별
            </button>
            <button 
              onClick={() => setCompTab('INST')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${compTab === 'INST' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
            >
              <Building2 size={14} /> 기관별
            </button>
            <button 
              onClick={() => setCompTab('CURRENCY')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${compTab === 'CURRENCY' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
            >
              <Globe size={14} /> 통화별
            </button>
            <button 
              onClick={() => setCompTab('TICKER')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${compTab === 'TICKER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
            >
              <Tag size={14} /> 종목별
            </button>
          </div>
        </div>

        <div className="h-64 w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieChartData}
                innerRadius={65}
                outerRadius={85}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
                animationDuration={1000}
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#ffffff',
                  borderRadius: '1.2rem', 
                  border: 'none', 
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', 
                  padding: '12px 16px',
                  zIndex: 100
                }}
                itemStyle={{ fontSize: '12px', fontWeight: '900', color: '#1e293b' }}
                formatter={(value: number, name: string) => [`${value.toLocaleString()}원`, name]}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="circle" 
                iconSize={8}
                formatter={(value) => <span className="text-[10px] font-bold text-slate-500 ml-1">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Performance Leaders Section */}
      <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50">
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
            <Trophy size={18} />
          </div>
          <h4 className="font-black text-slate-800 text-sm">수익률 Best & Worst</h4>
        </div>
        
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5"><TrendingUp size={12}/> Top Gainers</p>
            {stats.winners.length > 0 ? stats.winners.map((a, i) => (
              <div key={a.id} className="flex items-center justify-between bg-emerald-50/30 p-3 rounded-2xl border border-emerald-50">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-emerald-600">#{i+1}</span>
                  <div><p className="text-xs font-black text-slate-800">{a.name}</p><p className="text-[9px] font-bold text-slate-400">{a.institution}</p></div>
                </div>
                <p className="text-xs font-black text-emerald-600">+{a.profitRate.toFixed(1)}%</p>
              </div>
            )) : <p className="text-[10px] text-slate-300 italic text-center py-2">성과 데이터가 부족합니다.</p>}
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-1.5"><TrendingDown size={12}/> Needs Review</p>
            {stats.losers.length > 0 ? stats.losers.map((a, i) => (
              <div key={a.id} className="flex items-center justify-between bg-rose-50/30 p-3 rounded-2xl border border-rose-50">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-rose-500">#{i+1}</span>
                  <div><p className="text-xs font-black text-slate-800">{a.name}</p><p className="text-[9px] font-bold text-slate-400">{a.institution}</p></div>
                </div>
                <p className="text-xs font-black text-rose-500">{a.profitRate.toFixed(1)}%</p>
              </div>
            )) : <p className="text-[10px] text-slate-300 italic text-center py-2">성과 데이터가 부족합니다.</p>}
          </div>
        </div>
      </section>

      {/* AI Score and Risk Quick View */}
      <section className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => setIsScoreModalOpen(true)}
          className="bg-white p-5 rounded-[2.5rem] shadow-sm border border-slate-50 flex flex-col text-left active:scale-95 transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors"><Zap size={18} /></div>
            <ChevronRight size={12} className="text-slate-300"/>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Health Score</p>
          <p className="text-xl font-black text-slate-800">{Math.floor(stats.healthScore)}점</p>
          <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden w-full">
            <div className="h-full bg-indigo-500" style={{ width: `${stats.healthScore}%` }}></div>
          </div>
        </button>

        <button 
          onClick={() => setIsRiskModalOpen(true)}
          className={`p-5 rounded-[2.5rem] shadow-sm border flex flex-col text-left active:scale-95 transition-all group ${
            stats.riskLevel === 'HIGH' ? 'bg-rose-50 border-rose-100' : 'bg-white border-slate-50'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2 rounded-xl transition-colors ${
              stats.riskLevel === 'HIGH' ? 'bg-rose-100 text-rose-600 group-hover:bg-rose-600 group-hover:text-white' : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'
            }`}>
              <ShieldAlert size={18} className={stats.riskLevel === 'HIGH' ? 'animate-pulse' : ''} />
            </div>
            <ChevronRight size={12} className="text-slate-300"/>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Risk Status</p>
          <p className={`text-xl font-black ${stats.riskLevel === 'HIGH' ? 'text-rose-600' : 'text-slate-800'}`}>
            {stats.riskLevel === 'HIGH' ? '위험 감지' : stats.riskLevel === 'MEDIUM' ? '주의' : '안정'}
          </p>
          <div className="mt-2 flex gap-1 items-center">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${
                (stats.riskLevel === 'LOW' && i === 1) ? 'bg-emerald-500' :
                (stats.riskLevel === 'MEDIUM' && i <= 2) ? 'bg-amber-500' :
                (stats.riskLevel === 'HIGH') ? 'bg-rose-500' : 'bg-slate-100'
              }`}></div>
            ))}
          </div>
        </button>
      </section>

      {/* TOP 5 List with Link */}
      <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50">
        <div className="flex items-center justify-between mb-6">
          <h4 className="font-black text-slate-800 flex items-center gap-2">
            <ListFilter size={18} className="text-indigo-600" /> 보유 비중 TOP 5
          </h4>
          <Link to="/assets" className="text-[10px] font-black text-indigo-600 flex items-center gap-0.5 hover:underline transition-all">전체보기 <ChevronRight size={10}/></Link>
        </div>
        <div className="space-y-5">
          {stats.processedAssets.slice(0, 5).map(asset => (
            <div key={asset.id} className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center font-black text-[10px] text-slate-400 uppercase group-hover:border-indigo-100 group-hover:bg-indigo-50/30 transition-all">
                  {asset.ticker ? asset.ticker.substring(0, 3) : asset.name[0]}
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800">{asset.name}</p>
                  <p className="text-[9px] font-bold text-slate-400">{asset.institution}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-slate-900">{Math.floor(asset.currentVal).toLocaleString()}원</p>
                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{(asset.currentVal / stats.total * 100).toFixed(1)}%</span>
                  <p className={`text-[10px] font-bold ${asset.profit >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
                    {asset.profit >= 0 ? '+' : ''}{asset.profitRate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Diagnosis Modals (Scores & Risks) */}
      {isScoreModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsScoreModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90dvh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-800">AI 포트폴리오 진단</h3>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-0.5">Score Analysis Report</p>
              </div>
              <button onClick={() => setIsScoreModalOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={20}/></button>
            </div>
            <div className="p-8 overflow-y-auto no-scrollbar pb-12">
              <div className="flex flex-col items-center justify-center py-6 bg-indigo-50/30 rounded-[2.5rem] border border-indigo-50 mb-8">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="w-full h-full rotate-[-90deg]">
                    <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-100" />
                    <circle 
                      cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" 
                      strokeDasharray={364.4} 
                      strokeDashoffset={364.4 - (364.4 * stats.healthScore / 100)} 
                      strokeLinecap="round"
                      className="text-indigo-600" 
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-black text-slate-800">{Math.floor(stats.healthScore)}</span>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-slate-900 rounded-[2rem] text-white">
                <h5 className="text-xs font-black text-indigo-400 mb-2 uppercase tracking-widest flex items-center gap-1.5"><ShieldCheck size={14}/> Advisor Opinion</h5>
                <p className="text-xs font-medium text-slate-300 leading-relaxed">
                  {stats.healthScore >= 80 ? "포트폴리오 배분 상태가 우수합니다. 현재의 리밸런싱 주기를 유지하는 것을 추천합니다." : "특정 자산이나 기관에 대한 집중도가 높습니다. 분산 투자를 통해 안정성을 높일 필요가 있습니다."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isRiskModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsRiskModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90dvh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-2xl font-black text-slate-800">리스크 상세 리포트</h3>
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mt-0.5">Vulnerability Breakdown</p>
              </div>
              <button onClick={() => setIsRiskModalOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={20}/></button>
            </div>

            <div className="p-8 space-y-8 overflow-y-auto no-scrollbar pb-12">
              <div className={`p-8 rounded-[2.5rem] flex flex-col items-center justify-center text-center ${
                stats.riskLevel === 'HIGH' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
              }`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                  stats.riskLevel === 'HIGH' ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' : 'bg-emerald-500 text-white'
                }`}>
                  {stats.riskLevel === 'HIGH' ? <ShieldAlert size={32} /> : <ShieldCheck size={32} />}
                </div>
                <h4 className="text-xl font-black mb-1">{stats.riskLevel === 'HIGH' ? '고위험 노출' : '운용 안전'}</h4>
                <p className="text-[10px] font-black uppercase opacity-60">Security Integrity Status</p>
              </div>

              <div className="space-y-6">
                <RiskFactorBar 
                  label="금융사 집중도" 
                  weight={stats.riskBreakdown.inst.weight} 
                  detail={`${stats.topInstName || '없음'} 비중 ${Math.floor(stats.riskBreakdown.inst.weight * 100)}%`}
                  isHigh={stats.riskBreakdown.inst.weight > 0.5}
                />
                <RiskFactorBar 
                  label="자산 변동성" 
                  weight={stats.riskBreakdown.asset.weight} 
                  detail={`주식형 자산 비중 ${Math.floor(stats.riskBreakdown.asset.weight * 100)}%`}
                  isHigh={stats.riskBreakdown.asset.weight > 0.7}
                />
                <RiskFactorBar 
                  label="통화 노출 리스크" 
                  weight={stats.riskBreakdown.currency.weight} 
                  detail={`단일 통화 집중도 ${Math.floor(stats.riskBreakdown.currency.weight * 100)}%`}
                  isHigh={stats.riskBreakdown.currency.weight > 0.9}
                />
              </div>

              <div className="p-5 bg-slate-50 border border-slate-100 rounded-3xl flex items-start gap-4">
                <div className="p-2 bg-white rounded-xl shadow-sm text-indigo-600"><AlertCircle size={20} /></div>
                <div>
                  <h5 className="text-sm font-black text-slate-800 mb-1">대응 가이드라인</h5>
                  <p className="text-xs font-bold text-slate-400 leading-relaxed italic">
                    {stats.riskLevel === 'HIGH' 
                      ? "특정 영역에 자산이 과도하게 쏠려 있습니다. AI 조언 탭에서 제안하는 리밸런싱 전략을 검토하여 하방 리스크를 제한하십시오."
                      : "전반적으로 안정적인 구조입니다. 현재 비중을 유지하며 정기적인 시세 동기화를 통해 돌발 변수를 체크하세요."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const RiskFactorBar: React.FC<{ label: string; weight: number; detail: string; isHigh: boolean }> = ({ label, weight, detail, isHigh }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${isHigh ? 'bg-rose-500' : 'bg-indigo-600'}`}></div>
        <span className="text-xs font-black text-slate-700">{label}</span>
      </div>
      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${isHigh ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-400'}`}>
        {isHigh ? '주의' : '정상'}
      </span>
    </div>
    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
      <div 
        className={`h-full transition-all duration-1000 ${isHigh ? 'bg-rose-500' : 'bg-indigo-500'}`} 
        style={{ width: `${weight * 100}%` }}
      ></div>
    </div>
    <p className="text-[10px] font-bold text-slate-400 ml-1">{detail}</p>
  </div>
);

export default Dashboard;
