
import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { getAssetHistory, globalRequestQueue } from '../services/geminiService';
import { Loader2 } from 'lucide-react';

interface AssetSparklineProps {
  ticker?: string;
  name: string;
  isPlus: boolean;
  refreshTick: number;
}

export const AssetSparkline: React.FC<AssetSparklineProps> = ({ ticker, name, isPlus, refreshTick }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  
  const lastFetchedTick = useRef<number>(-1);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    if (lastFetchedTick.current === refreshTick && data.length > 0) return;

    let isMounted = true;
    const fetchHistory = async () => {
      if (!isMounted) return;

      try {
        const cacheKey = `history_${ticker}_${name}`;
        const cached = sessionStorage.getItem(cacheKey);
        
        if (cached && refreshTick === 0) {
            setData(JSON.parse(cached));
            setLoading(false);
            lastFetchedTick.current = refreshTick;
            return;
        }

        setLoading(true);
        
        // globalRequestQueue를 사용하여 순차적으로 기록 호출 (429 방지)
        const points = await globalRequestQueue.add(() => getAssetHistory(ticker || '', name));
        
        if (isMounted) {
          if (points && points.length > 0) {
            const chartData = points.map(p => ({ value: p.price }));
            setData(chartData);
            try {
              sessionStorage.setItem(cacheKey, JSON.stringify(chartData));
            } catch (e) { /* ignore */ }
          }
          setLoading(false);
          lastFetchedTick.current = refreshTick;
        }
      } catch (err) {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchHistory();
    return () => { isMounted = false; };
  }, [isVisible, ticker, name, refreshTick]);

  return (
    <div ref={containerRef} className="w-full h-full">
      {loading ? (
        <div className="w-full h-full flex items-center justify-center bg-slate-50/50 rounded-lg">
          <Loader2 size={12} className="animate-spin text-slate-300" />
        </div>
      ) : data.length === 0 ? (
        <div className="w-full h-full bg-slate-50/50 rounded-lg"></div>
      ) : (
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
              animationDuration={1000}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
