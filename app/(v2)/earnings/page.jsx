'use client';
import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import DemoPrompt from '@/components/DemoPrompt';
import { getDemoTickers } from '@/lib/startDemo';
import { getCachedHoldings } from '@/lib/holdingsStorage';
import dynamic from 'next/dynamic';

// recharts loads in an async chunk (after paint), off the route's critical path.
const EpsEstimateVsActualChart = dynamic(
  () => import('./_components/EpsCharts').then(m => m.EpsEstimateVsActualChart),
  { ssr: false, loading: () => <div style={{ height: 240 }} /> },
);
const EpsTrendChart = dynamic(
  () => import('./_components/EpsCharts').then(m => m.EpsTrendChart),
  { ssr: false, loading: () => <div style={{ height: 180 }} /> },
);

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function getStoredTickers(userId) {
  try {
    const holdings = getCachedHoldings(userId);
    const t = holdings.map(h => h.t);
    if (t.length) return t;
    if (localStorage.getItem('stockdash_demo') === 'true') return getDemoTickers();
  } catch {}
  return [];
}

const fmt = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const pct = n => n == null ? '—' : (n >= 0 ? '+' : '') + fmt(n) + '%';

function getStreak(data) {
  if (!data.length) return null;
  const sorted = [...data].reverse();
  let streak = 0, type = null;
  for (const e of sorted) {
    if (e.actual == null || e.estimate == null) break;
    const beat = e.actual >= e.estimate;
    if (type === null) type = beat;
    if (beat === type) streak++;
    else break;
  }
  return { streak, type };
}

