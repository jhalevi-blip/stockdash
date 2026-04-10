'use client';
import DemoPrompt from '@/components/DemoPrompt';
import { useState, useEffect } from 'react';
import { getDemoTickers } from '@/lib/startDemo';

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtNum  = (n, d = 2) => n != null ? n.toFixed(d) : '—';
const fmtPct  = (n) => n != null ? (n >= 0 ? '+' : '') + n.toFixed(1) + '%' : '—';
const fmtCap  = (n) => {
  if (n == null) return '—';
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'T';
  if (n >= 1e3)  return '$' + (n / 1e3).toFixed(2) + 'B';
  return '$' + n.toFixed(0) + 'M';
};

// ── Metric definitions ────────────────────────────────────────────────────────
const VALUATION_METRICS = [
  { key: 'marketCap',   label: 'Market Cap',    fmt: fmtCap,                lowerIsBetter: false },
  { key: 'peRatio',     label: 'P/E (TTM)',      fmt: n => fmtNum(n, 1)+'x', lowerIsBetter: true  },
  { key: 'forwardPE',   label: 'Forward P/E',    fmt: n => fmtNum(n, 1)+'x', lowerIsBetter: true  },
  { key: 'psRatio',     label: 'P/S',            fmt: n => fmtNum(n, 1)+'x', lowerIsBetter: true  },
  { key: 'pbRatio',     label: 'P/B',            fmt: n => fmtNum(n, 1)+'x', lowerIsBetter: true  },
  { key: 'evEbitda',    label: 'EV/EBITDA',      fmt: n => fmtNum(n, 1)+'x', lowerIsBetter: true  },
  { key: 'beta',        label: 'Beta',           fmt: n => fmtNum(n, 2),     lowerIsBetter: true  },
];

const FINANCIAL_METRICS = [
  { key: 'revenueGrowth', label: 'Revenue Growth YoY', fmt: fmtPct,              lowerIsBetter: false },
  { key: 'grossMargin',   label: 'Gross Margin',        fmt: n => fmtNum(n,1)+'%', lowerIsBetter: false },
  { key: 'netMargin',     label: 'Net Margin',          fmt: n => fmtNum(n,1)+'%', lowerIsBetter: false },
  { key: 'roe',           label: 'ROE',                 fmt: n => fmtNum(n,1)+'%', lowerIsBetter: false },
  { key: 'roa',           label: 'ROA',                 fmt: n => fmtNum(n,1)+'%', lowerIsBetter: false },
  { key: 'debtEquity',    label: 'Debt / Equity',       fmt: n => fmtNum(n,2)+'x', lowerIsBetter: true  },
];

// ── Cell highlight: best value in row gets green tint ─────────────────────────
function getBestIdx(peers, key, lowerIsBetter) {
  const vals = peers.map(p => p[key]);
  const valid = vals.filter(v => v != null);
  if (valid.length === 0) return -1;
  const best = lowerIsBetter ? Math.min(...valid) : Math.max(...valid);
  return vals.findIndex(v => v === best);
}

