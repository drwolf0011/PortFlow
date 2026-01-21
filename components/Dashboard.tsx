import React, { useMemo, useState } from 'react';
import { Asset, Account, AssetType } from '../types';
import { 
  TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, 
  RefreshCw, Building2, PieChart as PieChartIcon, 
  ChevronRight, Clock, Target, ShieldAlert, Zap, Globe, ListFilter,
  X, Info, CheckCircle2, AlertTriangle, HelpCircle, ShieldCheck, Activity,
  AreaChart as AreaChartIcon, Layers
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
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

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];

const Dashboard: React.FC<DashboardProps> = ({ assets, accounts, user, onRefresh, isUpdating, lastUpdated, history, exchangeRate }) => {
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
  const [chartTab, setChartTab] = useState<'TYPE' | 'INST'>('TYPE');

  const stats = useMemo(() => {
    let total = 0, totalCost = 0;
    const typeDist: Record<string, { val: number; cost: number }> = {};
    const instDist: Record<string, number> = {};
    const currencyDist: Record<string, number> = { KRW: 0, USD: 0 };
    
    const hiddenAccountIds = new Set(accounts.filter(a => a.isHidden).map(a => a.id));

    const processedAssets = assets.filter(a => !a.accountId || !hiddenAccountIds.has(a.accountId))
      .map(a => {
        const mult = a.currency === 'USD' ? exchangeRate : 1;
        const currentVal = (Number(a.currentPrice) || 0) * (Number(a.quantity) || 0) * mult;
        const costVal = (Number(a.purchasePrice) || 0) * (Number(a.quantity) || 0) * mult;
        return { ...a, currentVal, costVal, profit: currentVal - costVal };
      })
      .sort((a, b) => b.currentVal - a.currentVal);

    processedAssets.forEach(a => {
      total += a.currentVal;
      totalCost += a.costVal;
      
      if (!typeDist[a.type]) typeDist[a.type] = { val: 0, cost: 0 };
      typeDist[a.type].val += a.currentVal;
      typeDist[a.type].cost += a.costVal;

      instDist[a.institution] = (instDist[a.institution] || 0) + a.currentVal;
      currencyDist[a.currency] = (currencyDist[a.currency] || 0) + a.currentVal;
    });

    const profit = total - totalCost;
    const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0;

    const topInst = Object.entries(instDist).sort((a, b) => b[1] - a[1])[0];
    const instRiskWeight = total > 0 ? (topInst ? topInst[1] / total : 0) : 0;
    const stockWeight = total > 0 ? (typeDist[AssetType.STOCK]?.val || 0) / total : 0;
    const currencyRiskWeight = total > 0 ? Math.max(...Object.values(currencyDist)) / total : 1;

    const riskBreakdown = {
      inst: { score: Math.max(0, 100 - instRiskWeight * 100), label: topInst?.[0] || '없음', weight: instRiskWeight },
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
      typeDist, instDist, currencyDist, healthScore,
      riskLevel: overallRisk, riskBreakdown, topInstName: topInst?.[0]
    };
  }, [assets, accounts, exchangeRate]);

  const pieChartData = useMemo(() => {
    if (chartTab === 'TYPE') {
      return Object.entries(stats.typeDist).map(([name, data]) => ({ name, value: (data as { val: number }).val })).filter(d => d.value > 0);
    } else {
      return Object.entries(stats.instDist).map(([name, value]) => ({ name, value: value as number })).filter(d => d.value > 0);
    }
  }, [stats, chartTab]);

  const chartData = useMemo(() => {
    if (history.length === 0) return [];
    const weeklyData: { name: string, value: number }[] = [];
    for (let i = history.length - 1; i >= 0; i -= 7) {
      const point = history[i];
      const weekNum = Math.ceil((history.length - i) / 7);
      weeklyData.unshift({
        name: `${weekNum}주 전`,
        value: point.value
      });
      if (weeklyData.length >= 52) break;
    }
    if (weeklyData.length > 0) {
      weeklyData[weeklyData.length - 1].name = "현재";
    }
    return weeklyData;
  }, [history]);

  const dailyChange = useMemo(() => {
    if (history.length < 2) return { val: 0, rate: 0 };
    const latest = history[history.length - 1].value;
    const prev = history[history.length - 2].value;
    const diff = latest - prev;
    const rate = prev > 0 ? (diff / prev) * 100 : 0;
    return { val: diff, rate };
  }, [history]);

  return (
    <div className="p-5 space-y-6 pb-28">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-slate-800 tracking-tight">
              안녕하세요, <span className="text-indigo-600">{user?.name || '사용자'}</span>님
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mt-1">
              <Clock size={12} /> {lastUpdated || '시세 확인 중...'}
            </div>
          </div>
          <button 
            onClick={onRefresh}
            disabled={isUpdating}
            className={`p-3 bg-white rounded-full shadow-sm text-slate-400 hover:text-indigo-600 transition-all active:scale-95 ${isUpdating ? 'animate-spin text-indigo-600' : ''}`}
          >
            <RefreshCw size={18} />
          </button>
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
                <Globe size={14} /> USD {(Number(stats.currencyDist.USD || 0) / (stats.total || 1) * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio Composition Chart Section */}
      <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <PieChartIcon size={18} />
            </div>
            <h4 className="font-black text-slate-800 text-sm">포트폴리오 구성</h4>
          </div>
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button 
              onClick={() => setChartTab('TYPE')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${chartTab === 'TYPE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
            >
              자산별
            </button>
            <button 
              onClick={() => setChartTab('INST')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${chartTab === 'INST' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
            >
              기관별
            </button>
          </div>
        </div>

        <div className="h-64 w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieChartData}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {pieChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '8px 12px' }}
                itemStyle={{ fontSize: '11px', fontWeight: '900', color: '#1e293b' }}
                formatter={(value: number) => [`${value.toLocaleString()}원`, '평가금액']}
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
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -mt-4 text-center pointer-events-none">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</p>
            <p className="text-sm font-black text-slate-800">{stats.total > 100000000 ? `${(stats.total/100000000).toFixed(1)}억` : `${(stats.total/10000).toFixed(0)}만`}</p>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50 overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <AreaChartIcon size={18} />
            </div>
            <div>
              <h4 className="font-black text-slate-800 text-sm">자산 증감 추이</h4>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">52-Week Asset Trend (Weekly)</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-xs font-black flex items-center justify-end gap-1 ${dailyChange.val >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
              {dailyChange.val >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(dailyChange.val).toLocaleString()}원
            </p>
            <p className="text-[9px] font-bold text-slate-300">전일 대비 {dailyChange.rate.toFixed(1)}%</p>
          </div>
        </div>

        <div className="h-40 w-full -ml-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="name" hide />
              <YAxis hide domain={['dataMin - 10000', 'dataMax + 10000']} />
              <Tooltip 
                contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }}
                formatter={(value: number) => [`${value.toLocaleString()}원`, '총 자산']}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="#6366F1" 
                strokeWidth={3} 
                fillOpacity={1} 
                fill="url(#colorVal)" 
                animationDuration={1500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        <div className="mt-4 flex items-center justify-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">52-Week Historical Performance</p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => setIsScoreModalOpen(true)}
          className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-50 flex flex-col text-left active:scale-95 transition-all group"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors"><Zap size={18} /></div>
            <span className="text-[10px] font-black text-slate-300 flex items-center gap-0.5">상세 <ChevronRight size={10}/></span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase">AI Smart Score</p>
          <p className="text-xl font-black text-slate-800">{Math.floor(stats.healthScore)}점</p>
          <div className="mt-2 h-1 bg-slate-100 rounded-full overflow-hidden w-full">
            <div className="h-full bg-indigo-500" style={{ width: `${stats.healthScore}%` }}></div>
          </div>
        </button>

        <button 
          onClick={() => setIsRiskModalOpen(true)}
          className={`p-5 rounded-[2rem] shadow-sm border flex flex-col text-left active:scale-95 transition-all group ${
            stats.riskLevel === 'HIGH' ? 'bg-rose-50 border-rose-100' : 'bg-white border-slate-50'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2 rounded-xl transition-colors ${
              stats.riskLevel === 'HIGH' ? 'bg-rose-100 text-rose-600 group-hover:bg-rose-600 group-hover:text-white' : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white'
            }`}>
              <ShieldAlert size={18} className={stats.riskLevel === 'HIGH' ? 'animate-pulse' : ''} />
            </div>
            <span className="text-[10px] font-black text-slate-300 flex items-center gap-0.5">분석 <ChevronRight size={10}/></span>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase">Risk Level</p>
          <p className={`text-xl font-black ${stats.riskLevel === 'HIGH' ? 'text-rose-600' : 'text-slate-800'}`}>
            {stats.riskLevel === 'HIGH' ? '위험 감지' : stats.riskLevel === 'MEDIUM' ? '주의' : '안전'}
          </p>
          <div className="mt-2 flex gap-1 items-center">
            {[1, 2, 3].map((i) => (
              <div 
                key={i} 
                className={`h-1 flex-1 rounded-full ${
                  (stats.riskLevel === 'LOW' && i === 1) ? 'bg-emerald-500' :
                  (stats.riskLevel === 'MEDIUM' && i <= 2) ? 'bg-amber-500' :
                  (stats.riskLevel === 'HIGH') ? 'bg-rose-500' : 'bg-slate-100'
                }`}
              ></div>
            ))}
          </div>
        </button>
      </section>

      <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50">
        <div className="flex items-center justify-between mb-6">
          <h4 className="font-black text-slate-800 flex items-center gap-2">
            <ListFilter size={18} className="text-indigo-600" /> TOP 5 종목
          </h4>
          <Link to="/assets" className="text-[10px] font-black text-indigo-600">상세보기</Link>
        </div>
        <div className="space-y-4">
          {stats.processedAssets.slice(0, 5).map(asset => (
            <div key={asset.id} className="flex items-center justify-between p-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center font-black text-[10px] text-slate-400 uppercase">
                  {asset.ticker ? asset.ticker.substring(0, 3) : asset.name[0]}
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800">{asset.name}</p>
                  <p className="text-[9px] font-bold text-slate-400">{asset.institution}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-slate-900">{Math.floor(asset.currentVal).toLocaleString()}원</p>
                <p className={`text-[10px] font-bold ${asset.profit >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
                  {asset.profit >= 0 ? '+' : ''}{((asset.profit / (asset.costVal || 1)) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {isScoreModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsScoreModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90dvh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-800">AI 포트폴리오 진단</h3>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-0.5">Smart Score Analysis</p>
              </div>
              <button onClick={() => setIsScoreModalOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={20}/></button>
            </div>
            <div className="p-8 overflow-y-auto no-scrollbar pb-12">
              <div className="flex flex-col items-center justify-center py-6 bg-indigo-50/30 rounded-[2rem] border border-indigo-50 mb-8">
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
                <p className="text-xs font-medium text-slate-300 leading-relaxed">
                  {stats.healthScore >= 80 ? "포트폴리오가 매우 건고합니다." : "관리가 필요한 영역이 있습니다."}
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
                <h3 className="text-2xl font-black text-slate-800">리스크 심층 분석</h3>
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mt-0.5">Security & Risk Report</p>
              </div>
              <button onClick={() => setIsRiskModalOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={20}/></button>
            </div>

            <div className="p-8 space-y-8 overflow-y-auto no-scrollbar pb-12">
              <div className={`p-8 rounded-[2.5rem] flex flex-col items-center justify-center text-center transition-colors ${
                stats.riskLevel === 'HIGH' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
              }`}>
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-sm ${
                  stats.riskLevel === 'HIGH' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
                }`}>
                  {stats.riskLevel === 'HIGH' ? <ShieldAlert size={40} /> : <ShieldCheck size={40} />}
                </div>
                <h4 className="text-2xl font-black mb-1">
                  {stats.riskLevel === 'HIGH' ? '고위험 노출' : stats.riskLevel === 'MEDIUM' ? '위험 보통' : '자산 운용 안전'}
                </h4>
                <p className="text-[10px] font-black uppercase tracking-tighter opacity-60">Portfolio Integrity Status</p>
              </div>

              <div className="space-y-6">
                <RiskFactorBar 
                  label="기관 집중도" 
                  weight={stats.riskBreakdown.inst.weight} 
                  detail={`${stats.topInstName} 비중 ${Math.floor(stats.riskBreakdown.inst.weight * 100)}%`}
                  isHigh={stats.riskBreakdown.inst.weight > 0.5}
                />
                <RiskFactorBar 
                  label="자산 변동성" 
                  weight={stats.riskBreakdown.asset.weight} 
                  detail={`변동 자산(주식 등) 비중 ${Math.floor(stats.riskBreakdown.asset.weight * 100)}%`}
                  isHigh={stats.riskBreakdown.asset.weight > 0.7}
                />
                <RiskFactorBar 
                  label="통화 노출도" 
                  weight={stats.riskBreakdown.currency.weight} 
                  detail={`단일 통화 집중도 ${Math.floor(stats.riskBreakdown.currency.weight * 100)}%`}
                  isHigh={stats.riskBreakdown.currency.weight > 0.9}
                />
              </div>

              <div className="p-6 bg-slate-50 border border-slate-100 rounded-[2rem] flex items-start gap-4">
                <div className="p-2 bg-white rounded-xl shadow-sm"><Info size={20} className="text-indigo-600" /></div>
                <div>
                  <h5 className="text-sm font-black text-slate-800 mb-1">전문가 조언</h5>
                  <p className="text-xs font-bold text-slate-400 leading-relaxed">
                    {stats.riskLevel === 'HIGH' 
                      ? "자산의 50% 이상이 한 기관이나 종목에 집중되어 있습니다. 손실 발생 시 치명적일 수 있으니 분산 투자를 권고합니다."
                      : "전체적으로 안정적인 배분 상태입니다. 다만, 정기적인 시세 업데이트를 통해 예상치 못한 변동성을 체크하세요."}
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
        <Activity size={14} className={isHigh ? 'text-rose-500' : 'text-indigo-600'} />
        <span className="text-xs font-black text-slate-700">{label}</span>
      </div>
      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isHigh ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-400'}`}>
        {isHigh ? '높음' : '안정'}
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