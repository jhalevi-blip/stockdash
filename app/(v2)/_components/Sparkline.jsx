'use client';

import { useId } from 'react';

export default function Sparkline({
  data,
  width = 120,
  height = 32,
  stroke,
  fill,
  strokeWidth = 1.5,
  responsive = false,
}) {
  const uid = useId().replace(/:/g, '');
  if (!data || data.length === 0) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) =>
    `${(i * stepX).toFixed(2)},${(height - ((v - min) / range) * height).toFixed(2)}`
  );
  const path = 'M ' + points.join(' L ');
  const last = data[data.length - 1];
  const first = data[0];
  const dir = last >= first ? 1 : -1;
  const c = stroke || (dir > 0 ? '#16a34a' : '#dc2626');
  const f = fill || (dir > 0 ? 'rgba(22,163,74,.10)' : 'rgba(220,38,38,.10)');
  const areaPath = `${path} L ${width},${height} L 0,${height} Z`;
  const gradId = `spark-grad-${uid}`;
  return (
    <svg width={responsive ? '100%' : width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {responsive && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity="0.2" />
            <stop offset="100%" stopColor={c} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      <path d={areaPath} fill={responsive ? `url(#${gradId})` : f} stroke="none" />
      <path d={path} fill="none" stroke={c} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