/* ─── Section label ─────────────────────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
      {children}
    </div>
  );
}

/* ─── Table column definitions ──────────────────────────────────────────── */
const TABLE_COLS = [
  { key: 'period',          label: 'Period',     align: 'left'  },
  { key: 'estimate',        label: 'EPS Est',    align: 'right' },
  { key: 'actual',          label: 'EPS Actual', align: 'right' },
  { key: 'surprise',        label: 'Surprise',   align: 'right' },
  { key: 'surprisePct',     label: 'Surprise %', align: 'right' },
  { key: 'revenueEstimate', label: 'Rev Est',    align: 'right' },
  { key: 'revenueActual',   label: 'Rev Actual', align: 'right' },
  { key: 'beat',            label: 'Beat?',      align: 'right' },
];

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function EarningsV2Page() {
  const { isLoaded, user } = useUser();
  const [tickers,      setTickers]      = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [data,         setData]         = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [nextEarnings, setNextEarnings] = useState(null);
  const [sortKey,      setSortKey]      = useState('period');
  const [sortDir,      setSortDir]      = useState('desc');

  const loadEarnings = async (ticker) => {
    setSelected(ticker);
    setLoading(true);
    setNextEarnings(null);
    try {
      const [histRes, calRes] = await Promise.all([
        fetch(`/api/earnings-history?symbol=${ticker}`),
        fetch(`/api/earnings?tickers=${ticker}`),   // V1 had ?symbol= — mismatch with API; fixed here
      ]);
      const raw = await histRes.json();
      const cal = await calRes.json();
      setData(Array.isArray(raw) ? raw.slice(0, 12) : []);
      const next = Array.isArray(cal) ? cal.find(e => e.symbol === ticker && !e.noData) : null;
      setNextEarnings(next ?? null);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoaded) return; // wait for Clerk so a signed-in user's tickers aren't blanked
    const ts = getStoredTickers(user?.id);
    setTickers(ts);
    // Auto-load largest position by shares × cost-per-share
    try {
      const holdings = getCachedHoldings(user?.id);
      const largest = [...holdings]
        .filter(h => h.s && h.c)
        .sort((a, b) => (b.s * b.c) - (a.s * a.c))[0];
      const autoTicker = largest?.t ?? (ts.length ? ts[0] : null);
      if (autoTicker) loadEarnings(autoTicker);
    } catch {
      if (ts.length) loadEarnings(ts[0]);
    }
  }, [isLoaded, user?.id]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function getTableVal(e, k) {
    if (k === 'surprise')    return (e.actual != null && e.estimate != null) ? e.actual - e.estimate : null;
    if (k === 'surprisePct') {
      const s = (e.actual != null && e.estimate != null) ? e.actual - e.estimate : null;
      return s != null && e.estimate ? s / Math.abs(e.estimate) * 100 : null;
    }
    if (k === 'beat') return (e.actual != null && e.estimate != null) ? (e.actual >= e.estimate ? 1 : 0) : null;
    return e[k] ?? null;
  }

  const streak = getStreak(data);

  const epsChartData  = data.map(e => ({ period: e.period, 'EPS Estimate': e.estimate, 'EPS Actual': e.actual }));
  const epsTrendData  = data.map(e => ({ period: e.period, 'EPS Actual': e.actual }));

  const sortedData = [...data].sort((a, b) => {
    const av = getTableVal(a, sortKey) ?? (sortDir === 'desc' ? -Infinity : Infinity);
    const bv = getTableVal(b, sortKey) ?? (sortDir === 'desc' ? -Infinity : Infinity);
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const thBase = {
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
    padding: '12px 14px', fontSize: 11, fontWeight: 600,
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-color)',
  };

  const tdBase = {
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-color)',
    whiteSpace: 'nowrap',
    fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
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
          Earnings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 600 }}>
          EPS history, analyst estimates, and upcoming earnings dates for your holdings.
        </p>
      </div>

      {/* ── Ticker picker ────────────────────────────────────────────────── */}
      {tickers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tickers.map(t => (
            <button key={t} onClick={() => loadEarnings(t)} style={{
              background: selected === t ? '#1f6feb' : 'var(--bg-secondary)',
              color:      selected === t ? '#fff' : 'var(--text-secondary)',
              border:     `1px solid ${selected === t ? '#58a6ff' : 'var(--border-color)'}`,
              borderRadius: 4, padding: '6px 14px', fontSize: 12,
              fontWeight: 600, cursor: 'pointer',
            }}>{t}</button>
          ))}
        </div>
      )}

      {/* ── State placeholders ───────────────────────────────────────────── */}
      {tickers.length === 0 && <DemoPrompt message="Add stocks to your portfolio to view earnings history" />}
      {tickers.length > 0 && !selected && !loading && (
        <div className="chart-placeholder">Select a stock above to view earnings history</div>
      )}
      {loading && <div className="chart-placeholder">Loading earnings for {selected}…</div>}
      {!loading && selected && data.length === 0 && (
        <div className="chart-placeholder">No earnings data available for {selected}</div>
      )}

      {/* ── Data sections ────────────────────────────────────────────────── */}
      {!loading && data.length > 0 && (
        <>
          {/* Next earnings countdown */}
          {nextEarnings && (() => {
            const days  = Math.ceil((new Date(nextEarnings.date) - new Date()) / (1000 * 60 * 60 * 24));
            const color = days <= 7 ? '#f85149' : days <= 14 ? '#f0883e' : '#3fb950';
            return (
              <div style={{ background: 'var(--bg-card)', border: `1px solid ${color}`, borderRadius: 6, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>📅</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Next Earnings: {new Date(nextEarnings.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div style={{ fontSize: 12, color }}>
                    {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow!' : `${days} days away`}
                    {nextEarnings.hour === 'amc' ? ' · After Market Close' : nextEarnings.hour === 'bmo' ? ' · Before Market Open' : ''}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Beat streak badge */}
          {streak && streak.streak >= 2 && (() => {
            const color = streak.type ? '#3fb950' : '#f85149';
            return (
              <div style={{ background: 'var(--bg-card)', border: `1px solid ${color}`, borderRadius: 6, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'flex-start' }}>
                <span style={{ fontSize: 22 }}>{streak.type ? '🏆' : '⚠️'}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {streak.type ? '🟢 Beat' : '🔴 Missed'} estimates {streak.streak} quarters in a row
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Based on last {streak.streak} reported quarters
                  </div>
                </div>
              </div>
            );
          })()}

          {/* EPS History charts */}
          <div>
            <SectionLabel>EPS History</SectionLabel>

            {/* Bar chart: Estimate vs Actual */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                {selected} — EPS Estimate vs Actual
              </div>
              <EpsEstimateVsActualChart data={epsChartData} />
            </div>

            {/* Area chart: EPS Trend */}
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {selected} — EPS Trend
            </div>
            <EpsTrendChart data={epsTrendData} />
          </div>

          {/* Quarterly Detail table */}
          <div>
            <SectionLabel>Quarterly Detail</SectionLabel>
            <div className="dv2-valuation-scroll">
              <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {TABLE_COLS.map(c => {
                      const active = sortKey === c.key;
                      return (
                        <th
                          key={c.key}
                          onClick={() => handleSort(c.key)}
                          style={{
                            ...thBase,
                            textAlign: c.align,
                            paddingLeft: c.key === 'period' ? 16 : 14,
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
                  {sortedData.map((e, i) => {
                    const surprise    = e.actual != null && e.estimate != null ? e.actual - e.estimate : null;
                    const surprisePct = surprise != null && e.estimate ? surprise / Math.abs(e.estimate) * 100 : null;
                    const beat        = surprise != null && surprise >= 0;
                    const posColor    = 'var(--positive)';
                    const negColor    = 'var(--negative)';
                    return (
                      <tr key={i}>
                        {/* Period — sticky on mobile */}
                        <td style={{ ...tdBase, textAlign: 'left', paddingLeft: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {e.period}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right' }}>
                          {e.estimate != null ? '$' + fmt(e.estimate) : '—'}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', color: e.actual != null ? (beat ? posColor : negColor) : 'var(--text-secondary)' }}>
                          {e.actual != null ? '$' + fmt(e.actual) : '—'}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', color: surprise != null ? (beat ? posColor : negColor) : 'var(--text-secondary)' }}>
                          {surprise != null ? (beat ? '+$' : '-$') + fmt(Math.abs(surprise)) : '—'}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', color: surprisePct != null ? (beat ? posColor : negColor) : 'var(--text-secondary)' }}>
                          {pct(surprisePct)}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {e.revenueEstimate ? '$' + (e.revenueEstimate / 1e9).toFixed(2) + 'B' : '—'}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right', color: e.revenueActual ? (e.revenueActual >= (e.revenueEstimate || 0) ? posColor : negColor) : 'var(--text-secondary)' }}>
                          {e.revenueActual ? '$' + (e.revenueActual / 1e9).toFixed(2) + 'B' : '—'}
                        </td>
                        <td style={{ ...tdBase, textAlign: 'right' }}>
                          {surprise != null ? (beat ? '✅' : '❌') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Footer disclaimer ──────────────────────────────────────── */}
          <div style={{
            marginTop: 8,
            padding: '14px 0 24px',
            color: 'var(--text-faint, rgba(230,237,243,0.45))',
            fontSize: 11,
            textAlign: 'center',
            borderTop: '1px solid var(--border-section, var(--border-color))',
          }}>
            EPS data via Finnhub, FMP &amp; SEC EDGAR · Revenue data via FMP ·
            StockDashes is for informational purposes only and does not constitute financial advice
          </div>
        </>
      )}

    </div>
  );
}
