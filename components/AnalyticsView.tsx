
import React, { useMemo, useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer 
} from 'recharts';
import { Asset } from '../types';
import { 
  ArrowLeft, TrendingUp, TrendingDown, Activity, 
  Info, BarChart3, Globe, MapPin,
  Layers, Package, Tag, ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AssetSparkline } from './AssetSparkline';

interface AnalyticsViewProps {
  history: {date: string, value: number}[];
  assets: Asset[];
  exchangeRate: number;
}

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ history, assets, exchangeRate }) => {
  const [range, setRange] = useState('1M');
  const [region, setRegion] = useState<'ALL' | 'KRW' | 'USD'>('ALL');

  // 필터링된 현재 자산 통계 계산
  const currentFilteredStats = useMemo(() => {
    const filtered = region === 'ALL' 
      ? assets 
      : assets.filter(a => a.currency === region);
    
    if (filtered.length === 0) return null;

    let totalVal = 0;
    let totalCost = 0;
    
    filtered.forEach(a => {
      // Use passed exchangeRate prop instead of constant
      const mult = a.currency === 'USD' ? exchangeRate : 1;
      totalVal += (a.currentPrice || 0) * (a.quantity || 0) * mult;
      totalCost += (a.purchasePrice || 0) * (a.quantity || 0) * mult;
    });

    const profit = totalVal - totalCost;
    const profitRate = totalCost > 0 ? (profit / totalCost) * 100 : 0;

    return { totalVal, totalCost, profit, profitRate, count: filtered.length };
  }, [assets, region, exchangeRate]);

  // 지역별 그룹화된 자산 목록
  const groupedAssets = useMemo(() => {
    const filtered = assets.filter(a => region === 'ALL' || a.currency === region);
    const groups: Record<string, Asset[]> = {};
    
    // 우선순위 정렬 (KRW 먼저, 그다음 USD)
    const currencies = ['KRW', 'USD'];
    currencies.forEach(c => {
      const items = filtered.filter(a => a.currency === c);
      if (items.length > 0) groups[c] = items;
    });

    return groups;
  }, [assets, region]);

  // 히스토리 차트 데이터
  const chartData = useMemo(() => {
    const historyArray = (history as any[]) || [];
    return historyArray.map(h => ({
      name: h.date.split('-').slice(1).join('/'),
      value: h.value
    }));
  }, [history]);

  // 히스토리 기반 통계
  const historyStats = useMemo(() => {
    const historyArray = (history as any[]) || [];
    if (historyArray.length === 0) return null;
    const values = historyArray.map(h => h.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    return { max, min };
  }, [history]);

  return (
    <div className="flex flex-col min-h-full bg-[#F4F7FB] pb-32">
      {/* Header */}
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

        {/* 지역 필터 탭 */}
        <div className="flex p-1 bg-slate-100 rounded-2xl">
          <button 
            onClick={() => setRegion('ALL')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${region === 'ALL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
          >
            <Globe size={14} /> 전체
          </button>
          <button 
            onClick={() => setRegion('KRW')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${region === 'KRW' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}
          >
            <MapPin size={14} /> 국내
          </button>
          <button 
            onClick={() => setRegion('USD')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${region === 'USD' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400'}`}
          >
            <Globe size={14} /> 해외
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* 선택된 지역 요약 카드 */}
        <section className={`rounded-[2.5rem] p-7 text-white shadow-xl relative overflow-hidden transition-colors duration-500 ${
          region === 'ALL' ? 'bg-indigo-600' : region === 'KRW' ? 'bg-blue-600' : 'bg-amber-600'
        }`}>
          <div className="relative z-10">
            <p className="text-white/70 text-[10px] font-black uppercase tracking-widest mb-1">
              {region === 'ALL' ? 'Total Portfolio' : region === 'KRW' ? 'Domestic (KRW)' : 'Overseas (USD)'} Value
            </p>
            <h3 className="text-3xl font-black mb-6">
              {currentFilteredStats?.totalVal.toLocaleString() || 0}원
            </h3>
            
            <div className="flex gap-4">
              <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl flex-1">
                <p className="text-[9px] font-black text-white/60 uppercase mb-0.5">투자 수익</p>
                <p className="text-sm font-black">
                  {currentFilteredStats?.profit.toLocaleString() || 0}원
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl flex-1">
                <p className="text-[9px] font-black text-white/60 uppercase mb-0.5">수익률</p>
                <p className="text-sm font-black">
                  {currentFilteredStats?.profitRate.toFixed(2) || 0}%
                </p>
              </div>
            </div>
          </div>
          <div className="absolute -right-6 -bottom-6 opacity-10">
            {region === 'USD' ? <Globe size={120} /> : <Activity size={120} />}
          </div>
        </section>

        {/* Chart Card (전체 자산 추이) */}
        <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50">
          <div className="flex items-center justify-between mb-8">
            <h4 className="font-black text-slate-800 text-sm">포트폴리오 총액 추이</h4>
            <div className="flex gap-1.5">
              {['1M', 'ALL'].map(r => (
                <button 
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1 rounded-full text-[9px] font-black transition-all ${
                    range === r ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="detailedColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" hide />
                <YAxis hide domain={['dataMin - 10000', 'dataMax + 10000']} />
                <Tooltip 
                  contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '8px 12px' }}
                  itemStyle={{ fontSize: '11px', fontWeight: '900', color: '#4F46E5' }}
                  labelStyle={{ fontSize: '9px', color: '#94a3b8', fontWeight: 'bold' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#4F46E5" 
                  strokeWidth={3} 
                  fillOpacity={1} 
                  fill="url(#detailedColor)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-4 text-[9px] text-slate-300 font-bold text-center italic">
            * 차트는 전체 자산 합계의 기록을 보여줍니다.
          </p>
        </section>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-50">
            <div className="w-8 h-8 bg-emerald-50 text-emerald-500 rounded-xl flex items-center justify-center mb-4">
              <TrendingUp size={16} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">전체 최고점</p>
            <p className="text-sm font-black text-slate-800 mt-1">{historyStats?.max.toLocaleString() || 0}원</p>
          </div>
          <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-50">
            <div className="w-8 h-8 bg-rose-50 text-rose-500 rounded-xl flex items-center justify-center mb-4">
              <TrendingDown size={16} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">전체 최저점</p>
            <p className="text-sm font-black text-slate-800 mt-1">{historyStats?.min.toLocaleString() || 0}원</p>
          </div>
        </div>

        {/* 상세 포트폴리오 자산 목록 (Grouped by Region) */}
        <section className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-slate-50">
          <div className="flex items-center justify-between mb-8">
            <h4 className="font-black text-slate-800 flex items-center gap-2">
              <Layers size={18} className="text-indigo-600" />
              상세 포트폴리오 현황
            </h4>
          </div>

          <div className="space-y-8">
            {Object.entries(groupedAssets).map(([currency, items]) => (
              <div key={currency} className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  {currency === 'KRW' ? (
                    <MapPin size={14} className="text-blue-500" />
                  ) : (
                    <Globe size={14} className="text-amber-500" />
                  )}
                  <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                    {currency === 'KRW' ? 'Domestic Assets' : 'Overseas Assets'}
                  </h5>
                  <div className="h-[1px] bg-slate-100 flex-1 ml-2"></div>
                </div>

                <div className="space-y-3">
                  {(items as Asset[]).map((a) => {
                    // Use passed exchangeRate prop instead of constant
                    const mult = a.currency === 'USD' ? exchangeRate : 1;
                    const totalVal = a.currentPrice * a.quantity * mult;
                    const profitRate = a.purchasePrice > 0 ? ((a.currentPrice - a.purchasePrice) / a.purchasePrice) * 100 : 0;
                    const isPlus = profitRate >= 0;

                    return (
                      <div key={a.id} className="bg-slate-50/50 border border-slate-100/50 rounded-2xl p-4 transition-all hover:bg-white hover:shadow-md hover:border-indigo-100">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black ${
                              a.currency === 'KRW' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                            }`}>
                              {a.ticker ? a.ticker.substring(0, 4) : a.name.substring(0, 1)}
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-800">{a.name}</p>
                              <p className="text-[9px] font-bold text-slate-400">{a.institution}</p>
                            </div>
                          </div>
                          
                          {/* Sparkline & Profit Stats */}
                          <div className="flex items-center gap-3">
                            <div className="w-16 h-8 hidden sm:block">
                              <AssetSparkline ticker={a.ticker} name={a.name} isPlus={isPlus} />
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-black text-slate-900">{Math.floor(totalVal).toLocaleString()}원</p>
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                isPlus ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500'
                              }`}>
                                {isPlus ? '+' : ''}{profitRate.toFixed(2)}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Mobile view sparkline (visible when small) */}
                        <div className="sm:hidden w-full h-8 mb-3">
                           <AssetSparkline ticker={a.ticker} name={a.name} isPlus={isPlus} />
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100/50">
                          <div>
                            <div className="flex items-center gap-1 text-[8px] font-black text-slate-300 uppercase tracking-tight mb-0.5">
                              <Package size={10} /> 보유수량
                            </div>
                            <p className="text-[10px] font-black text-slate-600">{a.quantity.toLocaleString()}주</p>
                          </div>
                          <div>
                            <div className="flex items-center gap-1 text-[8px] font-black text-slate-300 uppercase tracking-tight mb-0.5">
                              <Tag size={10} /> 평균단가
                            </div>
                            <p className="text-[10px] font-black text-slate-600">{a.purchasePrice.toLocaleString()} {a.currency}</p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center justify-end gap-1 text-[8px] font-black text-slate-300 uppercase tracking-tight mb-0.5">
                              현재가 <ArrowRight size={8} />
                            </div>
                            <p className="text-[10px] font-black text-indigo-600">{a.currentPrice.toLocaleString()} {a.currency}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {assets.length === 0 && (
              <div className="py-12 text-center text-slate-300 font-bold italic">등록된 자산 데이터가 없습니다.</div>
            )}
          </div>
        </section>
      </div>

      <div className="fixed bottom-24 right-5 z-50">
        <div className="bg-white p-4 rounded-2xl shadow-2xl border border-slate-100 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
           <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
             <Info size={16} />
           </div>
           <p className="text-[10px] font-bold text-slate-500 leading-tight">
             국가별 필터 적용 시 환율({exchangeRate}원)이<br />자동 적용되어 계산됩니다.
           </p>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
