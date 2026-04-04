'use client';
import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import DemoPrompt from '@/components/DemoPrompt';

const fmt  = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const fmtD = (n, d = 2) => (n == null ? '—' : (n >= 0 ? '+' : '') + fmt(n, d) + '%');
const clr  = (n) => n == null ? 'var(--text-secondary)' : n >= 0 ? 'var(--positive)' : 'var(--negative)';

const DEMO_SHARES   = [50, 30, 20, 15, 10];
const DEMO_FALLBACK = ['AAPL', 'NVDA', 'TSLA', 'AMZN', 'MSFT'];

function getLocalHoldings() {
  try {
    const stored = localStorage.getItem('stockdash_holdings');
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

/** Find index in candles where close is closest to avgCost */
function estimatePurchaseIdx(candles, avgCost) {
  if (!candles?.length || avgCost == null || avgCost <= 0) return 0;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const diff = Math.abs(candles[i].close - avgCost);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}

function StatCard({ label, value, sub, valueColor }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 10,
      padding: '20px 24px',
      flex: '1 1 0',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: valueColor ?? 'var(--text-primary)', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub != null && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, valueColor }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 10,
      padding: '16px 20px',
      flex: '1 1 180px',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: valueColor ?? 'var(--text-primary)', lineHeight: 1.2 }}>
        {value}
      </div>
      {sub != null && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{sub}</div>
      )}
    </div>
  );
}

function PortTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600, lineHeight: 1.7 }}>
          {p.name}: ${fmt(p.value)}
        </div>
      ))}
    </div>
  );
}

function EurTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ color: payload[0].color, fontWeight: 600 }}>
        EUR/USD: {payload[0].value?.toFixed(4)}
      </div>
    </div>
  );
}

