'use client';
import { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import DashboardSummary from '@/components/DashboardSummary';
import StockIntelSummary from '@/components/StockIntelSummary';

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
  const [holdings,  setHoldings]  = useState([]);
  const [prices,    setPrices]    = useState({});
  const [earnings,  setEarnings]  = useState([]);
  const [news,      setNews]      = useState([]);
  const [candles,   setCandles]   = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [loading,   setLoading]   = useState(true);

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
            // Fetch live prices for fallback tickers so cost basis = current price → $0 P&L
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
    fetch('/api/portfolio')
      .then(r => r.json())
      .then(data => {
        let h;
        if (data.signedIn && data.holdings?.length) {
          h = data.holdings;
          localStorage.setItem('stockdash_holdings', JSON.stringify(h));
        } else {
          h = getLocalHoldings();
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
        // Network error or Clerk session issue — fall back to localStorage
        const h = getLocalHoldings();
        setHoldings(h);
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
      <div className="chart-placeholder">
        No holdings found. Add your tickers via the portfolio setup to get started.
      </div>
    </main>
  );

  return (
    <main style={{ padding: '20px 24px' }}>

      <DashboardSummary holdings={holdings} rows={rows} earnings={earnings} news={news} />

      {/* Summary bar */}
      <div className="summary-bar" style={{ marginBottom: 24, borderRadius: 8, border: '1px solid', overflow: 'hidden' }}>
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
      <section>
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
      {selected && (
        <section>
          <div className="section-title">{selected} — 1-Year Price (Weekly)</div>
          <div className="chart-panel">
            {candles.length === 0
              ? <div className="chart-placeholder">Loading chart…</div>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={candles} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                    <XAxis dataKey="date" tick={{ fill: '#8b949e', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#8b949e', fontSize: 10 }} tickLine={false} axisLine={false} width={52} domain={['auto', 'auto']} tickFormatter={v => '$' + v.toFixed(0)} />
                    <Tooltip
                      contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 4, fontSize: 12 }}
                      labelStyle={{ color: '#8b949e' }}
                      formatter={v => ['$' + fmt(v), 'Close']}
                    />
                    <Line type="monotone" dataKey="close" stroke="#58a6ff" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )
            }
          </div>
        </section>
      )}

      {/* Stock Intel */}
      <section>
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
