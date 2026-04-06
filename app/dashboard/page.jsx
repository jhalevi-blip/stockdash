'use client';
import { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import DashboardSummary from '@/components/DashboardSummary';
import StockIntelSummary from '@/components/StockIntelSummary';
import DemoPrompt from '@/components/DemoPrompt';
import dynamic from 'next/dynamic';
const DashboardTour = dynamic(() => import('@/components/DashboardTour'), { ssr: false });

const fmt  = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const fmtD = (n, d = 2) => (n == null ? '—' : (n >= 0 ? '+' : '') + fmt(n, d) + '%');

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
  // DIAGNOSTIC — remove after confirming tour works
  if (typeof window !== 'undefined') {
    console.log('[tour-debug] tour_pending:', localStorage.getItem('tour_pending'));
    console.log('[tour-debug] tour_completed:', localStorage.getItem('tour_completed'));
  }

  const [holdings,       setHoldings]       = useState([]);
  const [prices,         setPrices]         = useState({});
  const [earnings,       setEarnings]       = useState([]);
  const [news,           setNews]           = useState([]);
  const [candles,        setCandles]        = useState([]);
  const [selected,       setSelected]       = useState(null);
  const [period,         setPeriod]         = useState('1Y');
  const [loading,  setLoading]  = useState(true);
  const [tourRun,  setTourRun]  = useState(true);  // DIAGNOSTIC: hardcoded true to test Joyride directly

  // Auto-start tour.
  // Primary trigger: localStorage 'tour_pending' (set by landing page before
  // navigating, survives Clerk's server-side handshake redirect which strips
  // query params).
  // Secondary trigger: ?tour=true URL param (works when no Clerk handshake
  // happens, e.g. already-authenticated users navigating directly).
  useEffect(() => {
    console.log('[tour] effect fired, loading:', loading);
    if (loading) return;

    const lsPending  = localStorage.getItem('tour_pending') === 'true';
    const params     = new URLSearchParams(window.location.search);
    const urlPending = params.get('tour') === 'true';
    const completed  = localStorage.getItem('tour_completed');

    console.log('[tour] loading done — ls_pending:', lsPending, '| url_pending:', urlPending, '| completed:', completed);

    if ((lsPending || urlPending) && completed !== 'true') {
      localStorage.removeItem('tour_pending');
      if (urlPending) window.history.replaceState({}, '', '/dashboard');
      console.log('[tour] starting tour');
      setTourRun(true);
    }
  }, [loading]);

  const loadChart = useCallback(async (ticker) => {
    setSelected(ticker);
    setCandles([]);
    const res = await fetch(`/api/chart?symbol=${ticker}`);
    const data = await res.json();
    setCandles(data.candles ?? []);
  }, []);

  const fetchDashboard = useCallback(() => {
    const DEMO_SHARES    = [50, 30, 20, 15, 10];
    const DEMO_FALLBACK  = ['AAPL', 'NVDA', 'TSLA', 'AMZN', 'MSFT'];

    // Demo mode: build holdings from /api/most-traded
    if (localStorage.getItem('stockdash_demo') === 'true') {
      (async () => {
        try {
          let h;
          try {
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

    // Fetch from Supabase if signed in, fall back to localStorage on any failure
    const localAtLoad = getLocalHoldings();
    console.log('[dashboard] localStorage holdings at load:', JSON.stringify(localAtLoad));
    fetch('/api/portfolio')
      .then(r => r.json())
      .then(data => {
        let h;
        if (data.signedIn && data.holdings?.length) {
          const localMap = {};
          localAtLoad.forEach(lh => { localMap[lh.t] = lh; });
          h = data.holdings.map(sh => ({
            ...sh,
            c: sh.c > 0 ? sh.c : (localMap[sh.t]?.c ?? 0),
          }));
          console.log('[dashboard] merged holdings (Supabase + localStorage):', JSON.stringify(h));
          localStorage.setItem('stockdash_holdings', JSON.stringify(h));
        } else {
          h = localAtLoad;
        }

        setHoldings(h);
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

  const totalMkt  = rows.reduce((s, r) => s + (r.mktVal  ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + (r.costVal ?? 0), 0);
  const totalPnl  = totalMkt - totalCost;
  const totalPct  = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
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

      {/* Tour replay button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => setTourRun(true)}
          style={{
            background: 'none',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            color: 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            padding: '4px 12px',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span style={{ fontSize: 13 }}>🗺</span> Take the tour
        </button>
      </div>

      <DashboardSummary holdings={holdings} rows={rows} earnings={earnings} news={news} />

      {/* Summary cards */}
      <div
        data-tour="summary-cards"
        className="summary-bar"
        style={{ marginBottom: 24, borderRadius: 8, border: '1px solid', overflow: 'hidden' }}
      >
        {[
          { label: 'Portfolio Value', value: '$' + fmt(totalMkt), sub: null },
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

      {/* Holdings table */}
      <section data-tour="holdings-table">
        <div className="section-title">Holdings</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="left">Ticker</th>
                <th>Shares</th>
                <th>Price</th>
                <th>Chg %</th>
                <th>Cost Basis</th>
                <th>Mkt Value</th>
                <th>P&L $</th>
                <th>P&L %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
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
            </tbody>
          </table>
        </div>
        <div className="note">Click a row to load its price chart below.</div>
      </section>

      {/* Price chart */}
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
        const dc = displayCandles();
        const firstClose = dc[0]?.close ?? null;
        const lastClose  = dc[dc.length - 1]?.close ?? null;
        const periodAmt  = firstClose && lastClose ? lastClose - firstClose : null;
        const periodPct  = firstClose && periodAmt != null ? (periodAmt / firstClose) * 100 : null;
        const isPos      = periodAmt == null || periodAmt >= 0;
        const lineColor  = isPos ? '#58a6ff' : '#f87171';

        return (
          <section data-tour="price-chart">
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 12,
              padding: '20px 24px 12px',
              marginBottom: 24,
              boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>{selected}</div>
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
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {PERIODS.map(p => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      style={{
                        background: period === p ? 'var(--accent)' : 'var(--bg-secondary)',
                        color: period === p ? '#fff' : 'var(--text-secondary)',
                        border: 'none',
                        borderRadius: 20,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'background 0.15s',
                      }}
                    >
                      {p}
                    </button>
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
                      <Tooltip
                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 12 }}
                        labelStyle={{ color: 'var(--text-secondary)' }}
                        formatter={v => ['$' + fmt(v), 'Close']}
                      />
                      <Area
                        type="monotone"
                        dataKey="close"
                        stroke={lineColor}
                        strokeWidth={2}
                        fill="url(#chartGradient)"
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )
              }
            </div>
          </section>
        );
      })()}

      {/* Stock Intel */}
      <section data-tour="stock-intel">
        <div className="section-title">Stock Intel</div>
        <StockIntelSummary holdings={holdings} rows={rows} />
      </section>

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
