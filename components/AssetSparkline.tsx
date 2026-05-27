import React from 'react';

interface AssetSparklineProps {
  name: string;
  isPlus: boolean;
}

export const AssetSparkline: React.FC<AssetSparklineProps> = ({ name, isPlus }) => {
  // Generate deterministic points based on name to keep individual trends unique and consistent
  const dataPoints = React.useMemo(() => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const seed = Math.abs(hash) % 100;
    
    const points: number[] = [];
    let currentY = 50 + (seed % 20);
    points.push(currentY);
    for (let i = 0; i < 9; i++) {
      const step = ((seed + i * 23) % 25) - 12;
      const drift = isPlus ? -3 : 3; // SVG y rises downwards, so -decrease moves trend upwards
      currentY = Math.max(15, Math.min(85, currentY + step + drift));
      points.push(currentY);
    }
    return points;
  }, [name, isPlus]);

  const pathD = React.useMemo(() => {
    const coords = dataPoints.map((val, idx) => {
      const x = (idx / (dataPoints.length - 1)) * 100;
      const y = val;
      return `${x},${y}`;
    });
    return `M ${coords.join(' L ')}`;
  }, [dataPoints]);

  const color = isPlus ? '#ec4899' : '#3b82f6'; // Premium pink or blue
  const gradId = React.useMemo(() => `spark-grad-${Math.abs(name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0))}`, [name]);

  return (
    <div className="w-16 h-8 opacity-75 group-hover:opacity-100 transition-opacity flex items-center justify-center">
      <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.0} />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor={color} floodOpacity="0.4" />
          </filter>
        </defs>
        {/* Gradient fill */}
        <path
          d={`${pathD} L 100,100 L 0,100 Z`}
          fill={`url(#${gradId})`}
          stroke="none"
        />
        {/* Glowing stroke */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#glow)"
        />
      </svg>
    </div>
  );
};
