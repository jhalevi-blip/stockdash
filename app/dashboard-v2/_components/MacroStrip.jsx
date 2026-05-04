'use client';

import { MACRO } from '../_lib/mockData';
import { fmtPct, colorForChange } from '../_lib/format';

export default function MacroStrip({ onIndexClick }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
      gap: 1,
      background: 'var(--border-color)',
      border: '1px solid var(--border-color)',
      borderRadius: 6,
      overflow: 'hidden',
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      {MACRO.map(m => (
        <button key={m.label} onClick={() => onIndexClick?.(m.label)} style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          padding: '9px 10px',
          background: 'var(--bg-card)',
          border: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          color: 'inherit',
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
          transition: 'background .2s',
        }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-card)'}>
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>{m.label}</span>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}>{m.value}</span>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: colorForChange(m.change),
            fontVariantNumeric: 'tabular-nums',
          }}>{m.changeAbs} ({fmtPct(m.change)})</span>
        </button>
      ))}
    </div>
  );
}
