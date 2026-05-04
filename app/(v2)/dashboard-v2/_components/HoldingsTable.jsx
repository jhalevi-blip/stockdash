'use client';

import { useState, useMemo } from 'react';
import Sparkline from '@/app/(v2)/_components/Sparkline';
import { HOLDINGS, TICKER_SPARKS } from '../_lib/mockData';
import { fmtCurrency, fmtPct, colorForChange } from '@/app/(v2)/_lib/format';

// Inline cell styles override bare `td { ... }` in globals.css.
const cellRight = (padY) => ({
  textAlign: 'right',
  padding: `${padY}px 10px`,
  borderBottom: '1px solid var(--border-color)',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text-primary)',
  background: 'transparent',
});

const cellLeft = (padY) => ({
  ...cellRight(padY),
  textAlign: 'left',
});

const headerCell = (align, padY) => ({
  textAlign: align,
  padding: `${padY}px 10px`,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)',
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap',
});

const COLUMNS = [
  { key: 'ticker',    label: 'Ticker',     align: 'left' },
  { key: 'shares',    label: 'Shares',     align: 'right' },
  { key: 'price',     label: 'Price',      align: 'right' },
  { key: 'change',    label: 'Chg %',      align: 'right' },
  { key: 'costBasis', label: 'Cost basis', align: 'right' },
  { key: 'mktValue',  label: 'Mkt value',  align: 'right' },
  { key: 'plDollar',  label: 'P&L $',      align: 'right' },
  { key: 'plPct',     label: 'P&L %',      align: 'right' },
  { key: 'spark',     label: '14D',        align: 'center' },
];

export default function HoldingsTable({
  rows = HOLDINGS,
  density = 'comfortable',
  onRowClick,
}) {
  const [sortKey, setSortKey] = useState('mktValue');
  const [sortDir, setSortDir] = useState('desc');
  const [filter, setFilter] = useState('');
  const padY = density === 'compact' ? 6 : 9;
  const fontSize = density === 'compact' ? 12 : 13;

  const sorted = useMemo(() => {
    const filtered = filter
      ? rows.filter(r =>
          r.ticker.toLowerCase().includes(filter.toLowerCase()) ||
          r.name.toLowerCase().includes(filter.toLowerCase())
        )
      : rows;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [rows, sortKey, sortDir, filter]);

  const toggle = (k) => {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 0 10px',
        flexWrap: 'wrap',
      }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter ticker…"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            padding: '6px 10px',
            color: 'var(--text-primary)',
            fontSize: 12,
            width: 160,
            fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {sorted.length} of {rows.length} positions
        </span>
      </div>
      <div style={{ overflowX: 'auto', margin: '0 -14px', padding: '0 14px' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize,
          fontVariantNumeric: 'tabular-nums',
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        }}>
          <thead>
            <tr>
              {COLUMNS.map(c => (
                <th
                  key={c.key}
                  onClick={() => c.key !== 'spark' && toggle(c.key)}
                  style={{
                    ...headerCell(c.align, padY),
                    cursor: c.key !== 'spark' ? 'pointer' : 'default',
                  }}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span style={{ marginLeft: 4, color: 'var(--accent)' }}>
                      {sortDir === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr
                key={r.ticker}
                onClick={() => onRowClick?.(r)}
                style={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background .2s',
                }}
              >
                <td style={cellLeft(padY)}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{
                      color: 'var(--accent)',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontWeight: 600,
                      fontSize: 12,
                    }}>{r.ticker}</span>
                    <span style={{
                      color: 'var(--text-muted)',
                      fontSize: 10,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 140,
                    }}>{r.name}</span>
                  </div>
                </td>
                <td style={cellRight(padY)}>{r.shares.toLocaleString()}</td>
                <td style={cellRight(padY)}>{fmtCurrency(r.price)}</td>
                <td style={{ ...cellRight(padY), color: colorForChange(r.change) }}>
                  {fmtPct(r.change)}
                </td>
                <td style={cellRight(padY)}>{fmtCurrency(r.costBasis)}</td>
                <td style={cellRight(padY)}>{fmtCurrency(r.mktValue, 0)}</td>
                <td style={{ ...cellRight(padY), color: colorForChange(r.plDollar) }}>
                  {(r.plDollar >= 0 ? '+$' : '-$') +
                    Math.abs(r.plDollar).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </td>
                <td style={{
                  ...cellRight(padY),
                  color: colorForChange(r.plPct),
                  fontWeight: 600,
                }}>
                  {fmtPct(r.plPct, 1)}
                </td>
                <td style={{
                  ...cellRight(padY),
                  textAlign: 'center',
                  padding: `${padY - 4}px 10px`,
                }}>
                  <Sparkline
                    data={TICKER_SPARKS[r.ticker] || []}
                    width={70}
                    height={22}
                    strokeWidth={1.3}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