export default function PerformancePage() {

  const [holdings,    setHoldings]    = useState(null); // null = loading
  const [chartData,   setChartData]   = useState([]);
  const [eurData,     setEurData]     = useState([]);
  const [stats,       setStats]       = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [error,       setError]       = useState(null);

  // Load holdings (demo or real)
  useEffect(() => {
    async function loadHoldings() {
      const isDemo = localStorage.getItem('stockdash_demo') === 'true';
      if (isDemo) {
        try {
          const res  = await fetch('/api/most-traded');
          const data = await res.json();
          if (Array.isArray(data) && data.length) {
            setHoldings(data.slice(0, 5).map((e, i) => ({
              t: e.symbol, s: DEMO_SHARES[i], c: e.price ?? 0,
            })));
            return;
          }
        } catch {}
        try {
          const res    = await fetch(`/api/prices?tickers=${DEMO_FALLBACK.join(',')}`);
          const prices = await res.json();
          const pm = {};
          if (Array.isArray(prices)) prices.forEach(p => { pm[p.ticker] = p.price ?? 0; });
          setHoldings(DEMO_FALLBACK.map((t, i) => ({ t, s: DEMO_SHARES[i], c: pm[t] ?? 0 })));
          return;
        } catch {}
        setHoldings(DEMO_FALLBACK.map((t, i) => ({ t, s: DEMO_SHARES[i], c: 0 })));
        return;
      }

      // Signed-in: try /api/portfolio, fallback to localStorage
      try {
        const res  = await fetch('/api/portfolio');
        const data = await res.json();
        if (data.signedIn && data.holdings?.length) {
          setHoldings(data.holdings);
          return;
        }
      } catch {}
      setHoldings(getLocalHoldings());
    }
    loadHoldings();
  }, []);

  // Once holdings are known, fetch all chart + valuation data
  useEffect(() => {
    if (holdings === null) return;
    if (!holdings.length) return;

    let cancelled = false;
    setDataLoading(true);
    setError(null);

    async function fetchAll() {
      try {
        const tickers = holdings.map(h => h.t);

        const [spyRes, eurRes, valRes, ...tickerChartRes] = await Promise.all([
          fetch('/api/chart?symbol=SPY').then(r => r.json()),
          fetch('/api/chart?symbol=EURUSD%3DX').then(r => r.json()),
          fetch(`/api/valuation?${tickers.map(t => `tickers=${t}`).join('&')}`).then(r => r.json()),
          ...tickers.map(t => fetch(`/api/chart?symbol=${t}`).then(r => r.json())),
        ]);

        if (cancelled) return;

        const spyCandles = spyRes.candles ?? [];
        const eurCandles = eurRes.candles ?? [];
        const valArr     = Array.isArray(valRes) ? valRes : [];

        const tickerCandles = {};
        tickers.forEach((t, i) => { tickerCandles[t] = tickerChartRes[i]?.candles ?? []; });

        const spyLen = spyCandles.length;
        if (!spyLen) throw new Error('No SPY data');

        // Map each holding's estimated purchase index onto SPY's index space
        const spyStartIndices = holdings.map(h => {
          const pIdx = estimatePurchaseIdx(tickerCandles[h.t], h.c);
          const tLen = tickerCandles[h.t].length;
          if (!tLen) return 0;
          return Math.round((pIdx / tLen) * spyLen);
        });
        const portfolioStartIdx = Math.min(...spyStartIndices, spyLen - 1);

        // SPY mirror: total cost basis → SPY shares at start
        const totalCostBasis  = holdings.reduce((sum, h) => sum + h.s * h.c, 0);
        const spyPriceAtStart = spyCandles[portfolioStartIdx]?.close ?? spyCandles[0].close;
        const spyShares       = spyPriceAtStart > 0 ? totalCostBasis / spyPriceAtStart : 0;

        // Build portfolio vs SPY chart from portfolioStartIdx onward
        const chartPoints = [];
        for (let i = portfolioStartIdx; i < spyLen; i++) {
          const spyVal = spyShares * spyCandles[i].close;
          let portVal  = 0;
          holdings.forEach(h => {
            const tc = tickerCandles[h.t];
            if (!tc.length) return;
            const tIdx    = Math.round((i / spyLen) * tc.length);
            const safeIdx = Math.min(tIdx, tc.length - 1);
            portVal += h.s * (tc[safeIdx]?.close ?? h.c);
          });
          chartPoints.push({ date: spyCandles[i].date, portfolio: portVal, spy: spyVal });
        }

        // Current portfolio value
        let portNow = 0;
        holdings.forEach(h => {
          const tc = tickerCandles[h.t];
          portNow += h.s * (tc.length ? (tc[tc.length - 1]?.close ?? h.c) : h.c);
        });

        // EUR/USD impact
        const eurStart = eurCandles[portfolioStartIdx]?.close ?? eurCandles[0]?.close ?? null;
        const eurNow   = eurCandles[eurCandles.length - 1]?.close ?? null;
        let currencyImpact = null;
        if (eurStart && eurNow && eurStart > 0 && eurNow > 0) {
          currencyImpact = portNow * (1 / eurNow - 1 / eurStart);
        }

        const eurLineData = eurCandles.map(c => ({ date: c.date, rate: c.close }));

        // Portfolio beta: market-cap weighted
        let totalMktCap  = 0;
        let weightedBeta = 0;
        valArr.forEach(v => {
          if (v.beta != null && v.marketCap != null && v.marketCap > 0) {
            totalMktCap  += v.marketCap;
            weightedBeta += v.beta * v.marketCap;
          }
        });
        const portfolioBeta = totalMktCap > 0 ? weightedBeta / totalMktCap : null;

        const spyMirrorNow = chartPoints[chartPoints.length - 1]?.spy ?? null;
        const portStart    = chartPoints[0]?.portfolio ?? totalCostBasis;
        const spyStart     = chartPoints[0]?.spy ?? totalCostBasis;
        const portReturn   = portStart > 0 ? ((portNow - portStart) / portStart) * 100 : null;
        const spyReturn    = spyStart  > 0 ? ((spyMirrorNow - spyStart) / spyStart) * 100 : null;
        const vsSpyPct     = portReturn != null && spyReturn != null ? portReturn - spyReturn : null;

        if (!cancelled) {
          setChartData(chartPoints);
          setEurData(eurLineData);
          setStats({ portNow, spyMirrorNow, vsSpyPct, portReturn, spyReturn, portfolioBeta, eurNow, eurStart, currencyImpact, totalCostBasis });
          setDataLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message ?? 'Failed to load data');
          setDataLoading(false);
        }
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [holdings]);

  // --- Render ---
  if (holdings === null) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>;
  }

  if (!holdings.length) {
    return <DemoPrompt message="No portfolio configured" />;
  }

  const s          = stats;
  const xInterval  = Math.max(1, Math.floor((chartData.length - 1) / 5));
  const eurXInt    = Math.max(1, Math.floor((eurData.length - 1) / 5));

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Top stat cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard
          label="Portfolio Value"
          value={s ? `$${fmt(s.portNow)}` : '…'}
          sub={s ? `Cost basis: $${fmt(s.totalCostBasis)}` : null}
          valueColor={s && s.portNow >= s.totalCostBasis ? 'var(--positive)' : s ? 'var(--negative)' : undefined}
        />
        <StatCard
          label="SPY Mirror"
          value={s ? `$${fmt(s.spyMirrorNow)}` : '…'}
          sub={s?.spyReturn != null ? `SPY return: ${fmtD(s.spyReturn, 1)}` : null}
        />
        <StatCard
          label="vs SPY"
          value={s?.vsSpyPct == null ? '—' : (s.vsSpyPct >= 0 ? '+' : '') + fmt(s.vsSpyPct, 1) + '%'}
          sub={s?.portReturn != null ? `Portfolio: ${fmtD(s.portReturn, 1)}` : null}
          valueColor={s ? clr(s.vsSpyPct) : undefined}
        />
      </div>

      {/* Portfolio vs SPY chart */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 10, padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
          Portfolio vs SPY (since estimated purchase)
        </div>
        {dataLoading || !chartData.length ? (
          <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            {error ? `Error: ${error}` : 'Loading chart…'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="perfPortGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#58a6ff" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#58a6ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="perfSpyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid horizontal={true} vertical={false} stroke="var(--border-color)" strokeOpacity={0.5} strokeDasharray="0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval={xInterval} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={52} />
              <Tooltip content={<PortTooltip />} />
              <Area type="monotone" dataKey="portfolio" name="Portfolio" stroke="#58a6ff" strokeWidth={2} fill="url(#perfPortGrad)" dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="spy" name="SPY Mirror" stroke="#f59e0b" strokeWidth={2} fill="url(#perfSpyGrad)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
        <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 12 }}>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>— Portfolio</span>
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>— SPY Mirror</span>
        </div>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <MetricCard
          label="Portfolio Beta"
          value={s?.portfolioBeta != null ? fmt(s.portfolioBeta, 2) : '—'}
          sub={
            s?.portfolioBeta == null ? 'Not available' :
            s.portfolioBeta < 0.8   ? 'Lower volatility than market' :
            s.portfolioBeta > 1.2   ? 'Higher volatility than market' :
            'Close to market volatility'
          }
        />
        <MetricCard
          label="EUR/USD Rate"
          value={s?.eurNow != null ? s.eurNow.toFixed(4) : '—'}
          sub={s?.eurStart != null ? `At purchase: ${s.eurStart.toFixed(4)}` : null}
        />
        <MetricCard
          label="Currency Impact"
          value={s?.currencyImpact != null ? `$${fmt(Math.abs(s.currencyImpact))}` : '—'}
          sub={
            s?.currencyImpact == null ? 'No EUR/USD data' :
            s.currencyImpact >= 0     ? 'Tailwind (USD weakened)' :
                                        'Headwind (USD strengthened)'
          }
          valueColor={s?.currencyImpact != null ? clr(s.currencyImpact) : undefined}
        />
        <MetricCard
          label={s?.vsSpyPct != null && s.vsSpyPct >= 0 ? 'Outperforming' : 'Underperforming'}
          value={s?.vsSpyPct == null ? '—' : Math.abs(s.vsSpyPct).toFixed(1) + '%'}
          sub="vs SPY since purchase"
          valueColor={s ? clr(s.vsSpyPct) : undefined}
        />
      </div>

      {/* EUR/USD chart */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 10, padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
          EUR/USD (1 Year)
        </div>
        {dataLoading || !eurData.length ? (
          <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            {error ? `Error: ${error}` : 'Loading chart…'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={eurData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="eurGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid horizontal={true} vertical={false} stroke="var(--border-color)" strokeOpacity={0.5} strokeDasharray="0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval={eurXInt} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(3)} width={52} domain={['auto', 'auto']} />
              <Tooltip content={<EurTooltip />} />
              <Area type="monotone" dataKey="rate" name="EUR/USD" stroke="#a78bfa" strokeWidth={2} fill="url(#eurGrad)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Disclaimer */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
        Purchase dates are estimated by matching your average cost basis to historical weekly closing prices.
        SPY mirror assumes your total cost basis was invested in SPY at the estimated start date.
        Currency impact reflects the USD/EUR exchange-rate effect on your portfolio value since purchase.
        Past performance is not indicative of future results. Data provided for informational purposes only.
      </div>
    </div>
  );
}
