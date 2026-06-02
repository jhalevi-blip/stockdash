'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { PORTFOLIO } from '../_lib/mockData';
import { fmtCurrency, fmtPct, fmtSigned } from '@/app/(v2)/_lib/format';

const RANGES = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

function fmtXTick(dateStr, range) {
  const d = new Date(dateStr);
  if (range === '1W') return d.toLocaleDateString('en-US', { weekday: 'short' });
  if (range === '1M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short' });
}

const AXIS_SYMBOL = { USD: '$', EUR: '€', GBP: '£' };

function fmtKAxis(v, currency = 'USD') {
  const s = AXIS_SYMBOL[currency] ?? '$';
  if (v >= 1000000) return s + (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000)    return s + (v / 1000).toFixed(0) + 'k';
  return s + v;
}

function fmtFullValue(v, currency = 'USD') {
  return v?.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

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
          Unrealized{' '}
          <span style={{ color: data.unrealized >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
            {fmtSigned(data.unrealized, 0, data.displayCurrency)}
          </span>{' '}
          ({fmtPct(data.unrealizedPct, 1)})
        </span>
        <span>·</span>
        <span>Cash {fmtCurrency(data.cash, 0, data.cashCurrency)}</span>
      </div>
      <div style={{ marginTop: 8, width: '100%', height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData ?? []} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="hero-spark-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#16a34a" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => fmtXTick(v, range)}
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={30}
            />
            <YAxis
              dataKey="value"
              tickFormatter={(v) => fmtKAxis(v, data.displayCurrency)}
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={50}
              domain={['dataMin', 'dataMax']}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: 'var(--text-muted)' }}
              formatter={(v) => [fmtFullValue(v, data.displayCurrency), 'Portfolio']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#16a34a"
              strokeWidth={2}
              fill="url(#hero-spark-fill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
