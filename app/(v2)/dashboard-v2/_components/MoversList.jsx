'use client';

import Sparkline from '@/app/(v2)/_components/Sparkline';
import { TOP_MOVERS_UP, TOP_MOVERS_DOWN, TICKER_SPARKS } from '../_lib/mockData';
import { fmtCurrency, fmtPct, colorForChange } from '@/app/(v2)/_lib/format';

export default function MoversList({ kind = 'up', onTickerClick }) {
  const list = kind === 'up' ? TOP_MOVERS_UP : TOP_MOVERS_DOWN;
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      {list.map(m => (
        <button
          key={m.ticker}
          onClick={() => onTickerClick?.(m.ticker)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: 6,
            cursor: 'pointer',
            textAlign: 'left',
            color: 'inherit',
            fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
            transition: 'background .2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            color: 'var(--accent)',
            fontWeight: 600,
            fontSize: 12,
            width: 56,
          }}>{m.ticker}</span>
          <Sparkline
            data={TICKER_SPARKS[m.ticker]}
            width={60}
            height={20}
            strokeWidth={1.3}
          />
          <span style={{
            marginLeft: 'auto',
            color: colorForChange(m.change),
            fontWeight: 600,
            fontSize: 13,
            fontVariantNumeric: 'tabular-nums',
          }}>{fmtPct(m.change)}</span>
          <span style={{
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
            width: 60,
            textAlign: 'right',
          }}>{fmtCurrency(m.last)}</span>
        </button>
      ))}
    </div>
  );
}
