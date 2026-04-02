'use client';
import { useEffect, useState } from 'react';

const f = (n, d=2) => n?.toLocaleString('en-US', { minimumFractionDigits:d, maximumFractionDigits:d }) ?? '—';
const pct = n => n == null ? '—' : n.toFixed(1) + '%';
const mcap = n => {
  if (n == null) return '—';
  if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(2) + 'M';
  return '$' + n.toFixed(0);
};

const SORT_OPTIONS = [
  ['peRatio',   'P/E'],
  ['psRatio',   'P/S'],
  ['pbRatio',   'P/B'],
  ['evEbitda',  'EV/EBITDA'],
  ['roe',       'ROE'],
  ['netMargin', 'Net Margin'],
];

export default function ValuationPage() {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('peRatio');
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      const tickers = holdings.map(h => h.t).join(',');
      if (!tickers) { setLoading(false); return; }
      fetch(`/api/valuation?tickers=${tickers}`)
        .then(r => r.json())
        .then(d => setData(Array.isArray(d) ? d : []))
        .finally(() => setLoading(false));
    } catch { setLoading(false); }
  }, []);

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey] ?? (sortAsc ? Infinity : -Infinity);
    const bv = b[sortKey] ?? (sortAsc ? Infinity : -Infinity);
    return sortAsc ? av - bv : bv - av;
  });

  const thStyle = (key) => ({
    cursor: 'pointer',
    color: sortKey === key ? '#58a6ff' : '#8b949e',
    userSelect: 'none',
  });

  return (
    <main style={{ padding: '20px 24px' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Valuation Metrics</div>
        <div style={{ fontSize: 11, color: '#8b949e' }}>Click any column header to sort · TTM = Trailing Twelve Months</div>
      </div>

      {loading && <div className="chart-placeholder">Loading valuation metrics…</div>}

      {!loading && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="left">Ticker</th>
                <th className="left">Name</th>
                <th style={thStyle('marketCap')} onClick={() => handleSort('marketCap')}>
                  Market Cap {sortKey === 'marketCap' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={thStyle('peRatio')} onClick={() => handleSort('peRatio')}>
                  P/E {sortKey === 'peRatio' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={thStyle('forwardPE')} onClick={() => handleSort('forwardPE')}>
                  Fwd P/E {sortKey === 'forwardPE' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={thStyle('psRatio')} onClick={() => handleSort('psRatio')}>
                  P/S {sortKey === 'psRatio' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={thStyle('pbRatio')} onClick={() => handleSort('pbRatio')}>
                  P/B {sortKey === 'pbRatio' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={thStyle('evEbitda')} onClick={() => handleSort('evEbitda')}>
                  EV/EBITDA {sortKey === 'evEbitda' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={thStyle('debtEquity')} onClick={() => handleSort('debtEquity')}>
                  Debt/Equity {sortKey === 'debtEquity' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={thStyle('roe')} onClick={() => handleSort('roe')}>
                  ROE {sortKey === 'roe' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={thStyle('roa')} onClick={() => handleSort('roa')}>
                  ROA {sortKey === 'roa' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={thStyle('grossMargin')} onClick={() => handleSort('grossMargin')}>
                  Gross Margin {sortKey === 'grossMargin' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
                <th style={thStyle('netMargin')} onClick={() => handleSort('netMargin')}>
                  Net Margin {sortKey === 'netMargin' ? (sortAsc ? '▲' : '▼') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i}>
                  <td className="tkr left">{r.ticker}</td>
                  <td className="left" style={{ fontSize: 12 }}>{r.name}</td>
                  <td className="neutral">{mcap(r.marketCap)}</td>
                  <td className="neutral">{r.peRatio != null ? f(r.peRatio, 1) : '—'}</td>
                  <td className="neutral">{r.forwardPE != null ? f(r.forwardPE, 1) : '—'}</td>
                  <td className="neutral">{r.psRatio != null ? f(r.psRatio, 1) : '—'}</td>
                  <td className="neutral">{r.pbRatio != null ? f(r.pbRatio, 1) : '—'}</td>
                  <td className="neutral">{r.evEbitda != null ? f(r.evEbitda, 1) : '—'}</td>
                  <td className={r.debtEquity > 2 ? 'neg' : 'neutral'}>{r.debtEquity != null ? f(r.debtEquity, 2) : '—'}</td>
                  <td className={r.roe > 0 ? 'pos' : r.roe < 0 ? 'neg' : 'neutral'}>{pct(r.roe)}</td>
                  <td className={r.roa > 0 ? 'pos' : r.roa < 0 ? 'neg' : 'neutral'}>{pct(r.roa)}</td>
                  <td className={r.grossMargin > 0.4 ? 'pos' : 'neutral'}>{pct(r.grossMargin)}</td>
                  <td className={r.netMargin > 0 ? 'pos' : r.netMargin < 0 ? 'neg' : 'neutral'}>{pct(r.netMargin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="note" style={{ marginTop: 12 }}>All metrics are TTM (Trailing Twelve Months) · Click column headers to sort · Data via FMP</p>
    </main>
  );
}