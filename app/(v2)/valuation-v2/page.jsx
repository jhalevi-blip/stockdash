'use client';
import { useEffect, useState } from 'react';
import Card from '@/app/(v2)/_components/Card';
import DemoPrompt from '@/components/DemoPrompt';
import { getDemoTickers } from '@/lib/startDemo';

/* ─── Formatters (identical to V1) ─────────────────────────────────────── */
const f    = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const pct  = n => n == null ? '—' : n.toFixed(1) + '%';
const mcap = n => {
  if (n == null)   return '—';
  if (n >= 1e12)   return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)    return '$' + (n / 1e9).toFixed(2)  + 'B';
  if (n >= 1e6)    return '$' + (n / 1e6).toFixed(2)  + 'M';
  return '$' + n.toFixed(0);
};

/* ─── Column definitions ────────────────────────────────────────────────── */
const COLUMNS = [
  // [sortKey, label, renderFn, colorFn]
  // Ticker and Name are non-sortable; handled separately in the header/row
  ['marketCap',   'Market Cap',   r => mcap(r.marketCap),                                          () => 'neutral'],
  ['peRatio',     'P/E',          r => r.peRatio    != null ? f(r.peRatio,    1) : '—',             () => 'neutral'],
  ['forwardPE',   'Fwd P/E',      r => r.forwardPE  != null ? f(r.forwardPE,  1) : '—',             () => 'neutral'],
  ['psRatio',     'P/S',          r => r.psRatio    != null ? f(r.psRatio,    1) : '—',             () => 'neutral'],
  ['pbRatio',     'P/B',          r => r.pbRatio    != null ? f(r.pbRatio,    1) : '—',             () => 'neutral'],
  ['evEbitda',    'EV/EBITDA',    r => r.evEbitda   != null ? f(r.evEbitda,   1) : '—',             () => 'neutral'],
  ['debtEquity',  'Debt/Eq',      r => r.debtEquity != null ? f(r.debtEquity, 2) : '—',             r  => r.debtEquity > 2 ? 'neg' : 'neutral'],
  ['roe',         'ROE',          r => pct(r.roe),                                                   r  => r.roe > 0 ? 'pos' : r.roe < 0 ? 'neg' : 'neutral'],
  ['roa',         'ROA',          r => pct(r.roa),                                                   r  => r.roa > 0 ? 'pos' : r.roa < 0 ? 'neg' : 'neutral'],
  ['grossMargin', 'Gross Mgn',    r => pct(r.grossMargin),                                           r  => r.grossMargin > 0.4 ? 'pos' : 'neutral'],
  ['netMargin',   'Net Mgn',      r => pct(r.netMargin),                                             r  => r.netMargin > 0 ? 'pos' : r.netMargin < 0 ? 'neg' : 'neutral'],
];

/* ─── Colour map for cell classes → inline colour values ────────────────── */
const COLOR = {
  pos:     'var(--positive)',
  neg:     'var(--negative)',
  neutral: 'var(--text-secondary)',
};

export default function ValuationV2Page() {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('peRatio');
  const [sortAsc, setSortAsc] = useState(true);

  /* ─── Data fetch (identical logic to V1) ───────────────────────────── */
  useEffect(() => {
    try {
      const stored   = localStorage.getItem('stockdash_holdings');
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

  /* ─── Sort ──────────────────────────────────────────────────────────── */
  const handleSort = key => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey] ?? (sortAsc ? Infinity : -Infinity);
    const bv = b[sortKey] ?? (sortAsc ? Infinity : -Infinity);
    return sortAsc ? av - bv : bv - av;
  });

  /* ─── Shared th style (static portion — active colour applied inline) ─ */
  const thBase = {
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    padding: '12px 14px',   // 12px vertical gives ~44px row height on mobile — tap-friendly
    fontSize: 11,
    fontWeight: 600,
    textAlign: 'right',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-color)',
  };

  const tdBase = {
    padding: '10px 14px',
    textAlign: 'right',
    borderBottom: '1px solid var(--border-color)',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
    fontSize: 13,
  };

  return (
    <div style={{
      padding: '18px 20px',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>

      {/* ── Page heading ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 2 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4,
        }}>
          Analysis
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          Valuation metrics
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 600 }}>
          Key valuation and profitability ratios for your portfolio holdings.
          Click any column header to sort. All metrics are TTM (Trailing Twelve Months).
        </p>
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {loading && (
        <Card padding="14px">
          <div className="chart-placeholder">Loading valuation metrics…</div>
        </Card>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {!loading && data.length === 0 && (
        <Card padding="14px">
          <DemoPrompt message="No holdings to display" />
        </Card>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      {!loading && data.length > 0 && (
        <Card padding="0">
          <div className="dv2-valuation-scroll">
            <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {/* Ticker — non-sortable, sticky on mobile */}
                  <th style={{ ...thBase, textAlign: 'left', paddingLeft: 16, minWidth: 72 }}>
                    Ticker
                  </th>
                  {/* Name — non-sortable */}
                  <th style={{ ...thBase, textAlign: 'left', minWidth: 120 }}>
                    Name
                  </th>
                  {/* Sortable metric columns */}
                  {COLUMNS.map(([key, label]) => {
                    const active = sortKey === key;
                    return (
                      <th
                        key={key}
                        onClick={() => handleSort(key)}
                        style={{
                          ...thBase,
                          color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                        }}
                      >
                        {label} {active ? (sortAsc ? '↑' : '↓') : '↕'}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    {/* Ticker — sticky on mobile */}
                    <td style={{
                      ...tdBase,
                      textAlign: 'left',
                      paddingLeft: 16,
                      fontWeight: 700,
                      color: 'var(--accent)',
                    }}>
                      {r.ticker}
                    </td>
                    {/* Name */}
                    <td style={{ ...tdBase, textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {r.name}
                    </td>
                    {/* Metric cells */}
                    {COLUMNS.map(([key, , renderFn, colorFn]) => (
                      <td key={key} style={{ ...tdBase, color: COLOR[colorFn(r)] }}>
                        {renderFn(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Footer disclaimer ───────────────────────────────────────────── */}
      {!loading && (
        <div style={{
          marginTop: 8,
          padding: '14px 0 24px',
          color: 'var(--text-faint, rgba(230,237,243,0.45))',
          fontSize: 11,
          textAlign: 'center',
          borderTop: '1px solid var(--border-section, var(--border-color))',
        }}>
          All metrics are TTM (Trailing Twelve Months) · Data via Finnhub and FMP ·
          StockDashes is for informational purposes only and does not constitute financial advice
        </div>
      )}

    </div>
  );
}
