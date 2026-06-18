'use client';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import DemoPrompt from '@/components/DemoPrompt';
import { getDemoTickers } from '@/lib/startDemo';
import { getCachedHoldings } from '@/lib/holdingsStorage';

/* ─── Formatters (identical to V1) ─────────────────────────────────────── */
const fmtNum = (n, d = 2) => n != null ? n.toFixed(d) : '—';
const fmtPct = (n) => n != null ? (n >= 0 ? '+' : '') + n.toFixed(1) + '%' : '—';
const fmtCap = (n) => {
  if (n == null) return '—';
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'T';
  if (n >= 1e3)  return '$' + (n / 1e3).toFixed(2) + 'B';
  return '$' + n.toFixed(0) + 'M';
};

/* ─── Metric definitions (identical to V1) ──────────────────────────────── */
const VALUATION_METRICS = [
  { key: 'marketCap', label: 'Market Cap',  fmt: fmtCap,                lowerIsBetter: false },
  { key: 'peRatio',   label: 'P/E (TTM)',   fmt: n => fmtNum(n, 1)+'x', lowerIsBetter: true  },
  { key: 'forwardPE', label: 'Forward P/E', fmt: n => fmtNum(n, 1)+'x', lowerIsBetter: true  },
  { key: 'psRatio',   label: 'P/S',         fmt: n => fmtNum(n, 1)+'x', lowerIsBetter: true  },
  { key: 'pbRatio',   label: 'P/B',         fmt: n => fmtNum(n, 1)+'x', lowerIsBetter: true  },
  { key: 'evEbitda',  label: 'EV/EBITDA',   fmt: n => fmtNum(n, 1)+'x', lowerIsBetter: true  },
  { key: 'beta',      label: 'Beta',        fmt: n => fmtNum(n, 2),     lowerIsBetter: true  },
];

const FINANCIAL_METRICS = [
  { key: 'revenueGrowth', label: 'Revenue Growth YoY', fmt: fmtPct,               lowerIsBetter: false },
  { key: 'grossMargin',   label: 'Gross Margin',        fmt: n => fmtNum(n,1)+'%', lowerIsBetter: false },
  { key: 'netMargin',     label: 'Net Margin',          fmt: n => fmtNum(n,1)+'%', lowerIsBetter: false },
  { key: 'roe',           label: 'ROE',                 fmt: n => fmtNum(n,1)+'%', lowerIsBetter: false },
  { key: 'roa',           label: 'ROA',                 fmt: n => fmtNum(n,1)+'%', lowerIsBetter: false },
  { key: 'debtEquity',    label: 'Debt / Equity',       fmt: n => fmtNum(n,2)+'x', lowerIsBetter: true  },
];

/* ─── Best-in-class: index of best value in each row ───────────────────── */
function getBestIdx(peers, key, lowerIsBetter) {
  const vals  = peers.map(p => p[key]);
  const valid = vals.filter(v => v != null);
  if (valid.length === 0) return -1;
  const best = lowerIsBetter ? Math.min(...valid) : Math.max(...valid);
  return vals.findIndex(v => v === best);
}

