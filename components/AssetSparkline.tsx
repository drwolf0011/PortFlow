
import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { getAssetHistory } from '../services/geminiService';
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
  
  // 마지막으로 데이터를 가져온 리프레시 틱을 기록함
  const lastFetchedTick = useRef<number>(-1);

  // IntersectionObserver를 이용해 화면에 보일 때만 렌더링 준비
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
    // 화면에 보이지 않거나, 이미 현재 틱(회차)에 데이터를 가져왔다면 호출 스킵
    if (!isVisible) return;
    if (lastFetchedTick.current === refreshTick && data.length > 0) return;

    let isMounted = true;
    const fetchHistory = async () => {
      try {
        const cacheKey = `history_${ticker}_${name}`;
        const cached = sessionStorage.getItem(cacheKey);
        
        // 캐시가 있고, 현재가 강제 리프레시 요청(refreshTick > 0)이 아닌 경우 캐시 사용
        if (cached && refreshTick === 0) {
            setData(JSON.parse(cached));
            setLoading(false);
            lastFetchedTick.current = refreshTick;
            return;
        }

        // 캐시가 없거나, 사용자가 리프레시 버튼을 누른 경우 API 호출
        setLoading(true);
        const points = await getAssetHistory(ticker || '', name);
        
        if (isMounted) {
          if (points && points.length > 0) {
            const chartData = points.map(p => ({ value: p.price }));
            setData(chartData);
            try {
              sessionStorage.setItem(cacheKey, JSON.stringify(chartData));
            } catch (e) { /* ignore */ }
          }
          setLoading(false);
          // 호출 완료 후 현재 틱 저장 (중복 호출 방지)
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
