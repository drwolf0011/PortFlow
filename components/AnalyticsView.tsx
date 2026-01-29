
import React, { useMemo, useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer 
} from 'recharts';
import { Asset } from '../types';
import { 
  ArrowLeft, TrendingUp, TrendingDown, Activity, 
  Info, BarChart3, Globe, MapPin,
  Layers, Package, Tag, ArrowRight, AlertCircle
} from 'lucide-react';
/* Fix: Using wildcard import for react-router-dom to resolve named export errors */
import * as ReactRouterDOM from 'react-router-dom';
const { Link } = ReactRouterDOM;
import { getInstitutionColor } from './AssetList';

interface AnalyticsViewProps {
  history: {date: string, value: number}[];
  assets: Asset[];
  exchangeRate: number;
}

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ history, assets, exchangeRate }) => {
  const [range, setRange] = useState('1M');
  const [region, setRegion] = useState<'ALL' | 'KRW' | 'USD'>('ALL');

  // 전체 자산 합계 (비중 계산용)
  const globalTotalVal = useMemo(() => {
    return assets.reduce((acc, a) => {
      const mult = a.currency === 'USD' ? exchangeRate : 1;
      return acc + (a.currentPrice || 0) * (a.quantity || 0) * mult;
    }, 0);
  }, [assets, exchangeRate]);

  // 필터링된 현재 자산 통계 계산
  const currentFilteredStats = useMemo(() => {
    const filtered = region === 'ALL' 
      ? assets 
      : assets.filter(a => a.currency === region);
    
    if (filtered.length === 0) return null;

    let totalVal = 0;
    let totalCost = 0;
    
    filtered.forEach(a => {
      const mult = a.currency === 'USD' ? exchangeRate : 1;
      totalVal += (a.currentPrice || 0) * (a.quantity || 0) * mult;
      // Accurate Cost Basis
      totalCost += (a.quantity || 0) * (a.purchasePriceKRW || (a.purchasePrice * (a.currency === 'USD' ? exchangeRate : 1)));
    });

    const profit = totalVal - totalCost;
    const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0;
    const ratio = globalTotalVal > 0 ? totalVal / globalTotalVal : 0;

    return { totalVal, totalCost, profit, profitRate, count: filtered.length, ratio };
  }, [assets, region, exchangeRate, globalTotalVal]);

  // 지역별 그룹화된 자산 목록 (평가 금액 내림차순 정렬 추가)
  const groupedAssets = useMemo(() => {
    const filtered = assets.filter(a => region === 'ALL' || a.currency === region);
    const groups: Record<string, Asset[]> = {};
    const currencies = ['KRW', 'USD'];
    
    currencies.forEach(c => {
      const items = filtered.filter(a => a.currency === c);
      if (items.length > 0) {
        // 평가 금액(원화 환산) 기준 내림차순 정렬
        items.sort((a, b) => {
          const valA = (a.currentPrice || 0) * (a.quantity || 0) * (a.currency === 'USD' ? exchangeRate : 1);
          const valB = (b.currentPrice || 0) * (b.quantity || 0) * (b.currency === 'USD' ? exchangeRate : 1);
          return valB - valA;
        });
        groups[c] = items;
      }
    });
    return groups;
  }, [assets, region, exchangeRate]);

  // 히스토리 차트 데이터 (선택된 지역 비중에 맞춰 보정)
  const chartData = useMemo(() => {
    const historyArray = (history as any[]) || [];
    const ratio = currentFilteredStats?.ratio ?? 1;
    
    return historyArray.map(h => ({
      name: h.date.split('-').slice(1).join('/'),
      value: h.value * ratio // 전체 히스토리 값에 현재 지역 비중을 곱해 추정치 산출
    }));
  }, [history, currentFilteredStats]);

  // 테마 색상 결정
  const themeColor = useMemo(() => {
    if (region === 'KRW') return '#2563eb'; // Blue-600
    if (region === 'USD') return '#d97706'; // Amber-600
    return '#4F46E5'; // Indigo-600
  }, [region]);

  return (
    <div className="flex flex-col min-h-full bg-[#F4F7FB] pb-32">
      <div className="bg-white px-5 py-6 flex flex-col gap-4 shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 -ml-2 text-slate-400 hover:text-indigo-600 transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">성장 분석 리포트</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Region-specific Performance</p>
          </div>
        </div>
        <div className="flex p-1 bg-slate-100 rounded-2xl">
          <button onClick={() => setRegion('ALL')} className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${region === 'ALL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}><Globe size={14} /> 전체</button>
          <button onClick={() => setRegion('KRW')} className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${region === 'KRW' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}><MapPin size={14} /> 국내</button>
          <button onClick={() => setRegion('USD')} className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${region === 'USD' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400'}`}><Globe size={14} /> 해외</button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        <section className={`rounded-[2.5rem] p-7 text-white shadow-xl relative overflow-hidden transition-colors duration-500 ${region === 'ALL' ? 'bg-indigo-600' : region === 'KRW' ? 'bg-blue-600' : 'bg-amber-600'}`}>
          <div className="relative z-10">
            <p className="text-white/70 text-[10px] font-black uppercase tracking-widest mb-1">{region === 'ALL' ? 'Total Portfolio' : region === 'KRW' ? 'Domestic (KRW)' : 'Overseas (USD)'} Value</p>
            <h3 className="text-3xl font-black mb-6">{currentFilteredStats?.totalVal.toLocaleString() || 0}원</h3>
            <div className="flex gap-4">
              <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl flex-1"><p className="text-[9px] font-black text-white/60 uppercase mb-0.5">투자 수익</p><p className="text-sm font-black">{currentFilteredStats?.profit.toLocaleString() || 0}원</p></div>
              <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl flex-1"><p className="text-[9px] font-black text-white/60 uppercase mb-0.5">수익률</p><p className="text-sm font-black">{currentFilteredStats?.profitRate.toFixed(2) || 0}%</p></div>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50 overflow-hidden">
          <div className="flex items-center justify-between mb-8">
            <h4 className="font-black text-slate-800 text-sm flex items-center gap-2">
              <BarChart3 size={18} style={{ color: themeColor }} />
              {region === 'ALL' ? '포트폴리오 총액 추이' : region === 'KRW' ? '국내 자산 성장 추이' : '해외 자산 성장 추이'}
            </h4>
          </div>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="dynamicColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={themeColor} stopOpacity={0.2}/>
                    <stop offset="95%" stopColor={themeColor} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip 
                  contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '8px 12px' }} 
                  itemStyle={{ fontSize: '11px', fontWeight: '900', color: themeColor }} 
                  labelStyle={{ fontSize: '9px', color: '#94a3b8', fontWeight: 'bold' }} 
                  formatter={(value: number) => [`${Math.floor(value).toLocaleString()}원`, '평가액']}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke={themeColor} 
                  strokeWidth={3} 
                  fillOpacity={1} 
                  fill="url(#dynamicColor)" 
                  animationDuration={1000}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {region !== 'ALL' && (
            <div className="mt-4 flex items-center gap-2 px-2 py-2 bg-slate-50 rounded-xl">
              <AlertCircle size={12} className="text-slate-400" />
              <p className="text-[9px] font-bold text-slate-400">
                위 그래프는 현재 {region} 자산 비중({((currentFilteredStats?.ratio || 0) * 100).toFixed(1)}%)을 기반으로 추정한 과거 성장 추이입니다.
              </p>
            </div>
          )}
        </section>

        <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50">
          <div className="flex items-center justify-between mb-8"><h4 className="font-black text-slate-800 flex items-center gap-2"><Layers size={18} className="text-indigo-600" />상세 포트폴리오 현황</h4></div>
          <div className="space-y-8">
            {Object.entries(groupedAssets).map(([currency, items]) => (
              <div key={currency} className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  {currency === 'KRW' ? <MapPin size={14} className="text-blue-500" /> : <Globe size={14} className="text-amber-500" />}
                  <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{currency === 'KRW' ? 'Domestic Assets' : 'Overseas Assets'}</h5>
                  <div className="h-[1px] bg-slate-100 flex-1 ml-2"></div>
                </div>
                <div className="space-y-3">
                  {(items as Asset[]).map((a) => {
                    const mult = a.currency === 'USD' ? exchangeRate : 1;
                    const totalVal = a.currentPrice * a.quantity * mult;
                    
                    // Accurate profit rate
                    const costBasisKRW = (a.quantity || 0) * (a.purchasePriceKRW || (a.purchasePrice * (a.currency === 'USD' ? exchangeRate : 1)));
                    const profitRate = costBasisKRW > 0 ? ((totalVal - costBasisKRW) / costBasisKRW) * 100 : 0;
                    
                    const isPlus = profitRate >= 0;
                    return (
                      <div key={a.id} className="bg-slate-50/50 border border-slate-100/50 rounded-2xl p-4 transition-all hover:bg-white hover:shadow-md hover:border-indigo-100">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black border transition-all ${getInstitutionColor(a.institution)}`}>
                              {a.institution.substring(0, 2)}
                            </div>
                            <div><p className="text-xs font-black text-slate-800">{a.name}</p><p className="text-[9px] font-bold text-slate-400">{a.institution}</p></div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-slate-900">{Math.floor(totalVal).toLocaleString()}원</p>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isPlus ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500'}`}>{isPlus ? '+' : ''}{profitRate.toFixed(2)}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AnalyticsView;
