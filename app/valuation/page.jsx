'use client';
import { useEffect, useState } from 'react';
import DemoPrompt from '@/components/DemoPrompt';
import { getDemoTickers } from '@/lib/startDemo';

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
      let ts = holdings.map(h => h.t);
      if (!ts.length && localStorage.getItem('stockdash_demo') === 'true') ts = getDemoTickers();
      const tickers = ts.join(',');
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

  const sortTh = (key, label) => {
    const active = sortKey === key;
    return (
      <th
        onClick={() => handleSort(key)}
        style={{
          cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
          padding: '10px 16px', fontSize: 12, fontWeight: 600,
          color: active ? '#22d3ee' : undefined,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {label}
          <span style={{ fontSize: 14, lineHeight: 1, color: active ? '#22d3ee' : 'rgba(255,255,255,0.3)' }}>
            {active ? (sortAsc ? '↑' : '↓') : '↕'}
          </span>
        </span>
      </th>
    );
  };

  return (
    <main style={{ padding: '20px 24px' }}>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Valuation Metrics</div>
        <div style={{ fontSize: 11, color: '#8b949e' }}>Click any column header to sort · TTM = Trailing Twelve Months</div>
      </div>

      {loading && <div className="chart-placeholder">Loading valuation metrics…</div>}

      {!loading && data.length === 0 && <DemoPrompt message="No holdings to display" />}

      {!loading && data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="left">Ticker</th>
                <th className="left">Name</th>
                {sortTh('marketCap',  'Market Cap')}
                {sortTh('peRatio',    'P/E')}
                {sortTh('forwardPE',  'Fwd P/E')}
                {sortTh('psRatio',    'P/S')}
                {sortTh('pbRatio',    'P/B')}
                {sortTh('evEbitda',   'EV/EBITDA')}
                {sortTh('debtEquity', 'Debt/Equity')}
                {sortTh('roe',        'ROE')}
                {sortTh('roa',        'ROA')}
                {sortTh('grossMargin','Gross Margin')}
                {sortTh('netMargin',  'Net Margin')}
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