/* ─── Metric row ────────────────────────────────────────────────────────── */
function MetricRow({ label, peers, metricKey, fmt, lowerIsBetter }) {
  const bestIdx = getBestIdx(peers, metricKey, lowerIsBetter);
  return (
    <tr
      style={{ borderBottom: '1px solid var(--border-color)' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {/* Metric label — first child, sticky on mobile via dv2-valuation-scroll */}
      <td style={{ padding: '9px 16px', color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>
        {label}
      </td>
      {peers.map((p, i) => {
        const val    = p[metricKey];
        const isBest = i === bestIdx && val != null;
        const isBase = p.isBase;
        return (
          <td key={i} style={{
            padding: '9px 12px',
            textAlign: 'right',
            fontSize: 12,
            fontFamily: 'monospace',
            fontWeight: isBase ? 700 : 400,
            // Best-in-class: green (higher-is-better) or amber/gold (lower-is-better)
            // Base column always gets accent color regardless of best status
            color: isBest
              ? (lowerIsBetter ? '#b45309' : 'var(--positive)')
              : isBase ? 'var(--accent)' : 'var(--text-muted)',
            background: isBase
              ? 'rgba(37,99,235,0.08)'
              : isBest
                ? (lowerIsBetter ? 'rgba(180,83,9,0.06)' : 'rgba(22,163,74,0.06)')
                : 'transparent',
          }}>
            {fmt(val)}
          </td>
        );
      })}
    </tr>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function PeersV2Page() {
  const { isLoaded, user } = useUser();
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
    if (!isLoaded) return; // wait for Clerk so a signed-in user's tickers aren't blanked
    try {
      const holdings = getCachedHoldings(user?.id);
      let ts = holdings.map(h => h.t);
      if (!ts.length && localStorage.getItem('stockdash_demo') === 'true') ts = getDemoTickers();
      setTickers(ts);
      if (ts.length) load(ts[0]);
    } catch {}
  }, [isLoaded, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const metrics = tab === 'valuation' ? VALUATION_METRICS : FINANCIAL_METRICS;

  return (
    <div style={{
      padding: '18px 20px',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>

      {/* ── Page heading ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 2 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4,
        }}>
          Analysis
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          Peers
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 600 }}>
          Compare valuation multiples and financial metrics against Finnhub-suggested peer companies
        </p>
      </div>

      {/* ── Ticker picker ────────────────────────────────────────────────── */}
      <div>
        {tickers.length === 0 ? (
          <DemoPrompt message="Add stocks to your portfolio to use peer comparison" />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tickers.map(t => (
              <button key={t} onClick={() => load(t)} style={{
                background: ticker === t ? '#1f6feb'              : 'var(--bg-secondary)',
                color:      ticker === t ? '#fff'                 : 'var(--text-secondary)',
                border:     `1px solid ${ticker === t ? '#58a6ff' : 'var(--border-color)'}`,
                borderRadius: 4, padding: '6px 14px', fontSize: 12,
                fontWeight: 600, cursor: 'pointer',
              }}>{t}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── State placeholders ───────────────────────────────────────────── */}
      {tickers.length > 0 && !data && !loading && !error && (
        <div className="chart-placeholder">Select a stock to compare against its peers</div>
      )}
      {loading && (
        <div className="chart-placeholder">Loading peer data for {ticker}…</div>
      )}
      {error && (
        <div style={{
          padding: '16px', borderRadius: 6, fontSize: 12, marginBottom: 4,
          background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)',
          color: 'var(--negative)',
        }}>
          Error: {error}
        </div>
      )}

      {/* ── Data view ────────────────────────────────────────────────────── */}
      {data && !loading && (
        <>
          {/* COMPARING pill strip */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>COMPARING:</span>
            {data.map((p, i) => (
              <span key={i} style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 3,
                background: p.isBase ? 'rgba(31,111,235,0.15)' : 'var(--bg-secondary)',
                border:     `1px solid ${p.isBase ? '#58a6ff' : 'var(--border-color)'}`,
                color:      p.isBase ? 'var(--accent-cyan)'   : 'var(--text-muted)',
                fontWeight: p.isBase ? 700 : 400,
              }}>
                {p.ticker}
                {p.isBase && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>YOU</span>}
              </span>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
              🟢 Best in class · SOURCE: FINNHUB
            </span>
          </div>

          {/* Tab buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[['valuation', 'Valuation Multiples'], ['financials', 'Financial Metrics']].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{
                background: tab === key ? '#1f6feb'              : 'var(--bg-secondary)',
                color:      tab === key ? '#fff'                 : 'var(--text-secondary)',
                border:     `1px solid ${tab === key ? '#58a6ff' : 'var(--border-color)'}`,
                borderRadius: 4, padding: '6px 16px', fontSize: 12,
                fontWeight: 600, cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>

          {/* Comparison table
              dv2-valuation-scroll: overflow-x: auto on all viewports;
              at ≤768px pins th:first-child / td:first-child (the Metric label column) */}
          <div className="dv2-valuation-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  {/* First-child th — sticky on mobile, must have explicit bg to cover scroll */}
                  <th style={{
                    padding: '10px 16px', textAlign: 'left',
                    fontSize: 12, color: 'var(--text-secondary)',
                    fontWeight: 600, whiteSpace: 'nowrap',
                    background: 'var(--bg-secondary)',
                  }}>Metric</th>
                  {data.map((p, i) => (
                    <th key={i} style={{
                      padding: '10px 12px', textAlign: 'right',
                      fontSize: 12, fontWeight: p.isBase ? 700 : 600,
                      color:      p.isBase ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      background: p.isBase ? 'rgba(31,111,235,0.06)' : 'transparent',
                      whiteSpace: 'nowrap',
                    }}>
                      {p.ticker}
                      <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
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

          <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            Peers auto-suggested by Finnhub · Highlighted cell = best in class for that metric ·
            {tab === 'valuation' ? ' Lower multiples highlighted in gold · ' : ' Higher margins/returns highlighted in green · '}
            Data cached 24h
          </p>
        </>
      )}
    </div>
  );
}
