'use client';
import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { DEMO_FALLBACK } from '@/lib/startDemo';

/* ─── Formatter ─────────────────────────────────────────────────────────── */
const fmt = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';

/* ─── Cell color helpers ─────────────────────────────────────────────────── */
function getUpsideColor(pct) {
  if (pct == null) return 'var(--text-muted)';
  if (pct >= 20)   return '#3fb950';
  if (pct >= 0)    return '#79c0ff';
  return '#f85149';
}
function getSIColor(pct) {
  if (pct == null) return 'var(--text-muted)';
  if (pct > 20)    return '#f85149';
  if (pct < 5)     return '#3fb950';
  return 'var(--text-secondary)';
}
function getMoMColor(v) {
  if (v == null) return 'var(--text-muted)';
  return v > 0 ? '#f85149' : '#3fb950';
}

/* ─── Column definitions ────────────────────────────────────────────────── */
const COLUMNS = [
  { key: 'ticker',            label: 'Ticker',        align: 'left'  },
  { key: 'name',              label: 'Name',          align: 'left'  },
  { key: 'price',             label: 'Price',         align: 'right' },
  { key: 'lastQuarterTarget', label: 'Target',        align: 'right' },
  { key: 'upside',            label: 'Upside %',      align: 'right' },
  { key: 'shortPct',          label: 'Short % Float', align: 'right' },
  { key: 'shortRatio',        label: 'Days to Cover', align: 'right' },
  { key: 'siChange',          label: 'MoM Change',    align: 'right' },
];

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function RatingsAndShortsV2Page() {
  const { isLoaded, isSignedIn } = useUser();
  const [rows,        setRows]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [sortKey,     setSortKey]     = useState('upside');
  const [sortDir,     setSortDir]     = useState('desc');
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let tickers = [];
    try {
      const stored = localStorage.getItem('stockdash_holdings');
      const holdings = stored ? JSON.parse(stored) : [];
      tickers = holdings.map(h => h.t);
    } catch {}
    if (!tickers.length) tickers = DEMO_FALLBACK;
    const tp = tickers.join(',');

    Promise.all([
      fetch(`/api/short-interest?tickers=${tp}`).then(r => r.json()),
      fetch(`/api/short-interest-data?tickers=${tp}`).then(r => r.json()),
      fetch(`/api/prices?tickers=${tp}`).then(r => r.json()),
    ]).then(([analyst, shorts, prices]) => {
      const shortsMap = {};
      if (Array.isArray(shorts)) {
        shorts.forEach(s => { shortsMap[s.ticker] = s; });
        setLastUpdated(shorts.find(s => s.lastUpdated)?.lastUpdated ?? null);
      }
      const pricesMap = {};
      if (Array.isArray(prices)) prices.forEach(p => { pricesMap[p.ticker] = p.price; });

      const enriched = (Array.isArray(analyst) ? analyst : []).map(r => {
        const price = pricesMap[r.ticker] ?? null;
        const si    = shortsMap[r.ticker] ?? {};
        const upside = price != null && r.lastQuarterTarget
          ? (r.lastQuarterTarget - price) / price * 100 : null;
        const shortPct = si.shortPercentOfFloat != null ? si.shortPercentOfFloat * 100 : null;
        return {
          ticker:            r.ticker,
          name:              r.name ?? r.ticker,
          price,
          lastQuarterTarget: r.lastQuarterTarget || null,
          upside,
          shortPct,
          shortRatio:        si.shortRatio ?? null,
          siChange:          si.siChange   ?? null,
        };
      });
      setRows(enriched);
    }).finally(() => setLoading(false));
  }, []);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? (sortDir === 'desc' ? -Infinity : Infinity);
    const bv = b[sortKey] ?? (sortDir === 'desc' ? -Infinity : Infinity);
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const lastRefresh = lastUpdated
    ? new Date(lastUpdated + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const thBase = {
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    padding: '12px 14px',
    fontSize: 11,
    fontWeight: 600,
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-color)',
  };

  const tdBase = {
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-color)',
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
    fontSize: 13,
  };

  function renderCell(r, col) {
    switch (col.key) {
      case 'ticker':
        return (
          <td key="ticker" style={{ ...tdBase, textAlign: 'left', paddingLeft: 16, fontWeight: 700, color: 'var(--accent)' }}>
            {r.ticker}
          </td>
        );
      case 'name':
        return (
          <td key="name" style={{ ...tdBase, textAlign: 'left', fontSize: 12, color: 'var(--text-secondary)' }}>
            {r.name}
          </td>
        );
      case 'price':
        return (
          <td key="price" style={{ ...tdBase, textAlign: 'right' }}>
            {r.price != null ? '$' + fmt(r.price) : '—'}
          </td>
        );
      case 'lastQuarterTarget':
        return (
          <td key="lastQuarterTarget" style={{ ...tdBase, textAlign: 'right' }}>
            {r.lastQuarterTarget != null ? '$' + fmt(r.lastQuarterTarget) : '—'}
          </td>
        );
      case 'upside':
        return (
          <td key="upside" style={{ ...tdBase, textAlign: 'right', fontWeight: 700, color: getUpsideColor(r.upside) }}>
            {r.upside != null ? (r.upside >= 0 ? '+' : '') + fmt(r.upside) + '%' : '—'}
          </td>
        );
      case 'shortPct':
        return (
          <td key="shortPct" style={{ ...tdBase, textAlign: 'right', fontWeight: 700, color: getSIColor(r.shortPct) }}>
            {r.shortPct != null ? fmt(r.shortPct) + '%' : '—'}
          </td>
        );
      case 'shortRatio':
        return (
          <td key="shortRatio" style={{ ...tdBase, textAlign: 'right' }}>
            {r.shortRatio != null ? fmt(r.shortRatio) : '—'}
          </td>
        );
      case 'siChange':
        return (
          <td key="siChange" style={{ ...tdBase, textAlign: 'right', fontWeight: 600, color: getMoMColor(r.siChange) }}>
            {r.siChange != null ? (r.siChange > 0 ? '+' : '') + fmt(r.siChange) + '%' : '—'}
          </td>
        );
      default:
        return <td key={col.key} style={{ ...tdBase, textAlign: 'right' }}>—</td>;
    }
  }

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
          Analyst Targets &amp; Short Interest
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 600 }}>
          Analyst price targets and short interest data across your portfolio.
        </p>
      </div>

      {/* ── Sign-in nudge ────────────────────────────────────────────────── */}
      {isLoaded && !isSignedIn && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Not seeing your portfolio?{' '}
          <a href="/sign-in" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>
            Sign in
          </a>{' '}
          to load your holdings.
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {loading && <div className="chart-placeholder">Loading data…</div>}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      {!loading && (
        <div>
          <div className="dv2-valuation-scroll">
            <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {COLUMNS.map(c => {
                    const active = sortKey === c.key;
                    return (
                      <th
                        key={c.key}
                        onClick={() => handleSort(c.key)}
                        style={{
                          ...thBase,
                          textAlign: c.align,
                          paddingLeft: c.key === 'ticker' ? 16 : 14,
                          color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                        }}
                      >
                        {c.label} {active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={i}>
                    {COLUMNS.map(c => renderCell(r, c))}
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      No data available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Short interest footnote */}
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            Short interest data from Yahoo Finance; updated bi-weekly.
            {lastRefresh && <> Last refresh: {lastRefresh}.</>}
          </div>
        </div>
      )}

      {/* ── Color legend ─────────────────────────────────────────────────── */}
      {!loading && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Upside: <span style={{ color: '#3fb950' }}>■</span> ≥20% ·{' '}
          <span style={{ color: '#79c0ff' }}>■</span> 0–20% ·{' '}
          <span style={{ color: '#f85149' }}>■</span> downside
          &nbsp;·&nbsp;
          Short %: <span style={{ color: '#f85149' }}>■</span> &gt;20% ·{' '}
          <span style={{ color: '#3fb950' }}>■</span> &lt;5%
        </div>
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
          Analyst targets via Finnhub &amp; FMP · Short interest via Yahoo Finance ·
          StockDashes is for informational purposes only and does not constitute financial advice
        </div>
      )}

    </div>
  );
}
