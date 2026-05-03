'use client';
import { SignUpButton } from '@clerk/nextjs';

export default function DTHoldingsTable({ holdings, selectedTicker, onSelect }) {
  return (
    <div style={{
      flex: 1, overflowX: 'auto',
      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Ticker', 'Shares', 'Cost', 'Price', 'Day %', 'P&L', 'Weight', 'Rating', ''].map((h, i) => (
              <th key={i} style={{
                padding: '8px 10px', fontSize: 10, textTransform: 'uppercase',
                letterSpacing: '0.07em', color: 'var(--text-secondary)',
                borderBottom: '1px solid var(--border-color)',
                textAlign: i === 0 ? 'left' : 'right',
                background: 'var(--bg-secondary)', whiteSpace: 'nowrap',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const selected = h.ticker === selectedTicker;
            return (
              <tr
                key={h.ticker}
                onClick={() => onSelect(h.ticker)}
                style={{ cursor: 'pointer', borderLeft: selected ? '2px solid var(--accent-cta)' : '2px solid transparent' }}
              >
                <td style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--accent-cta)', borderBottom: '1px solid var(--border-color)' }}>{h.ticker}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', fontVariantNumeric: 'tabular-nums' }}>{h.shares}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', fontVariantNumeric: 'tabular-nums' }}>${h.cost.toFixed(2)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', fontVariantNumeric: 'tabular-nums' }}>${h.price.toFixed(2)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-color)', fontVariantNumeric: 'tabular-nums', color: h.dayPct >= 0 ? 'var(--positive-bright)' : 'var(--negative-soft)' }}>
                  {h.dayPct >= 0 ? '+' : ''}{h.dayPct.toFixed(2)}%
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border-color)', fontVariantNumeric: 'tabular-nums', color: h.totalPnl >= 0 ? 'var(--positive-bright)' : 'var(--negative-soft)' }}>
                  {h.totalPnl >= 0 ? '+' : ''}${h.totalPnl.toLocaleString()}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', fontVariantNumeric: 'tabular-nums' }}>{h.weight}%</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', fontVariantNumeric: 'tabular-nums' }}>{h.rating}</td>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color)' }}>
                  <SignUpButton mode="modal">
                    <button style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 10px',
                      borderRadius: 'var(--radius)', border: '1px solid var(--border-color)',
                      background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                      Trade
                    </button>
                  </SignUpButton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
