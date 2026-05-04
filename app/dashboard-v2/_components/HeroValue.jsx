'use client';

import Sparkline from './Sparkline';
import { PORTFOLIO, PORTFOLIO_SPARK } from '../_lib/mockData';
import { fmtCurrency, fmtPct, fmtSigned } from '../_lib/format';

const RANGES = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

export default function HeroValue({ range = '1M', onRange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}>Total portfolio value</span>
        <span style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          fontVariantNumeric: 'tabular-nums',
        }}>{PORTFOLIO.asOf}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: '-.02em',
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}>{fmtCurrency(PORTFOLIO.totalValue)}</span>
        <span style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--positive-bright)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {fmtSigned(PORTFOLIO.dayChange)} ({fmtPct(PORTFOLIO.dayChangePct)}){' '}
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>today</span>
        </span>
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 11,
        color: 'var(--text-muted)',
        fontVariantNumeric: 'tabular-nums',
        flexWrap: 'wrap',
      }}>
        <span>Cost {fmtCurrency(PORTFOLIO.totalCost, 0)}</span>
        <span>·</span>
        <span>
          Unrealized{' '}
          <span style={{ color: 'var(--positive-soft)' }}>
            {fmtSigned(PORTFOLIO.unrealized, 0)}
          </span>{' '}
          ({fmtPct(PORTFOLIO.unrealizedPct, 1)})
        </span>
        <span>·</span>
        <span>Cash {fmtCurrency(PORTFOLIO.cash, 0)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <Sparkline data={PORTFOLIO_SPARK} width={300} height={48} strokeWidth={1.8} />
        <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
          {RANGES.map(r => (
            <button key={r} onClick={() => onRange?.(r)} style={{
              background: r === range ? 'var(--bg-hover)' : 'transparent',
              border: '1px solid ' + (r === range ? 'var(--accent)' : 'var(--border-color)'),
              color: r === range ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 500,
            }}>{r}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
