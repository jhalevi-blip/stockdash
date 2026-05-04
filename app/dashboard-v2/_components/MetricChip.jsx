'use client';

import { fmtPct, colorForChange } from '../_lib/format';

export default function MetricChip({ label, value, change, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 2,
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 6,
      padding: '10px 12px',
      cursor: onClick ? 'pointer' : 'default',
      textAlign: 'left',
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
      color: 'inherit',
      transition: 'border-color .2s',
    }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.borderColor = 'var(--accent)'; }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.borderColor = 'var(--border-color)'; }}>
      <span style={{
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}>{label}</span>
      <span style={{
        fontSize: 16,
        fontWeight: 700,
        color: 'var(--text-primary)',
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
      {change !== undefined && (
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: colorForChange(change),
          fontVariantNumeric: 'tabular-nums',
        }}>{fmtPct(change)}</span>
      )}
    </button>
  );
}
