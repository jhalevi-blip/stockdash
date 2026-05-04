'use client';

import { ALLOCATION } from '../_lib/mockData';

export default function AllocationDonut({
  size = 140,
  strokeWidth = 20,
  data = ALLOCATION,
}) {
  const total = data.reduce((s, d) => s + d.pct, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="transparent"
          stroke="var(--bg-secondary)"
          strokeWidth={strokeWidth}
        />
        {data.map((d, i) => {
          const len = (d.pct / total) * circ;
          const dasharray = `${len} ${circ - len}`;
          const dashoffset = -offset;
          offset += len;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="transparent"
              stroke={d.color}
              strokeWidth={strokeWidth}
              strokeDasharray={dasharray}
              strokeDashoffset={dashoffset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })}
        <text
          x={cx} y={cy - 4}
          textAnchor="middle"
          fontSize="10"
          fill="var(--text-muted)"
          fontFamily="'Segoe UI', system-ui, sans-serif"
          letterSpacing=".08em"
        >SECTORS</text>
        <text
          x={cx} y={cy + 14}
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill="var(--text-primary)"
          fontFamily="'Segoe UI', system-ui, sans-serif"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >{data.length}</text>
      </svg>
      <ul style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        flex: 1,
        fontSize: 11,
        minWidth: 0,
      }}>
        {data.map(d => (
          <li key={d.sector} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: d.color,
              flexShrink: 0,
            }} />
            <span style={{
              color: 'var(--text-primary)',
              flex: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>{d.sector}</span>
            <span style={{
              color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}>{d.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
