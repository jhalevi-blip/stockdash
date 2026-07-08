'use client';

import dynamic from 'next/dynamic';
import { PORTFOLIO } from '../_lib/mockData';
import { fmtCurrency, fmtPct, fmtSigned } from '@/app/(v2)/_lib/format';

// Chart lives in its own module so recharts loads after paint (async chunk),
// not on the dashboard critical path. ssr:false is safe — the page is client-only.
const HeroSparkChart = dynamic(() => import('./HeroSparkChart'), {
  ssr: false,
  loading: () => <div style={{ marginTop: 8, width: '100%', height: 140 }} />,
});

const RANGES = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

export default function HeroValue({ range = '1M', onRange, sparkData, data = PORTFOLIO }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
        }}>{data.asOf}</span>
        <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
          {RANGES.map(r => {
            const disabled = r === '1D';
            return (
              <button
                key={r}
                onClick={disabled ? undefined : () => onRange?.(r)}
                style={{
                  background:  !disabled && r === range ? 'var(--bg-hover)' : 'transparent',
                  border:      '1px solid ' + (!disabled && r === range ? 'var(--accent)' : 'var(--border-color)'),
                  color:       disabled ? 'var(--text-muted)' : r === range ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize:    11,
                  padding:     '3px 8px',
                  borderRadius: 4,
                  cursor:      disabled ? 'not-allowed' : 'pointer',
                  fontWeight:  500,
                  opacity:     disabled ? 0.5 : 1,
                }}
              >{r}</button>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: '-.02em',
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}>{fmtCurrency(data.totalValue, 2, data.displayCurrency)}</span>
        <span style={{
          fontSize: 14,
          fontWeight: 600,
          color: data.dayChange >= 0 ? 'var(--positive)' : 'var(--negative)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {fmtSigned(data.dayChange, 2, data.displayCurrency)} ({fmtPct(data.dayChangePct)}){' '}
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
        <span>Cost {fmtCurrency(data.totalCost, 0, data.displayCurrency)}</span>
        <span>·</span>
        <span>
          Total P&amp;L{' '}
          <span style={{ color: (data.totalPnl ?? data.unrealized) >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
            {fmtSigned(data.totalPnl ?? data.unrealized, 0, data.displayCurrency)}
          </span>
        </span>
        <span>·</span>
        <span>Cash {fmtCurrency(data.cash, 0, data.cashCurrency)}</span>
      </div>
      <HeroSparkChart sparkData={sparkData} range={range} displayCurrency={data.displayCurrency} />
    </div>
  );
}
