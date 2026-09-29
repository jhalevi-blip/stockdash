'use client';
// Per-ticker peer comparison — the full content of the old /peers page, driven by
// a `ticker` prop instead of its own holdings picker. Used as the Stock Research
// "Peers" tab. Unions all Finnhub metrics (valuation multiples + financial
// metrics) so nothing from the standalone page is lost.
import { useState, useEffect } from 'react';

const fmtNum = (n, d = 2) => (n != null ? n.toFixed(d) : '—');
const fmtPct = (n) => (n != null ? (n >= 0 ? '+' : '') + n.toFixed(1) + '%' : '—');
const fmtCap = (n) => {
  if (n == null) return '—';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'T';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'B';
  return '$' + n.toFixed(0) + 'M';
};

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

function getBestIdx(peers, key, lowerIsBetter) {
  const vals = peers.map(p => p[key]);
  const valid = vals.filter(v => v != null);
  if (valid.length === 0) return -1;
  const best = lowerIsBetter ? Math.min(...valid) : Math.max(...valid);
  return vals.findIndex(v => v === best);
}

function MetricRow({ label, peers, metricKey, fmt, lowerIsBetter }) {
  const bestIdx = getBestIdx(peers, metricKey, lowerIsBetter);
  return (
    <tr
      style={{ borderBottom: '1px solid var(--border-color)' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '9px 16px', color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap', background: 'var(--bg-card)' }}>
        {label}
      </td>
      {peers.map((p, i) => {
        const val = p[metricKey];
        const isBest = i === bestIdx && val != null;
        const isBase = p.isBase;
        return (
          <td key={i} style={{
            padding: '9px 12px', textAlign: 'right', fontSize: 12, fontFamily: 'monospace',
            fontWeight: isBase ? 700 : 400,
            color: isBest ? (lowerIsBetter ? '#b45309' : 'var(--positive)') : isBase ? 'var(--accent)' : 'var(--text-muted)',
            background: isBase
              ? 'rgba(37,99,235,0.08)'
              : isBest ? (lowerIsBetter ? 'rgba(180,83,9,0.06)' : 'rgba(22,163,74,0.06)') : 'transparent',
          }}>
            {fmt(val)}
          </td>
        );
      })}
    </tr>
  );
}

export default function PeersPanel({ ticker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('valuation');

  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoading(true); setError(null); setData(null);
    fetch(`/api/peers?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then(d => { if (cancelled) return; if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  if (loading) return <div className="chart-placeholder">Loading peer data for {ticker}…</div>;
  if (error) return (
    <div style={{ padding: 16, borderRadius: 6, fontSize: 12, background: 'color-mix(in srgb, var(--negative) 8%, transparent)', border: '1px solid var(--negative)', color: 'var(--negative)' }}>
      Couldn’t load peers right now.
    </div>
  );
  if (!data) return null;

  const metrics = tab === 'valuation' ? VALUATION_METRICS : FINANCIAL_METRICS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>COMPARING:</span>
        {data.map((p, i) => (
          <span key={i} style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 3,
            background: p.isBase ? 'rgba(31,111,235,0.15)' : 'var(--bg-secondary)',
            border: `1px solid ${p.isBase ? 'var(--accent)' : 'var(--border-color)'}`,
            color: p.isBase ? 'var(--accent-cyan)' : 'var(--text-muted)',
            fontWeight: p.isBase ? 700 : 400,
          }}>
            {p.ticker}{p.isBase && <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>YOU</span>}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>Best in class · SOURCE: FINNHUB</span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {[['valuation', 'Valuation Multiples'], ['financials', 'Financial Metrics']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            background: tab === key ? 'var(--accent-btn)' : 'var(--bg-secondary)',
            color: tab === key ? '#fff' : 'var(--text-secondary)',
            border: `1px solid ${tab === key ? 'var(--accent)' : 'var(--border-color)'}`,
            borderRadius: 4, padding: '6px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      <div className="dv2-valuation-scroll">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--bg-secondary)' }}>Metric</th>
              {data.map((p, i) => (
                <th key={i} style={{
                  padding: '10px 12px', textAlign: 'right', fontSize: 12, fontWeight: p.isBase ? 700 : 600,
                  color: p.isBase ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  background: p.isBase ? 'rgba(31,111,235,0.06)' : 'transparent', whiteSpace: 'nowrap',
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
              <MetricRow key={m.key} label={m.label} peers={data} metricKey={m.key} fmt={m.fmt} lowerIsBetter={m.lowerIsBetter} />
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
        Peers auto-suggested by Finnhub · Highlighted cell = best in class ·
        {tab === 'valuation' ? ' Lower multiples in gold · ' : ' Higher margins/returns in green · '}
        Data cached 24h
      </p>
    </div>
  );
}