// ── Metric Row ────────────────────────────────────────────────────────────────
function MetricRow({ label, peers, metricKey, fmt, lowerIsBetter }) {
  const bestIdx = getBestIdx(peers, metricKey, lowerIsBetter);
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '9px 16px', color: '#8b949e', fontSize: 12, whiteSpace: 'nowrap' }}>
        {label}
      </td>
      {peers.map((p, i) => {
        const val     = p[metricKey];
        const isBest  = i === bestIdx && val != null;
        const isBase  = p.isBase;
        return (
          <td key={i} style={{
            padding: '9px 12px',
            textAlign: 'right',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: isBase ? 700 : 400,
color: isBest
  ? (lowerIsBetter ? '#b45309' : '#15803d')
  : isBase ? '#1e3a8a' : '#6b7280',
background: isBase
  ? 'rgba(37,99,235,0.08)'
  : isBest ? 'rgba(22,163,74,0.06)' : 'transparent',
          }}>
            {fmt(val)}
          </td>
        );
      })}
    </tr>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PeersPage() {
  const [tickers, setTickers] = useState([]);
  const [ticker,  setTicker]  = useState(null);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [tab,     setTab]     = useState('valuation');

  const load = async (t) => {
    setTicker(t);
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/peers?ticker=${t}`);
      const d   = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      let ts = holdings.map(h => h.t);
      if (!ts.length && localStorage.getItem('stockdash_demo') === 'true') ts = getDemoTickers();
      setTickers(ts);
      if (ts.length) load(ts[0]);
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const metrics = tab === 'valuation' ? VALUATION_METRICS : FINANCIAL_METRICS;

  return (
    <main style={{ padding: '20px 24px' }}>
      {/* Ticker selector */}
      <div style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Peer Comparison</div>
        {tickers.length === 0 ? (
          <DemoPrompt message="Add stocks to your portfolio to use peer comparison" />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tickers.map(t => (
              <button key={t} onClick={() => load(t)} style={{
                background: ticker === t ? '#1f6feb' : '#21262d',
                color:      ticker === t ? '#fff'    : '#c9d1d9',
                border:     `1px solid ${ticker === t ? '#58a6ff' : '#30363d'}`,
                borderRadius: 4, padding: '6px 14px', fontSize: 12,
                fontWeight: 600, cursor: 'pointer',
              }}>{t}</button>
            ))}
          </div>
        )}
      </div>

      {/* States */}
      {tickers.length > 0 && !data && !loading && !error && (
        <div className="chart-placeholder">Select a stock to compare against its peers</div>
      )}
      {loading && (
        <div className="chart-placeholder">Loading peer data for {ticker}…</div>
      )}
      {error && (
        <div style={{
          padding: '16px', borderRadius: 6, fontSize: 12,
          background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)',
          color: '#f85149', marginBottom: 16,
        }}>
          Error: {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* Peer names header */}
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#555', marginRight: 4 }}>COMPARING:</span>
            {data.map((p, i) => (
              <span key={i} style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 3,
                background: p.isBase ? 'rgba(31,111,235,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${p.isBase ? '#1f6feb' : '#30363d'}`,
color: p.isBase ? '#1e3a8a' : '#6b7280',
                fontWeight: p.isBase ? 700 : 400,
              }}>
                {p.ticker}
                {p.isBase && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>YOU</span>}
              </span>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#444' }}>
              🟢 Best in class · SOURCE: FINNHUB
            </span>
          </div>

          {/* Tab buttons */}
          <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
            {[['valuation', 'Valuation Multiples'], ['financials', 'Financial Metrics']].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                background: tab === key ? '#1f6feb' : '#21262d',
                color:      tab === key ? '#fff'    : '#c9d1d9',
                border:     `1px solid ${tab === key ? '#58a6ff' : '#30363d'}`,
                borderRadius: 4, padding: '6px 16px', fontSize: 12,
                fontWeight: 600, cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>

          {/* Comparison table */}
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th style={{
                    padding: '10px 16px', textAlign: 'left',
                    fontSize: 12, color: '#8b949e',
                    fontWeight: 600, whiteSpace: 'nowrap',
                  }}>Metric</th>
                  {data.map((p, i) => (
                    <th key={i} style={{
                      padding: '10px 12px', textAlign: 'right',
                      fontSize: 12, fontWeight: p.isBase ? 700 : 600,
                      color: p.isBase ? '#22d3ee' : '#8b949e',
                      background: p.isBase ? 'rgba(31,111,235,0.06)' : 'transparent',
                      whiteSpace: 'nowrap',
                    }}>
                      {p.ticker}
                      <div style={{ fontSize: 9, color: '#555', fontWeight: 400, marginTop: 2 }}>
                        {p.name?.split(' ').slice(0, 2).join(' ')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map(m => (
                  <MetricRow
                    key={m.key}
                    label={m.label}
                    peers={data}
                    metricKey={m.key}
                    fmt={m.fmt}
                    lowerIsBetter={m.lowerIsBetter}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ marginTop: 12, fontSize: 10, color: '#444', letterSpacing: '0.04em' }}>
            Peers auto-suggested by Finnhub · Highlighted cell = best in class for that metric ·
            {tab === 'valuation' ? ' Lower multiples highlighted in gold · ' : ' Higher margins/returns highlighted in green · '}
            Data cached 24h
          </p>
        </>
      )}
    </main>
  );
}
