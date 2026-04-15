'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import DashboardSummary from '@/components/DashboardSummary';
import StockIntelSummary from '@/components/StockIntelSummary';
import PortfolioAISummary from '@/components/PortfolioAISummary';
import DemoPrompt from '@/components/DemoPrompt';
import DashboardTour from '@/components/DashboardTour';
import { saveUserHoldings } from '@/lib/holdingsStorage';

const fmt  = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const fmtD = (n, d = 2) => (n == null ? '—' : (n >= 0 ? '+' : '') + fmt(n, d) + '%');

const SAMPLE_HOLDINGS = [
  { t: 'NVDA', s: 50,  c: 133.67 },
  { t: 'TSLA', s: 30,  c: 247.08 },
  { t: 'AAPL', s: 20,  c: 223.19 },
  { t: 'AMZN', s: 15,  c: 196.35 },
  { t: 'AMD',  s: 10,  c: 96.46  },
];

function getLocalHoldings() {
  try {
    const stored = localStorage.getItem('stockdash_holdings');
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

export default function DashboardPage() {
  const [holdings,       setHoldings]       = useState([]);
  const [prices,         setPrices]         = useState({});
  const [earnings,       setEarnings]       = useState([]);
  const [news,           setNews]           = useState([]);
  const [candles,        setCandles]        = useState([]);
  const [earningsHistory, setEarningsHistory] = useState([]);
  const [selected,       setSelected]       = useState(null);
  const [period,         setPeriod]         = useState('1Y');
  const [loading,        setLoading]        = useState(true);
  const [tourRun,        setTourRun]        = useState(false);
  const [panelTab,       setPanelTab]       = useState('chart');
  const [sortField,      setSortField]      = useState(null);
  const [sortDir,        setSortDir]        = useState('desc');
  const [spyChgPct,      setSpyChgPct]      = useState(null);
  const [sampleBanner,   setSampleBanner]   = useState(false);
  const [cash,           setCash]           = useState(null);   // { amount, currency }
  const [eurUsd,         setEurUsd]         = useState(1);
  const { user } = useUser();
  const userIdRef = useRef(null);
  useEffect(() => { userIdRef.current = user?.id ?? null; }, [user?.id]);

  const loadChart = useCallback(async (ticker) => {
    setSelected(ticker);
    setPanelTab('chart');
    setCandles([]);
    setEarningsHistory([]);
    const [chartData, earnData] = await Promise.all([
      fetch(`/api/chart?symbol=${ticker}`).then(r => r.json()),
      fetch(`/api/earnings-history?symbol=${ticker}`).then(r => r.json()).catch(() => []),
    ]);
    setCandles(chartData.candles ?? []);
    setEarningsHistory(Array.isArray(earnData) ? earnData : []);
  }, []);

  const fetchDashboard = useCallback(() => {
    // Load cash position from localStorage (present after any save / page reload)
    const cashAmt = parseFloat(localStorage.getItem('stockdash_cash_amount') || '0') || 0;
    const cashCcy = localStorage.getItem('stockdash_cash_currency') || 'USD';
    setCash(cashAmt > 0 ? { amount: cashAmt, currency: cashCcy } : null);

    const DEMO_SHARES    = [50, 30, 20, 15, 10];
    const DEMO_FALLBACK  = ['AAPL', 'NVDA', 'TSLA', 'AMZN', 'MSFT'];

    if (localStorage.getItem('stockdash_demo') === 'true') {
      (async () => {
        try {
          let h;
          // Use user-edited holdings from localStorage if available
          try {
            const stored = localStorage.getItem('stockdash_holdings');
            if (stored) {
              const parsed = JSON.parse(stored);
              if (Array.isArray(parsed) && parsed.length) h = parsed;
            }
          } catch {}
          // Otherwise fetch demo holdings from most-traded
          if (!h) try {
            const res  = await fetch('/api/most-traded');
            const data = await res.json();
            if (Array.isArray(data) && data.length) {
              h = data.slice(0, 5).map((e, i) => ({
                t: e.symbol,
                s: DEMO_SHARES[i],
                c: e.price ?? 0,
              }));
            }
          } catch {}

          if (!h) {
            try {
              const res    = await fetch(`/api/prices?tickers=${DEMO_FALLBACK.join(',')}`);
              const prices = await res.json();
              const pm     = {};
              if (Array.isArray(prices)) prices.forEach(p => { pm[p.ticker] = p.price ?? 0; });
              h = DEMO_FALLBACK.map((t, i) => ({ t, s: DEMO_SHARES[i], c: pm[t] ?? 0 }));
            } catch {
              h = DEMO_FALLBACK.map((t, i) => ({ t, s: DEMO_SHARES[i], c: 0 }));
            }
          }

          setHoldings(h);
          localStorage.setItem('stockdash_holdings', JSON.stringify(h));
          const tickers = h.map(x => x.t).join(',');
          const [priceArr, earningsArr, newsArr] = await Promise.all([
            fetch(`/api/prices?tickers=${tickers}`).then(r => r.json()),
            fetch(`/api/earnings?tickers=${tickers}`).then(r => r.json()),
            fetch(`/api/news?tickers=${tickers}`).then(r => r.json()),
          ]);
          const priceMap = {};
          if (Array.isArray(priceArr)) priceArr.forEach(p => { priceMap[p.ticker] = p; });
          setPrices(priceMap);
          setEarnings(Array.isArray(earningsArr) ? earningsArr.filter(e => !e.noData) : []);
          setNews(Array.isArray(newsArr) ? newsArr.slice(0, 8) : []);
          loadChart(h[0].t);
        } catch {}
      })().finally(() => setLoading(false));
      return;
    }

    const localAtLoad = getLocalHoldings();
    console.log('[dashboard] localStorage holdings at load:', JSON.stringify(localAtLoad));
    fetch('/api/portfolio')
      .then(r => r.json())
      .then(data => {
        let h;
        if (localAtLoad.length) {
          // localStorage is source of truth (updated by Edit Portfolio)
          h = localAtLoad;
        } else if (data.signedIn && data.holdings?.length) {
          h = data.holdings;
          saveUserHoldings(userIdRef.current, h);
        } else if (data.signedIn) {
          // First-time signed-in user with no portfolio — pre-fill with sample
          h = SAMPLE_HOLDINGS;
          saveUserHoldings(userIdRef.current, h);
          localStorage.setItem('stockdash_sample_portfolio', 'true');
          fetch('/api/portfolio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ holdings: h }),
          }).catch(() => {});
        } else {
          h = [];
        }
        if (localStorage.getItem('stockdash_sample_portfolio') === 'true') setSampleBanner(true);

        setHoldings(h);
        saveUserHoldings(userIdRef.current, h);
        if (!h.length) { setLoading(false); return; }

        const tickers = h.map(x => x.t).join(',');
        return Promise.all([
          fetch(`/api/prices?tickers=${tickers}`).then(r => r.json()),
          fetch(`/api/earnings?tickers=${tickers}`).then(r => r.json()),
          fetch(`/api/news?tickers=${tickers}`).then(r => r.json()),
        ]).then(([priceArr, earningsArr, newsArr]) => {
          const priceMap = {};
          if (Array.isArray(priceArr)) priceArr.forEach(p => { priceMap[p.ticker] = p; });
          setPrices(priceMap);
          setEarnings(Array.isArray(earningsArr) ? earningsArr.filter(e => !e.noData) : []);
          setNews(Array.isArray(newsArr) ? newsArr.slice(0, 8) : []);
          loadChart(h[0].t);
        });
      })
      .catch(() => {
        setHoldings(localAtLoad);
      })
      .finally(() => setLoading(false));
  }, [loadChart]);

  useEffect(() => {
    fetchDashboard();
    window.addEventListener('portfolio-saved', fetchDashboard);
    return () => window.removeEventListener('portfolio-saved', fetchDashboard);
  }, [fetchDashboard]);

  // Auto-start tour when dashboard finishes loading if tour_pending is set
  useEffect(() => {
    if (!loading && localStorage.getItem('tour_pending') === 'true') {
      localStorage.removeItem('tour_pending');
      setTimeout(() => setTourRun(true), 600);
    }
  }, [loading]);

  // Fetch EUR/USD rate when cash is held in EUR
  useEffect(() => {
    if (cash?.currency !== 'EUR' || !cash?.amount) return;
    fetch('/api/chart?symbol=EURUSD%3DX')
      .then(r => r.json())
      .then(d => {
        const c = d.candles ?? [];
        const rate = c[c.length - 1]?.close;
        if (rate > 0) setEurUsd(rate);
      })
      .catch(() => {});
  }, [cash?.currency, cash?.amount]);

  // Portfolio summary
  const rows = holdings.map(h => {
    const q     = prices[h.t];
    const price = q?.price ?? null;
    const mktVal  = price != null ? price * h.s : null;
    const costVal = h.c * h.s;
    const pnlAmt  = mktVal != null ? mktVal - costVal : null;
    const pnlPct  = pnlAmt != null && costVal > 0 ? (pnlAmt / costVal) * 100 : null;
    return { ...h, price, chgPct: q?.chgPct ?? null, mktVal, costVal, pnlAmt, pnlPct };
  });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedRows = sortField ? [...rows].sort((a, b) => {
    const valA = a[sortField] ?? (sortDir === 'asc' ? Infinity : -Infinity);
    const valB = b[sortField] ?? (sortDir === 'asc' ? Infinity : -Infinity);
    if (typeof valA === 'string') return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    return sortDir === 'asc' ? valA - valB : valB - valA;
  }) : rows;

  const cashUSD    = cash ? cash.amount * (cash.currency === 'EUR' ? eurUsd : 1) : 0;
  const totalMkt   = rows.reduce((s, r) => s + (r.mktVal  ?? 0), 0);
  const totalCost  = rows.reduce((s, r) => s + (r.costVal ?? 0), 0);
  const totalPnl   = rows.reduce((s, r) => s + (r.pnlAmt  ?? 0), 0);
  const pricedCost = rows.reduce((s, r) => s + (r.pnlAmt != null ? r.costVal : 0), 0);
  const totalPct   = pricedCost > 0 ? (totalPnl / pricedCost) * 100 : 0;
  const isLive    = Object.values(prices).some(p => p?.marketOpen);

  if (loading) return (
    <main style={{ padding: '20px 24px' }}>
      <div className="chart-placeholder">Loading dashboard…</div>
    </main>
  );

  if (!holdings.length) return (
    <main style={{ padding: '20px 24px' }}>
      <DemoPrompt message="No holdings found" />
    </main>
  );

  return (
    <main style={{ padding: '20px 24px' }}>

      <DashboardTour run={tourRun} onStop={() => setTourRun(false)} />

      {sampleBanner && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 16, gap: 12,
        }}>
          <span style={{ fontSize: 13, color: '#22d3ee' }}>
            This is a sample portfolio — edit it to add your own holdings
          </span>
          <button
            onClick={() => {
              setSampleBanner(false);
              localStorage.removeItem('stockdash_sample_portfolio');
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#22d3ee', fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0,
            }}
            aria-label="Dismiss"
          >×</button>
        </div>
      )}

      <DashboardSummary holdings={holdings} rows={rows} earnings={earnings} news={news}
        onMacro={m => setSpyChgPct(m?.indices?.SPY?.changesPercentage ?? null)} />

      {/* Summary cards */}
      <div
        data-tour="summary-cards"
        className="summary-bar"
        style={{ marginBottom: 24, borderRadius: 8, border: '1px solid', overflow: 'hidden' }}
      >
        {[
          { label: 'Portfolio Value', value: '$' + fmt(totalMkt), sub: null },
          ...(cash && cashUSD > 0 ? [{
            label: 'Cash',
            value: (cash.currency !== 'USD' ? cash.currency + ' ' : '$') + fmt(cash.amount),
            sub:   cash.currency !== 'USD' ? `≈ $${fmt(cashUSD)} · excl. from P&L` : 'Excl. from P&L',
          }] : []),
          { label: 'Cost Basis',      value: '$' + fmt(totalCost), sub: `${holdings.length} positions` },
          { label: 'Total P&L',       value: (totalPnl >= 0 ? '+$' : '-$') + fmt(Math.abs(totalPnl)), sub: fmtD(totalPct), pos: totalPnl >= 0 },
          { label: 'Status',          value: isLive ? 'Live' : 'Closed', dot: true, live: isLive, sub: isLive ? 'Market open' : 'Last close' },
        ].map(s => (
          <div key={s.label} className="stat">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 18 }}>
              {s.dot && (
                <span className={`dot ${s.live ? 'dot-live' : 'dot-idle'}`} />
              )}
              {s.value}
            </div>
            {s.sub && (
              <div className="stat-sub" style={{ color: s.pos != null ? (s.pos ? '#16a34a' : '#dc2626') : undefined }}>
                {s.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Daily Snapshot */}
      {(() => {
        const dailyRows = rows.filter(r => r.chgPct != null && r.price != null);
        if (!dailyRows.length) return null;

        const totalDailyAmt = dailyRows.reduce((s, r) => s + r.s * r.price * (r.chgPct / 100), 0);
        const totalMktNow   = dailyRows.reduce((s, r) => s + r.mktVal, 0);
        const totalDailyPct = totalMktNow > 0 ? (totalDailyAmt / totalMktNow) * 100 : null;
        const best  = dailyRows.reduce((a, b) => b.chgPct > a.chgPct ? b : a);
        const worst = dailyRows.reduce((a, b) => b.chgPct < a.chgPct ? b : a);
        const diff  = spyChgPct != null && totalDailyPct != null ? totalDailyPct - spyChgPct : null;

        const pos = (n) => n == null ? '#8b949e' : n >= 0 ? '#3fb950' : '#f85149';
        const cardStyle = {
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          padding: '14px 18px',
          flex: '1 1 200px',
          minWidth: 0,
        };
        const labelStyle = { fontSize: 10, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8 };

        return (
          <div style={{ marginBottom: 24 }}>
            <div style={labelStyle}>Daily Snapshot</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>

              {/* Today's P&L */}
              <div style={cardStyle}>
                <div style={labelStyle}>Today's P&L</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: pos(totalDailyAmt), lineHeight: 1 }}>
                  {totalDailyAmt >= 0 ? '+$' : '-$'}{fmt(Math.abs(totalDailyAmt))}
                </div>
                {totalDailyPct != null && (
                  <div style={{ fontSize: 13, color: pos(totalDailyPct), marginTop: 4 }}>
                    {totalDailyPct >= 0 ? '+' : ''}{fmt(totalDailyPct)}%
                  </div>
                )}
              </div>

              {/* Best Performer */}
              <div style={cardStyle}>
                <div style={labelStyle}>Best Today</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#3fb950' }}>{best.t}</div>
                <div style={{ fontSize: 13, color: '#3fb950', marginTop: 2 }}>
                  +{fmt(best.chgPct)}% · ${fmt(best.price)}
                </div>
              </div>

              {/* Worst Performer */}
              <div style={cardStyle}>
                <div style={labelStyle}>Worst Today</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#f85149' }}>{worst.t}</div>
                <div style={{ fontSize: 13, color: '#f85149', marginTop: 2 }}>
                  {fmt(worst.chgPct)}% · ${fmt(worst.price)}
                </div>
              </div>

              {/* Market Context */}
              <div style={cardStyle}>
                <div style={labelStyle}>vs S&P 500</div>
                {diff != null ? (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 700, color: pos(diff), lineHeight: 1 }}>
                      {diff >= 0 ? '+' : ''}{fmt(diff)}%
                    </div>
                    <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                      {diff >= 0 ? 'Outperforming' : 'Underperforming'} SPY
                      {spyChgPct != null && ` (${spyChgPct >= 0 ? '+' : ''}${fmt(spyChgPct)}%)`}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: '#8b949e' }}>
                    Portfolio {totalDailyPct != null ? `${totalDailyPct >= 0 ? '+' : ''}${fmt(totalDailyPct)}%` : '—'}
                  </div>
                )}
              </div>

            </div>
          </div>
        );
      })()}

      {/* Holdings table */}
      <section data-tour="holdings-table">
        <div className="section-title">Holdings</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  { label: 'Ticker',     field: 't',       cls: 'left' },
                  { label: 'Shares',     field: 's'                    },
                  { label: 'Price',      field: 'price'                },
                  { label: 'Chg %',      field: 'chgPct'               },
                  { label: 'Cost Basis', field: 'costVal'              },
                  { label: 'Mkt Value',  field: 'mktVal'               },
                  { label: 'P&L $',      field: 'pnlAmt'               },
                  { label: 'P&L %',      field: 'pnlPct'               },
                ].map(({ label, field, cls }) => {
                  const active = sortField === field;
                  const arrow = active
                    ? <span style={{ fontSize: 14, lineHeight: 1 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                    : <span style={{ fontSize: 14, lineHeight: 1, opacity: 0.4 }}>↕</span>;
                  return (
                    <th
                      key={field}
                      className={cls}
                      onClick={() => handleSort(field)}
                      style={{
                        cursor: 'pointer',
                        userSelect: 'none',
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '10px 12px',
                        color: active ? '#22d3ee' : undefined,
                        background: active ? 'rgba(34,211,238,0.06)' : undefined,
                        borderBottom: active ? '2px solid #22d3ee' : undefined,
                        transition: 'color 0.15s, background 0.15s',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = active ? 'rgba(34,211,238,0.1)' : 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = active ? '#22d3ee' : 'var(--text-primary, #e6edf3)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = active ? 'rgba(34,211,238,0.06)' : ''; e.currentTarget.style.color = active ? '#22d3ee' : ''; }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{label}{arrow}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(r => (
                <tr key={r.t} onClick={() => loadChart(r.t)} style={{ cursor: 'pointer' }}>
                  <td className="left tkr">{r.t}</td>
                  <td>{fmt(r.s, 0)}</td>
                  <td className="price-val">{r.price != null ? '$' + fmt(r.price) : '—'}</td>
                  <td className={r.chgPct == null ? 'neutral' : r.chgPct >= 0 ? 'pos' : 'neg'}>
                    {fmtD(r.chgPct)}
                  </td>
                  <td>${fmt(r.costVal)}</td>
                  <td>{r.mktVal != null ? '$' + fmt(r.mktVal) : '—'}</td>
                  <td className={r.pnlAmt == null ? 'neutral' : r.pnlAmt >= 0 ? 'pos' : 'neg'}>
                    {r.pnlAmt != null ? (r.pnlAmt >= 0 ? '+$' : '-$') + fmt(Math.abs(r.pnlAmt)) : '—'}
                  </td>
                  <td className={r.pnlPct == null ? 'neutral' : r.pnlPct >= 0 ? 'pos' : 'neg'}>
                    {fmtD(r.pnlPct)}
                  </td>
                </tr>
              ))}
              {cash && cashUSD > 0 && (
                <tr key="CASH" style={{ opacity: 0.75 }}>
                  <td className="left tkr" style={{ color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
                    CASH
                    <div style={{ fontSize: 10, fontStyle: 'italic', color: 'var(--text-muted)', fontWeight: 400, letterSpacing: 0, marginTop: 1 }}>
                      excl. from P&amp;L
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {fmt(cash.amount)} {cash.currency}
                  </td>
                  <td className="price-val" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {cash.currency === 'EUR' ? `€1 = $${fmt(eurUsd, 4)}` : cash.currency === 'GBP' ? 'GBP' : '$1.00'}
                  </td>
                  <td className="neutral">—</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>${fmt(cashUSD)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>${fmt(cashUSD)}</td>
                  <td className="neutral">—</td>
                  <td className="neutral">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="note">Click a row to view chart and stock intel.</div>
      </section>

      <PortfolioAISummary
        holdings={rows}
        portfolioStats={{
          totalValue:  totalMkt,
          totalPnl,
          totalPnlPct: totalPct,
          cash:        cashUSD,
        }}
      />

      {/* Tabbed detail panel — shown when a holding row is clicked */}
      {selected && (() => {
        const PERIODS = ['1M', '3M', '6M', 'YTD', '1Y'];
        const sliceMap = { '1M': 4, '3M': 13, '6M': 26, '1Y': 9999 };
        function displayCandles() {
          if (!candles.length) return [];
          if (period === 'YTD') {
            const now = new Date();
            const weeksYTD = Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / 604800000);
            return candles.slice(-Math.max(weeksYTD, 1));
          }
          return candles.slice(-(sliceMap[period] ?? 9999));
        }
        const dc         = displayCandles();
        const firstClose = dc[0]?.close ?? null;
        const lastClose  = dc[dc.length - 1]?.close ?? null;
        const periodAmt  = firstClose && lastClose ? lastClose - firstClose : null;
        const periodPct  = firstClose && periodAmt != null ? (periodAmt / firstClose) * 100 : null;
        const isPos      = periodAmt == null || periodAmt >= 0;
        const lineColor  = isPos ? '#58a6ff' : '#f87171';
        const selectedRow = rows.find(r => r.t === selected);

        // Map each earnings entry to the closest candle date within the displayed range
        const firstDate = dc[0]?.date ?? '';
        const lastDate  = dc[dc.length - 1]?.date ?? '';
        const earnMarkers = earningsHistory
          .filter(e => e.period >= firstDate && e.period <= lastDate)
          .map(e => {
            let closest = null;
            let minDiff = Infinity;
            for (const c of dc) {
              const diff = Math.abs(new Date(c.date) - new Date(e.period));
              if (diff < minDiff) { minDiff = diff; closest = c.date; }
            }
            const q = Math.ceil((new Date(e.period).getMonth() + 1) / 3);
            const beat = e.actual != null && e.estimate != null
              ? e.actual >= e.estimate : null;
            const color = beat === true ? '#22c55e' : beat === false ? '#ef4444' : '#8b949e';
            return { ...e, candleDate: closest, q, beat, color };
          })
          .filter(e => e.candleDate != null);

        // Earnings-aware tooltip
        const earnMap = Object.fromEntries(earnMarkers.map(e => [e.candleDate, e]));
        function renderTooltip({ active, payload, label }) {
          if (!active || !payload?.length) return null;
          const price = payload[0]?.value;
          const earn  = earnMap[label];
          return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12, padding: '8px 10px', minWidth: 160 }}>
              <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
              <div style={{ color: 'var(--text-primary)' }}>Close: ${fmt(price)}</div>
              {earn && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-color)', color: earn.color, fontWeight: 600 }}>
                  Q{earn.q} Earnings: EPS ${fmt(earn.actual)}
                  {earn.estimate != null && ` vs est $${fmt(earn.estimate)}`}
                  {earn.beat != null && ` (${earn.beat ? 'Beat' : 'Miss'})`}
                </div>
              )}
            </div>
          );
        }

        return (
          <section data-tour="price-chart" style={{ marginBottom: 24 }}>
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
            }}>
              {/* Panel header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', borderBottom: '1px solid var(--border-color)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{selected}</span>
                  {selectedRow?.price != null && (
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      ${fmt(selectedRow.price)}
                      {selectedRow.chgPct != null && (
                        <span style={{ marginLeft: 6, color: selectedRow.chgPct >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                          {selectedRow.chgPct >= 0 ? '+' : ''}{fmt(selectedRow.chgPct, 2)}%
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Tab buttons */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[['chart', 'Price Chart'], ['intel', 'Stock Intel']].map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setPanelTab(key)}
                        style={{
                          background: panelTab === key ? 'var(--accent)' : 'var(--bg-secondary)',
                          color: panelTab === key ? '#fff' : 'var(--text-secondary)',
                          border: 'none', borderRadius: 6,
                          padding: '5px 14px', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'background 0.15s',
                        }}
                      >{label}</button>
                    ))}
                  </div>
                  {/* Close button */}
                  <button
                    onClick={() => setSelected(null)}
                    aria-label="Close panel"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', fontSize: 22, lineHeight: 1,
                      padding: '0 4px', fontFamily: 'inherit',
                    }}
                  >×</button>
                </div>
              </div>

              {/* Price Chart tab */}
              {panelTab === 'chart' && (
                <div data-tour="price-chart-content" style={{ padding: '20px 24px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
                        {lastClose != null ? `$${fmt(lastClose)}` : '—'}
                      </span>
                      {periodAmt != null && (
                        <span style={{ fontSize: 14, fontWeight: 600, color: isPos ? 'var(--positive)' : 'var(--negative)' }}>
                          {isPos ? '+' : '−'}${fmt(Math.abs(periodAmt))} {isPos ? '+' : ''}{fmt(periodPct, 2)}% {period}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {PERIODS.map(p => (
                        <button
                          key={p}
                          onClick={() => setPeriod(p)}
                          style={{
                            background: period === p ? 'var(--accent)' : 'var(--bg-secondary)',
                            color: period === p ? '#fff' : 'var(--text-secondary)',
                            border: 'none', borderRadius: 20,
                            padding: '4px 10px', fontSize: 11, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                            transition: 'background 0.15s',
                          }}
                        >{p}</button>
                      ))}
                    </div>
                  </div>

                  {candles.length === 0
                    ? <div className="chart-placeholder">Loading chart…</div>
                    : (
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={dc} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
                              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid horizontal={true} vertical={false} stroke="var(--border-color)" strokeOpacity={0.5} strokeDasharray="0" />
                          <XAxis
                            dataKey="date"
                            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            domain={['auto', 'auto']}
                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            width={52}
                            tickCount={5}
                            tickFormatter={v => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0))}
                          />
                          <Tooltip content={renderTooltip} />
                          <Area
                            type="monotone"
                            dataKey="close"
                            stroke={lineColor}
                            strokeWidth={2}
                            fill="url(#chartGradient)"
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                          {earnMarkers.map((e, i) => (
                            <ReferenceLine
                              key={i}
                              x={e.candleDate}
                              stroke={e.color}
                              strokeDasharray="3 3"
                              strokeWidth={1.5}
                              label={{ value: e.beat === true ? '▲' : e.beat === false ? '▼' : '•', position: 'top', style: { fontSize: 10, fill: e.color } }}
                            />
                          ))}
                        </AreaChart>
                      </ResponsiveContainer>
                    )
                  }
                </div>
              )}

              {/* Stock Intel tab */}
              {panelTab === 'intel' && (
                <div data-tour="stock-intel">
                  <StockIntelSummary holdings={holdings} rows={rows} selectedTicker={selected} />
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* Earnings calendar */}
      {earnings.length > 0 && (
        <section>
          <div className="section-title">Upcoming Earnings</div>
          <div className="earnings-grid">
            {earnings.map(e => {
              const days = daysUntil(e.date);
              const cls  = days <= 7 ? 'earnings-card earnings-close' : days <= 14 ? 'earnings-card earnings-soon' : 'earnings-card';
              return (
                <div key={e.symbol} className={cls}>
                  <div className="earnings-ticker">{e.symbol}</div>
                  <div className="earnings-date">{new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                  <div className="earnings-days">
                    {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `${days} days away`}
                  </div>
                  {e.epsEstimate != null && (
                    <div className="earnings-eps">Est. EPS: ${fmt(e.epsEstimate)}</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* News */}
      {news.length > 0 && (
        <section>
          <div className="section-title">Latest News</div>
          <div className="news-feed">
            {news.map((n, i) => (
              <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="news-card">
                {n.image && <img src={n.image} alt="" className="news-img" onError={e => { e.currentTarget.style.display = 'none'; }} />}
                <div className="news-body">
                  <div className="news-meta">
                    <span className="news-ticker">{n.ticker}</span>
                    <span className="news-source">{n.source}</span>
                    <span className="news-time">{new Date(n.time * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="news-headline">{n.headline}</div>
                  {n.summary && <div className="news-summary">{n.summary.slice(0, 140)}{n.summary.length > 140 ? '…' : ''}</div>}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

    </main>
  );
}
