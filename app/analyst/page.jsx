'use client';
import { useEffect, useState } from 'react';
import { DEMO_FALLBACK } from '@/lib/startDemo';

const fmtPct = (n, d = 2) =>
  n != null ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%' : '—';

const fmtShares = (n) => {
  if (n == null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
};

const fmtNum = (n, d = 2) =>
  n != null ? n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';

function getSIColor(pct) {
  if (pct == null) return '#8b949e';
  if (pct > 0.20) return '#f85149';
  if (pct < 0.05) return '#3fb950';
  return '#c9d1d9';
}

const COLS = [
  { key: 'ticker',              label: 'Ticker',              align: 'left'  },
  { key: 'shortPercentOfFloat', label: 'Short % of Float',    align: 'right' },
  { key: 'sharesShort',         label: 'Shares Short',        align: 'right' },
  { key: 'shortRatio',          label: 'Short Ratio (DTC)',   align: 'right' },
  { key: 'sharesShortPriorMonth', label: 'Prev Shares Short', align: 'right' },
  { key: 'siChange',            label: 'Change (MoM)',        align: 'right' },
];

export default function AnalystPage() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('shortPercentOfFloat');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    let tickers = [];
    try {
      const stored = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      tickers = holdings.map(h => h.t);
    } catch {}
    if (!tickers.length) tickers = DEMO_FALLBACK;

    fetch(`/api/short-interest-data?tickers=${tickers.join(',')}`)
      .then(r => r.json())
      .then(d => {
        if (!Array.isArray(d)) return;
        setRows(d);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? (sortDir === 'desc' ? -Infinity : Infinity);
    const bv = b[sortKey] ?? (sortDir === 'desc' ? -Infinity : Infinity);
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  return (
    <main style={{ padding: '20px 24px' }}>
      <div className="section-title" style={{ marginBottom: 16 }}>Short Interest</div>

      {loading && <div className="chart-placeholder">Loading short interest data…</div>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {COLS.map(c => {
                  const active = sortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      className={c.align === 'left' ? 'left' : ''}
                      onClick={() => handleSort(c.key)}
                      style={{
                        cursor: 'pointer',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                        padding: '10px 16px',
                        fontSize: 12,
                        fontWeight: 600,
                        color: active ? '#22d3ee' : 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {c.label} {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const siColor = getSIColor(r.shortPercentOfFloat);
                const changeColor = r.siChange == null ? '#8b949e' : r.siChange > 0 ? '#f85149' : '#3fb950';
                return (
                  <tr key={i}>
                    <td className="tkr left">{r.ticker}</td>
                    <td style={{ textAlign: 'right', color: siColor, fontWeight: 700 }}>
                      {fmtPct(r.shortPercentOfFloat != null ? r.shortPercentOfFloat * 100 : null)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmtShares(r.sharesShort)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(r.shortRatio)}</td>
                    <td style={{ textAlign: 'right', color: '#8b949e' }}>{fmtShares(r.sharesShortPriorMonth)}</td>
                    <td style={{ textAlign: 'right', color: changeColor, fontWeight: 600 }}>
                      {r.siChange != null ? (r.siChange > 0 ? '+' : '') + fmtNum(r.siChange) + '%' : '—'}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#8b949e' }}>
                    No short interest data available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="note" style={{ marginTop: 12 }}>
        <span style={{ color: '#f85149' }}>■</span> &gt;20% short float (high) ·{' '}
        <span style={{ color: '#3fb950' }}>■</span> &lt;5% short float (low) ·
        Change = month-over-month shares short · Data from Yahoo Finance
      </p>
    </main>
  );
}
