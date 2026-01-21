
import React, { useState, useEffect } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { getAssetHistory } from '../services/geminiService';
import { Loader2 } from 'lucide-react';

export const AssetSparkline: React.FC<{ ticker?: string, name: string, isPlus: boolean }> = ({ ticker, name, isPlus }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      try {
        // Simple cache to prevent redundant API calls
        const cacheKey = `history_${ticker}_${name}`;
        const cached = sessionStorage.getItem(cacheKey);
        
        if (cached) {
            setData(JSON.parse(cached));
            setLoading(false);
            return;
        }

        const points = await getAssetHistory(ticker || '', name);
        
        if (isMounted) {
          if (points && points.length > 0) {
            const chartData = points.map(p => ({ value: p.price }));
            setData(chartData);
            try {
              sessionStorage.setItem(cacheKey, JSON.stringify(chartData));
            } catch (e) { /* ignore storage quota errors */ }
          }
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) setLoading(false);
      }
    };
    fetchHistory();
    return () => { isMounted = false; };
  }, [ticker, name]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-50/50 rounded-lg animate-pulse">
        <Loader2 size={12} className="animate-spin text-slate-300" />
      </div>
    );
  }

  if (data.length === 0) return <div className="w-full h-full bg-slate-50/50 rounded-lg"></div>;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`spark-${name.replace(/[^a-zA-Z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={isPlus ? "#F43F5E" : "#3B82F6"} stopOpacity={0.2}/>
            <stop offset="95%" stopColor={isPlus ? "#F43F5E" : "#3B82F6"} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <Area 
          type="monotone" 
          dataKey="value" 
          stroke={isPlus ? "#F43F5E" : "#3B82F6"} 
          strokeWidth={2} 
          fillOpacity={1} 
          fill={`url(#spark-${name.replace(/[^a-zA-Z0-9]/g, '')})`} 
          animationDuration={1500}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
