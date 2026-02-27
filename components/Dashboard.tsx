
import React, { useMemo, useState, useEffect } from 'react';
import { Asset, Account, AssetType, AccountType } from '../types';
import { 
  TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, 
  RefreshCw, Building2, PieChart as PieChartIcon, 
  ChevronRight, Clock, Target, ShieldAlert, Zap, Globe, ListFilter,
  X, Info, CheckCircle2, AlertTriangle, HelpCircle, ShieldCheck, Activity,
  Layers, Coins, ArrowRightLeft, Trophy, AlertCircle,
  TrendingDown, Landmark, Tag, Check, Award, BarChart4, MoveRight, Sparkles, Newspaper,
  Scale, PlayCircle
} from 'lucide-react';
import * as ReactRouterDOM from 'react-router-dom';
const { Link } = ReactRouterDOM;
import { 
  Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { getInstitutionColor } from './AssetList';
import { triggerHaptic } from '../utils/mobile';
import { getMarketBriefing } from '../services/geminiService';

interface DashboardProps {
  assets: Asset[];
  accounts: Account[];
  transactions: any[];
  user: any;
  history: {date: string, value: number}[];
  onRefresh: () => void;
  isUpdating?: boolean;
  updateStatus?: { api: string, current: number, total: number } | null;
  lastUpdated?: string;
  exchangeRate: number;
  marketBriefing?: { content: string, timestamp: number };
  onUpdateBriefing: (briefing: { content: string, timestamp: number }) => void;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b', '#2dd4bf', '#fb7185'];

const Dashboard: React.FC<DashboardProps> = ({ assets, accounts, user, onRefresh, isUpdating, updateStatus, lastUpdated, history, exchangeRate, marketBriefing, onUpdateBriefing }) => {
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [isRiskModalOpen, setIsRiskModalOpen] = useState(false);
  const [compTab, setCompTab] = useState<'TYPE' | 'INST' | 'CURRENCY' | 'TICKER' | 'ACCOUNT_TYPE'>('TYPE');
  const [isBriefingLoading, setIsBriefingLoading] = useState(false);

  const handleFetchBriefing = async () => {
    if (isBriefingLoading) return;
    setIsBriefingLoading(true);
    triggerHaptic('medium');
    try {
      const text = await getMarketBriefing();
      onUpdateBriefing({ content: text, timestamp: Date.now() });
    } catch (e) {
      // Error handling is done inside getMarketBriefing or just keep old state
    } finally {
      setIsBriefingLoading(false);
    }
  };

  const stats = useMemo(() => {
    let total = 0, totalCost = 0;
    const typeDist: Record<string, { val: number; cost: number }> = {};
    const instDist: Record<string, { val: number; profit: number; count: number }> = {};
    const currencyDist: Record<string, number> = { KRW: 0, USD: 0 };
    const tickerDist: Record<string, number> = {};
    const accountTypeDist: Record<string, number> = {};
    
    const hiddenAccountIds = new Set(accounts.filter(a => a.isHidden).map(a => a.id));
    const accountLookup = new Map<string, Account>(accounts.map(acc => [acc.id, acc]));

    const normalizeType = (t: string) => {
      const upper = t.toUpperCase().trim();
      if (['STOCK', '주식', 'EQUITY'].includes(upper)) return AssetType.STOCK;
      if (['BOND', '채권'].includes(upper)) return AssetType.BOND;
      if (['FUND', '펀드'].includes(upper)) return AssetType.FUND;
      if (['ETF'].includes(upper)) return AssetType.ETF;
      if (['GOLD', '금'].includes(upper)) return AssetType.GOLD;
      if (['CASH', '현금'].includes(upper)) return AssetType.CASH;
      return t;
    };

    const processedAssets = assets.filter(a => !a.accountId || !hiddenAccountIds.has(a.accountId))
      .map(a => {
        const mult = a.currency === 'USD' ? (exchangeRate || 1350) : 1;
        const currentVal = (Number(a.currentPrice) || 0) * (Number(a.quantity) || 0) * mult;
        const defaultPriceKRW = (a.purchasePrice || 0) * (a.currency === 'USD' ? (exchangeRate || 1350) : 1);
        const costVal = (a.quantity || 0) * (a.purchasePriceKRW || defaultPriceKRW);
        const profit = currentVal - costVal;
        const profitRate = costVal > 0 ? (profit / costVal) * 100 : 0;
        
        return { ...a, currentVal, costVal, profit, profitRate };
      })
      .sort((a, b) => b.currentVal - a.currentVal);

    processedAssets.forEach(a => {
      total += a.currentVal;
      totalCost += a.costVal;
      
      const rawType = a.type ? String(a.type) : '기타 자산';
      const typeKey = normalizeType(rawType);
      
      if (!typeDist[typeKey]) typeDist[typeKey] = { val: 0, cost: 0 };
      typeDist[typeKey].val += a.currentVal;
      typeDist[typeKey].cost += a.costVal;

      const instKey = a.institution || '기타 기관';
      if (!instDist[instKey]) instDist[instKey] = { val: 0, profit: 0, count: 0 };
      instDist[instKey].val += a.currentVal;
      instDist[instKey].profit += a.profit;
      instDist[instKey].count += 1;

      const currKey = a.currency || 'KRW';
      currencyDist[currKey] = (currencyDist[currKey] || 0) + a.currentVal;

      const tickerKey = a.name || a.ticker || '기타';
      tickerDist[tickerKey] = (tickerDist[tickerKey] || 0) + a.currentVal;

      const linkedAccount = a.accountId ? accountLookup.get(a.accountId) : null;
      let accTypeLabel = '미지정 계좌';
      if (linkedAccount) {
        accTypeLabel = linkedAccount.type || '기타 계좌';
      }
      accountTypeDist[accTypeLabel] = (accountTypeDist[accTypeLabel] || 0) + a.currentVal;
    });

    const profit = total - totalCost;
    const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0;

    const winners = [...processedAssets].filter(a => a.costVal > 0).sort((a, b) => b.profitRate - a.profitRate).slice(0, 3);
    const losers = [...processedAssets].filter(a => a.costVal > 0).sort((a, b) => a.profitRate - b.profitRate).slice(0, 3);

    const instEntries = Object.entries(instDist) as [string, { val: number; profit: number; count: number }][];
    const topInstEntry = instEntries.sort((a, b) => b[1].val - a[1].val)[0];
    const instRiskWeight = total > 0 ? (topInstEntry ? (topInstEntry[1] as any).val / total : 0) : 0;
    
    const stockTypeKey = AssetType.STOCK;
    const stockWeight = total > 0 ? ((typeDist[stockTypeKey] as any)?.val || 0) / total : 0;
    const currencyRiskWeight = total > 0 ? Math.max(...Object.values(currencyDist)) / total : 1;

    const divScore = Math.min(100, processedAssets.length * 20);
    const allocScore = Math.max(0, 100 - Math.abs(50 - (stockWeight * 100)) * 2);
    
    const overallRisk = instRiskWeight > 0.6 || stockWeight > 0.8 ? 'HIGH' : instRiskWeight > 0.4 || stockWeight > 0.6 ? 'MEDIUM' : 'LOW';
    const healthScore = total > 0 ? (divScore * 0.3 + allocScore * 0.4 + (overallRisk === 'HIGH' ? 40 : 100) * 0.3) : 0;

    const riskBreakdown = {
      inst: { score: Math.max(0, 100 - instRiskWeight * 100), label: topInstEntry?.[0] || '단일 기관', weight: instRiskWeight },
      asset: { score: Math.max(0, 100 - stockWeight * 100), label: '주식 비중', weight: stockWeight },
      currency: { score: Math.max(0, 100 - (currencyRiskWeight > 0.9 ? 50 : 0)), label: '통화 집중도', weight: currencyRiskWeight }
    };

    return { 
      total, profit, profitRate, processedAssets, 
      typeDist, instDist, currencyDist, tickerDist, accountTypeDist, healthScore,
      riskLevel: overallRisk, riskBreakdown, topInstName: topInstEntry?.[0],
      winners, losers, divScore, allocScore
    };
  }, [assets, accounts, exchangeRate]);

  const pieChartData = useMemo(() => {
    let rawData: Record<string, number> = {};
    if (compTab === 'TYPE') {
      Object.entries(stats.typeDist).forEach(([k, v]) => rawData[k] = (v as any).val);
    } else if (compTab === 'INST') {
      Object.entries(stats.instDist).forEach(([k, v]) => rawData[k] = (v as any).val);
    } else if (compTab === 'CURRENCY') {
      rawData = stats.currencyDist;
    } else if (compTab === 'ACCOUNT_TYPE') {
      rawData = stats.accountTypeDist;
    } else {
      rawData = stats.tickerDist;
    }

    return Object.entries(rawData)
      .map(([name, value]) => ({ name, value }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [stats, compTab]);

  return (
    <div className="pb-40">
      <div className="sticky top-0 z-20 px-5 py-5 bg-[#F4F7FB]/95 backdrop-blur-xl border-b border-slate-200/50 shadow-sm transition-all pt-safe">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="text-xl font-black text-slate-800 tracking-tight">
              안녕하세요, <span className="text-indigo-600">{user?.name || '사용자'}</span>님
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mt-1">
              <Clock size={12} className={isUpdating ? 'animate-pulse text-indigo-500' : ''} /> 
              {isUpdating ? (
                updateStatus ? (
                  <span className="text-indigo-600">
                    {updateStatus.api} 갱신 중... ({updateStatus.current}/{updateStatus.total})
                  </span>
                ) : '실시간 동기화 중...'
              ) : (lastUpdated || '시세 확인 중...')}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-2 bg-white rounded-2xl shadow-sm flex items-center gap-1.5 border border-slate-50">
              <Globe size={12} className="text-indigo-600" />
              <span className="text-[10px] font-black text-slate-600">{exchangeRate.toLocaleString()}</span>
            </div>
            <button 
              onClick={() => { onRefresh(); triggerHaptic('medium'); }}
              disabled={isUpdating}
              className={`p-3 bg-white rounded-full shadow-sm text-slate-400 hover:text-indigo-600 transition-all active:scale-95 ${isUpdating ? 'animate-spin text-indigo-600' : ''}`}
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* Daily Market Briefing Section */}
        <section className="bg-white rounded-[2rem] p-5 shadow-sm border border-indigo-50 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5"><Newspaper size={60} /></div>
          <div className="flex items-center justify-between mb-3 relative z-10">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-600 text-white rounded-lg"><Sparkles size={14} /></div>
              <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">AI 데일리 마켓 브리핑</h4>
            </div>
            <div className="flex items-center gap-2">
              {marketBriefing && !isNaN(new Date(marketBriefing.timestamp).getTime()) && (
                <span className="text-[9px] font-bold text-slate-400">
                  {new Date(marketBriefing.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 업데이트
                </span>
              )}
              {marketBriefing && !isBriefingLoading && (
                <button onClick={handleFetchBriefing} className="p-1.5 bg-indigo-50 text-indigo-600 rounded-full active:scale-90 transition-all" title="새로고침">
                  <RefreshCw size={12} />
                </button>
              )}
            </div>
          </div>
          
          <div className={`bg-slate-50 rounded-2xl border border-slate-100 min-h-[70px] flex items-center justify-center relative ${!marketBriefing && !isBriefingLoading ? 'p-2' : 'p-4'}`}>
            {isBriefingLoading ? (
              <div className="space-y-2 w-full">
                <div className="h-2 w-full bg-slate-200 rounded animate-pulse"></div>
                <div className="h-2 w-3/4 bg-slate-200 rounded animate-pulse"></div>
              </div>
            ) : marketBriefing ? (
              <p className="text-[11px] font-bold text-slate-600 leading-relaxed whitespace-pre-line italic w-full text-left animate-in fade-in">
                {marketBriefing.content}
              </p>
            ) : (
              <button 
                onClick={handleFetchBriefing}
                className="w-full h-full py-4 flex items-center justify-center gap-2 text-indigo-600 font-black text-xs hover:bg-slate-100 rounded-xl transition-all active:scale-95"
              >
                <PlayCircle size={16} /> 오늘의 시장 브리핑 생성하기
              </button>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-indigo-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10"><Wallet size={120} /></div>
            <div className="relative z-10">
              <p className="text-indigo-100 text-[10px] font-black uppercase tracking-widest mb-1 opacity-80">Visible Net Worth</p>
              <h3 className="text-4xl font-black mb-6 tracking-tighter">{Math.floor(stats.total).toLocaleString()}원</h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className={`px-4 py-2 rounded-2xl flex items-center gap-1.5 text-xs font-black ${stats.profit >= 0 ? 'bg-rose-500/20 text-rose-100' : 'bg-blue-500/20 text-blue-100'}`}>
                  {stats.profit >= 0 ? <TrendingUp size={14} /> : <ArrowDownRight size={14} />}
                  {stats.profitRate.toFixed(1)}% ({Math.floor(stats.profit).toLocaleString()}원)
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50">
          <div className="flex flex-col gap-6 mb-6">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <PieChartIcon size={18} />
              </div>
              <h4 className="font-black text-slate-800 text-sm">포트폴리오 다차원 분석</h4>
            </div>
            
            <div className="flex bg-slate-100 rounded-2xl p-1 shadow-inner overflow-x-auto no-scrollbar gap-1">
              <AnalysisTab active={compTab === 'TYPE'} onClick={() => { setCompTab('TYPE'); triggerHaptic('light'); }} icon={<Layers size={14} />} label="자산별" />
              <AnalysisTab active={compTab === 'ACCOUNT_TYPE'} onClick={() => { setCompTab('ACCOUNT_TYPE'); triggerHaptic('light'); }} icon={<ShieldCheck size={14} />} label="계좌유형" />
              <AnalysisTab active={compTab === 'INST'} onClick={() => { setCompTab('INST'); triggerHaptic('light'); }} icon={<Building2 size={14} />} label="기관별" />
              <AnalysisTab active={compTab === 'CURRENCY'} onClick={() => { setCompTab('CURRENCY'); triggerHaptic('light'); }} icon={<Globe size={14} />} label="통화별" />
              <AnalysisTab active={compTab === 'TICKER'} onClick={() => { setCompTab('TICKER'); triggerHaptic('light'); }} icon={<Tag size={14} />} label="종목별" />
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
                  formatter={(value: number, name: string) => [`${Math.floor(value).toLocaleString()}원`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6 space-y-3">
            {pieChartData.slice(0, 10).map((data, idx) => (
              <div key={data.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                  <span className="text-xs font-black text-slate-700">{data.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-slate-900">{Math.floor(data.value).toLocaleString()}원</p>
                  <p className="text-[9px] font-bold text-slate-400">{(data.value / stats.total * 100).toFixed(1)}%</p>
                </div>
              </div>
            ))}
            {pieChartData.length > 10 && (
              <div className="text-center pt-2">
                <span className="text-[10px] font-bold text-slate-400">및 기타 {pieChartData.length - 10}건</span>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Trophy size={18} />
            </div>
            <h4 className="font-black text-slate-800 text-sm">성과 분석 (Best & Worst)</h4>
          </div>
          
          <div className="grid grid-cols-1 gap-8">
            <div className="space-y-3">
              <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-1.5">
                <TrendingUp size={12}/> Top Performers
              </p>
              {stats.winners.length > 0 ? stats.winners.map((a, i) => (
                <div key={a.id} className="flex items-center justify-between bg-rose-50/30 p-3 rounded-2xl border border-rose-50">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-rose-500">#{i+1}</span>
                    <div>
                      <p className="text-xs font-black text-slate-800">{a.name}</p>
                      <p className="text-[9px] font-bold text-slate-400">{a.institution}</p>
                    </div>
                  </div>
                  <p className="text-xs font-black text-rose-500">+{a.profitRate.toFixed(1)}%</p>
                </div>
              )) : <p className="text-[10px] text-slate-300 italic text-center py-2">수익 중인 자산이 없습니다.</p>}
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-50">
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-1.5">
                <TrendingDown size={12}/> Worst Performers
              </p>
              {stats.losers.length > 0 ? stats.losers.map((a, i) => (
                <div key={a.id} className="flex items-center justify-between bg-blue-50/30 p-3 rounded-2xl border border-blue-50">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-blue-500">#{i+1}</span>
                    <div>
                      <p className="text-xs font-black text-slate-800">{a.name}</p>
                      <p className="text-[9px] font-bold text-slate-400">{a.institution}</p>
                    </div>
                  </div>
                  <p className="text-xs font-black text-blue-500">{a.profitRate.toFixed(1)}%</p>
                </div>
              )) : <p className="text-[10px] text-slate-300 italic text-center py-2">손실 중인 자산이 없습니다.</p>}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <DiagnosticCard 
            onClick={() => { setIsScoreModalOpen(true); triggerHaptic('light'); }}
            icon={<Zap size={18} />} 
            label="Health Score" 
            value={`${Math.floor(stats.healthScore)}점`} 
            progress={stats.healthScore} 
          />
          <DiagnosticCard 
            onClick={() => { setIsRiskModalOpen(true); triggerHaptic('light'); }}
            icon={<ShieldAlert size={18} className={stats.riskLevel === 'HIGH' ? 'animate-pulse' : ''} />} 
            label="Risk Status" 
            value={stats.riskLevel === 'HIGH' ? '위험 감지' : '안정'} 
            isAlert={stats.riskLevel === 'HIGH'}
          />
        </section>

        <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50">
          <div className="flex items-center justify-between mb-6">
            <h4 className="font-black text-slate-800 flex items-center gap-2">
              <ListFilter size={18} className="text-indigo-600" /> 보유 비중 TOP 5
            </h4>
            <Link to="/assets" onClick={() => triggerHaptic('light')} className="text-[10px] font-black text-indigo-600 hover:underline">전체보기</Link>
          </div>
          <div className="space-y-5">
            {stats.processedAssets.slice(0, 5).map(asset => (
              <div key={asset.id} className="flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px] border transition-all ${getInstitutionColor(asset.institution)}`}>
                    {asset.institution.substring(0, 2)}
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800">{asset.name}</p>
                    <p className="text-[9px] font-bold text-slate-400">{asset.institution}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900">{Math.floor(asset.currentVal).toLocaleString()}원</p>
                  <p className="text-[8px] font-black text-slate-300 uppercase">{(asset.currentVal / stats.total * 100).toFixed(1)}%</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {isScoreModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setIsScoreModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90dvh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-800">자산 건강도 진단</h3>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-0.5">Asset Health Analysis</p>
              </div>
              <button onClick={() => setIsScoreModalOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={20}/></button>
            </div>
            <div className="p-8 overflow-y-auto no-scrollbar space-y-8">
              <div className="text-center py-6">
                <div className="inline-flex items-center justify-center w-32 h-32 rounded-full border-8 border-indigo-50 relative">
                  <span className="text-4xl font-black text-slate-900">{Math.floor(stats.healthScore)}</span>
                  <span className="absolute -bottom-2 px-3 py-1 bg-indigo-600 text-white text-[10px] font-black rounded-full">SCORE</span>
                </div>
                <p className="mt-6 text-sm font-bold text-slate-500 leading-relaxed px-4">
                  {stats.healthScore > 80 ? '매우 안정적인 포트폴리오입니다.' : 
                   stats.healthScore > 50 ? '균형 잡힌 투자가 진행 중입니다.' : 
                   '자산 분산이 부족하거나 특정 위험에 노출되어 있습니다.'}
                </p>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-600 flex items-center gap-1.5"><Layers size={14}/> 분산 투자 점수</span>
                    <span className="text-xs font-black text-indigo-600">{Math.floor(stats.divScore)}점</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${stats.divScore}%` }}></div>
                  </div>
                  <p className="text-[10px] text-slate-400">종목 수가 다양할수록 점수가 높아집니다.</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-600 flex items-center gap-1.5"><Scale size={14}/> 자산 배분 점수</span>
                    <span className="text-xs font-black text-emerald-600">{Math.floor(stats.allocScore)}점</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stats.allocScore}%` }}></div>
                  </div>
                  <p className="text-[10px] text-slate-400">주식 비중이 50%에 가까울수록 균형 잡힌 것으로 간주합니다.</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-slate-600 flex items-center gap-1.5"><ShieldCheck size={14}/> 변동성 관리 점수</span>
                    <span className={`text-xs font-black ${stats.riskLevel === 'HIGH' ? 'text-rose-500' : 'text-blue-500'}`}>
                      {stats.riskLevel === 'HIGH' ? '주의 필요' : stats.riskLevel === 'MEDIUM' ? '보통' : '우수'}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${stats.riskLevel === 'HIGH' ? 'bg-rose-500' : stats.riskLevel === 'MEDIUM' ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: stats.riskLevel === 'HIGH' ? '30%' : stats.riskLevel === 'MEDIUM' ? '60%' : '100%' }}></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-8 bg-slate-50 mt-auto pb-safe">
               <button onClick={() => setIsScoreModalOpen(false)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all">확인</button>
            </div>
          </div>
        </div>
      )}

      {isRiskModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setIsRiskModalOpen(false)}></div>
          <div className="relative bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90dvh]">
            <div className="px-8 pt-8 pb-4 flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black text-slate-800">리스크 정밀 진단</h3>
                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mt-0.5">Detailed Risk Analysis</p>
              </div>
              <button onClick={() => setIsRiskModalOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400"><X size={20}/></button>
            </div>
            <div className="p-8 overflow-y-auto no-scrollbar space-y-6">
              
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-black text-slate-700 text-sm flex items-center gap-2"><Building2 size={16}/> 기관 집중도</h4>
                  <span className={`text-xs font-black px-2 py-0.5 rounded ${stats.riskBreakdown.inst.score < 50 ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>
                    {(stats.riskBreakdown.inst.weight * 100).toFixed(0)}% 집중
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
                  <div className={`h-full ${stats.riskBreakdown.inst.score < 50 ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: `${stats.riskBreakdown.inst.weight * 100}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-400">
                  가장 비중이 높은 기관은 <span className="text-slate-700 font-bold">{stats.topInstName || '없음'}</span>입니다.
                  {stats.riskBreakdown.inst.weight > 0.6 && " 특정 기관에 자산이 과도하게 집중되어 있습니다."}
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-black text-slate-700 text-sm flex items-center gap-2"><PieChartIcon size={16}/> 주식 자산 비중</h4>
                  <span className={`text-xs font-black px-2 py-0.5 rounded ${stats.riskBreakdown.asset.weight > 0.8 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {(stats.riskBreakdown.asset.weight * 100).toFixed(0)}% 보유
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
                  <div className={`h-full ${stats.riskBreakdown.asset.weight > 0.8 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${stats.riskBreakdown.asset.weight * 100}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-400">
                  전체 자산 중 주식(위험자산)이 차지하는 비율입니다.
                  {stats.riskBreakdown.asset.weight > 0.8 && " 시장 변동성에 크게 노출될 수 있습니다."}
                </p>
              </div>

              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-black text-slate-700 text-sm flex items-center gap-2"><Globe size={16}/> 통화 편중 리스크</h4>
                  <span className={`text-xs font-black px-2 py-0.5 rounded ${stats.riskBreakdown.currency.weight > 0.9 ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                    {(stats.riskBreakdown.currency.weight * 100).toFixed(0)}% 집중
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
                  <div className={`h-full ${stats.riskBreakdown.currency.weight > 0.9 ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${stats.riskBreakdown.currency.weight * 100}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-400">
                  단일 통화에 자산이 집중되어 있습니다. 환율 변동에 따른 리스크 분산이 필요할 수 있습니다.
                </p>
              </div>

              <div className="bg-slate-900 rounded-2xl p-5 text-white">
                <div className="flex items-start gap-3">
                   <ShieldAlert className="text-yellow-400 shrink-0" size={20} />
                   <div>
                     <h4 className="font-black text-sm mb-1">종합 평가</h4>
                     <p className="text-xs text-slate-300 leading-relaxed">
                       현재 포트폴리오의 리스크 수준은 
                       <span className={`font-black ${stats.riskLevel === 'HIGH' ? 'text-rose-400' : stats.riskLevel === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'}`}> {stats.riskLevel} </span>
                       입니다. 
                       {stats.riskLevel === 'HIGH' 
                         ? " 특정 자산이나 기관에 쏠림 현상이 심합니다. 분산 투자를 권장합니다." 
                         : stats.riskLevel === 'MEDIUM' 
                         ? " 적절한 위험 관리가 이루어지고 있으나 일부 조정이 가능합니다." 
                         : " 매우 안정적인 분산 투자가 이루어지고 있습니다."}
                     </p>
                   </div>
                </div>
              </div>

            </div>
            <div className="p-8 bg-slate-50 mt-auto pb-safe">
               <button onClick={() => setIsRiskModalOpen(false)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all">확인</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AnalysisTab: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick} 
    className={`flex items-center gap-1.5 px-4 py-3 rounded-xl text-xs font-black whitespace-nowrap transition-all ${active ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
  >
    {icon}
    {label}
  </button>
);

const DiagnosticCard: React.FC<{ onClick: () => void; icon: React.ReactNode; label: string; value: string; progress?: number; isAlert?: boolean }> = ({ onClick, icon, label, value, progress, isAlert }) => (
  <button onClick={onClick} className={`bg-white p-5 rounded-[2rem] shadow-sm border text-left transition-all active:scale-95 ${isAlert ? 'border-rose-100 ring-4 ring-rose-50' : 'border-slate-50 hover:border-indigo-100'}`}>
    <div className="flex justify-between items-start mb-4">
      <div className={`p-2.5 rounded-2xl ${isAlert ? 'bg-rose-50 text-rose-500' : 'bg-indigo-50 text-indigo-600'}`}>
        {icon}
      </div>
      <div className="p-1.5 bg-slate-50 rounded-full text-slate-300">
        <ChevronRight size={14} />
      </div>
    </div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
    <h4 className={`text-xl font-black ${isAlert ? 'text-rose-500' : 'text-slate-800'}`}>{value}</h4>
    {progress !== undefined && (
      <div className="w-full h-1.5 bg-slate-100 rounded-full mt-3 overflow-hidden">
        <div className={`h-full rounded-full ${progress > 80 ? 'bg-emerald-500' : progress > 50 ? 'bg-indigo-500' : 'bg-rose-500'}`} style={{ width: `${progress}%` }}></div>
      </div>
    )}
  </button>
);

export default Dashboard;
