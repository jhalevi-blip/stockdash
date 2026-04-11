'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import DemoPrompt from '@/components/DemoPrompt';
import TransactionUpload from '@/components/TransactionUpload';

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
  let best = 0, bestDiff = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const diff = Math.abs(candles[i].close - avgCost);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}

/** Find candle index closest to a given YYYY-MM-DD date, approximating from array position */
function findStartIdx(candles, dateStr) {
  if (!candles?.length || !dateStr) return 0;
  const target = new Date(dateStr).getTime();
  const now = Date.now();
  let best = 0, bestDiff = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const weeksBack = candles.length - 1 - i;
    const ts = now - weeksBack * 7 * 24 * 60 * 60 * 1000;
    const diff = Math.abs(ts - target);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}

/** Convert a candle index back to an approximate YYYY-MM-DD date */
function candleIdxToDate(candles, idx) {
  if (!candles?.length) return '';
  const now = new Date();
  const weeksBack = candles.length - 1 - idx;
  const d = new Date(now.getTime() - weeksBack * 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
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
  const [holdings,       setHoldings]       = useState(null);
  const [rawData,        setRawData]        = useState(null);
  const [dataLoading,    setDataLoading]    = useState(false);
  const [error,          setError]          = useState(null);
  const [realizedData,   setRealizedData]   = useState(null);
  const [capitalAtStart, setCapitalAtStart]  = useState(null);
  const [startDate,      setStartDate]      = useState(null);  // YYYY-MM-DD or null
  const [dateInput,      setDateInput]      = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [estimatedDate,  setEstimatedDate]  = useState('');

  // Load holdings (demo or real) and saved start date
  useEffect(() => {
    async function loadHoldings() {
      const saved = localStorage.getItem('stockdash_start_date');
      if (saved) setStartDate(saved);
      const savedCap = localStorage.getItem('capital_at_start');
      if (savedCap) setCapitalAtStart(parseFloat(savedCap));

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

  // Fetch raw candle + valuation data once holdings are known
  useEffect(() => {
    if (holdings === null || !holdings.length) return;
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

        const spyCandles    = spyRes.candles ?? [];
        const eurCandles    = eurRes.candles ?? [];
        const valArr        = Array.isArray(valRes) ? valRes : [];
        const tickerCandles = {};
        tickers.forEach((t, i) => { tickerCandles[t] = tickerChartRes[i]?.candles ?? []; });

        // Compute Option B estimated start index (per-holding fallback when no h.d)
        const spyLen = spyCandles.length;
        const spyStartIndices = holdings.map(h => {
          // If holding has a user-supplied date, map it to a candle index
          if (h.d) return findStartIdx(spyCandles, h.d);
          // Otherwise estimate from avg cost
          const pIdx = estimatePurchaseIdx(tickerCandles[h.t], h.c);
          const tLen = tickerCandles[h.t].length;
          if (!tLen) return 0;
          return Math.round((pIdx / tLen) * spyLen);
        });
        const optionBIdx  = Math.min(...spyStartIndices, spyLen - 1);
        // If any holding has an explicit date, use the earliest one as the estimated date label
        const explicitDates = holdings.map(h => h.d).filter(Boolean);
        const earliestExplicit = explicitDates.length
          ? explicitDates.reduce((a, b) => a < b ? a : b)
          : null;
        const optionBDate = earliestExplicit ?? candleIdxToDate(spyCandles, optionBIdx);

        if (!cancelled) {
          setRawData({ spyCandles, eurCandles, valArr, tickerCandles });
          setEstimatedDate(optionBDate);
          setDateInput(d => d || optionBDate);
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

  // Recompute capitalAtStart from stored cashFlows whenever the start date changes
  useEffect(() => {
    const flows = realizedData?.cashFlows;
    if (!flows?.length) return;
    const dateToUse = startDate ?? dateInput;
    if (!dateToUse) return;
    const net = flows
      .filter(cf => cf.date && cf.date <= dateToUse)
      .reduce((s, cf) => s + (cf.action === 'buy' ? cf.amount : -cf.amount), 0);
    const cap = Math.round(Math.max(0, net) * 100) / 100;
    setCapitalAtStart(cap);
    localStorage.setItem('capital_at_start', String(cap));
  }, [realizedData, startDate, dateInput]);

  // Derive chart data and stats from rawData + startDate (re-runs when startDate changes)
  const { chartData, eurData, stats } = useMemo(() => {
    if (!rawData || !holdings?.length) return { chartData: [], eurData: [], stats: null };

    const { spyCandles, eurCandles, valArr, tickerCandles } = rawData;
    const spyLen = spyCandles.length;
    if (!spyLen) return { chartData: [], eurData: [], stats: null };

    // Determine start index: user-set date > earliest h.d > Option B estimation
    let startIdx;
    if (startDate) {
      startIdx = findStartIdx(spyCandles, startDate);
    } else {
      const explicitDates = holdings.map(h => h.d).filter(Boolean);
      const earliestDate  = explicitDates.length
        ? explicitDates.reduce((a, b) => a < b ? a : b)
        : null;
      if (earliestDate) {
        startIdx = findStartIdx(spyCandles, earliestDate);
      } else {
        const spyStartIndices = holdings.map(h => {
          const pIdx = estimatePurchaseIdx(tickerCandles[h.t], h.c);
          const tLen = tickerCandles[h.t].length;
          if (!tLen) return 0;
          return Math.round((pIdx / tLen) * spyLen);
        });
        startIdx = Math.min(...spyStartIndices, spyLen - 1);
      }
    }

    // SPY mirror: use transaction-derived capital if available, else fall back to cost basis
    const totalCostBasis  = holdings.reduce((sum, h) => sum + h.s * h.c, 0);
    const spyBase         = capitalAtStart != null ? capitalAtStart : totalCostBasis;
    const spyPriceAtStart = spyCandles[startIdx]?.close ?? spyCandles[0].close;
    const spyShares       = spyPriceAtStart > 0 ? spyBase / spyPriceAtStart : 0;

    // Build portfolio vs SPY chart from startIdx onward
    const chartPoints = [];
    for (let i = startIdx; i < spyLen; i++) {
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

    // EUR/USD — slice from startIdx
    const eurStartIdx  = Math.min(startIdx, eurCandles.length - 1);
    const eurSliced    = eurCandles.slice(eurStartIdx);
    const eurData      = eurSliced.map(c => ({ date: c.date, rate: c.close }));
    const eurStart     = eurCandles[eurStartIdx]?.close ?? null;
    const eurNow       = eurCandles[eurCandles.length - 1]?.close ?? null;
    const eurChangePct = eurStart && eurNow ? ((eurNow - eurStart) / eurStart) * 100 : null;
    let currencyImpact = null;
    if (eurStart && eurNow && eurStart > 0 && eurNow > 0) {
      currencyImpact = portNow * (1 / eurNow - 1 / eurStart);
    }

    // Portfolio beta: market-cap weighted
    let totalMktCap = 0, weightedBeta = 0;
    valArr.forEach(v => {
      if (v.beta != null && v.marketCap != null && v.marketCap > 0) {
        totalMktCap  += v.marketCap;
        weightedBeta += v.beta * v.marketCap;
      }
    });
    const portfolioBeta = totalMktCap > 0 ? weightedBeta / totalMktCap : null;

    const spyMirrorNow = chartPoints[chartPoints.length - 1]?.spy ?? null;
    const vsSpyAmt     = portNow != null && spyMirrorNow != null ? portNow - spyMirrorNow : null;
    const portStart    = chartPoints[0]?.portfolio ?? totalCostBasis;
    const spyStart     = chartPoints[0]?.spy ?? totalCostBasis;
    const portReturn   = portStart > 0 ? ((portNow - portStart) / portStart) * 100 : null;
    const spyReturn    = spyStart  > 0 ? ((spyMirrorNow - spyStart) / spyStart) * 100 : null;

    return {
      chartData: chartPoints,
      eurData,
      stats: { portNow, spyMirrorNow, vsSpyAmt, portReturn, spyReturn, portfolioBeta, eurNow, eurStart, eurChangePct, currencyImpact, totalCostBasis },
    };
  }, [rawData, holdings, startDate, capitalAtStart]);

  function handleDateSave() {
    if (!dateInput) return;
    setStartDate(dateInput);
    localStorage.setItem('stockdash_start_date', dateInput);
    setShowDatePicker(false);
  }

  function handleDateClear() {
    setStartDate(null);
    localStorage.removeItem('stockdash_start_date');
    setDateInput(estimatedDate);
    setShowDatePicker(false);
  }

  // --- Render ---
  if (holdings === null) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>;
  }
  if (!holdings.length) {
    return <DemoPrompt message="No portfolio configured" />;
  }

  const s         = stats;
  const xInterval = Math.max(1, Math.floor((chartData.length - 1) / 5));
  const eurXInt   = Math.max(1, Math.floor((eurData.length - 1) / 5));

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Section header with start date display and picker trigger */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Since:{' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            {startDate ?? (estimatedDate ? `~${estimatedDate} (estimated)` : '—')}
          </strong>
        </div>
        <button
          onClick={() => setShowDatePicker(v => !v)}
          style={{
            background: 'none', border: 'none', padding: '2px 6px',
            cursor: 'pointer', fontSize: 12, color: 'var(--accent)',
            borderRadius: 4, textDecoration: 'underline', lineHeight: 1,
          }}
        >
          {showDatePicker ? 'Cancel' : 'Set start date'}
        </button>
        {startDate && !showDatePicker && (
          <button
            onClick={handleDateClear}
            style={{
              background: 'none', border: 'none', padding: '2px 6px',
              cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)',
              borderRadius: 4, lineHeight: 1,
            }}
          >
            Reset to estimated
          </button>
        )}
      </div>

      {/* Inline date picker */}
      {showDatePicker && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 8, padding: '14px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Start date:</label>
          <input
            type="date"
            value={dateInput}
            onChange={e => setDateInput(e.target.value)}
            style={{
              background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
              borderRadius: 6, padding: '6px 10px', fontSize: 13,
              color: 'var(--text-primary)', outline: 'none',
            }}
          />
          <button
            onClick={handleDateSave}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 6, padding: '6px 14px', fontSize: 13,
              cursor: 'pointer', fontWeight: 600,
            }}
          >
            Apply
          </button>
          {estimatedDate && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Estimated: {estimatedDate}
            </span>
          )}
        </div>
      )}

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
          sub={
            s == null ? null :
            capitalAtStart != null
              ? `Based on €${fmt(capitalAtStart, 0)} invested at ${startDate ?? dateInput} · SPY ${fmtD(s.spyReturn, 1)}`
              : s.spyReturn != null ? `SPY return: ${fmtD(s.spyReturn, 1)}` : null
          }
        />
        <StatCard
          label="vs SPY"
          value={s?.vsSpyAmt == null ? '—' : (s.vsSpyAmt >= 0 ? '+$' : '-$') + fmt(Math.abs(s.vsSpyAmt))}
          sub={s?.portReturn != null ? `Portfolio: ${fmtD(s.portReturn, 1)}` : null}
          valueColor={s ? clr(s.vsSpyAmt) : undefined}
        />
      </div>

      {/* Portfolio vs SPY chart */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 10, padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
          Portfolio vs SPY
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
                  <stop offset="0%" stopColor="#4ade80" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#4ade80" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid horizontal={true} vertical={false} stroke="var(--border-color)" strokeOpacity={0.5} strokeDasharray="0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval={xInterval} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} width={52} />
              <Tooltip content={<PortTooltip />} />
              <Area type="monotone" dataKey="portfolio" name="Portfolio" stroke="#58a6ff" strokeWidth={2} fill="url(#perfPortGrad)" dot={false} activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="spy" name="SPY Mirror" stroke="#4ade80" strokeWidth={2} fill="url(#perfSpyGrad)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
        <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 12 }}>
          <span style={{ color: '#58a6ff', fontWeight: 600 }}>— Portfolio</span>
          <span style={{ color: '#4ade80', fontWeight: 600 }}>— SPY Mirror</span>
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
          sub={s?.eurChangePct != null ? `${fmtD(s.eurChangePct, 2)} since start` : s?.eurStart != null ? `At start: ${s.eurStart.toFixed(4)}` : null}
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
          label={s?.vsSpyAmt != null && s.vsSpyAmt >= 0 ? 'Outperforming' : 'Underperforming'}
          value={s?.vsSpyAmt == null ? '—' : (s.vsSpyAmt >= 0 ? '+$' : '-$') + fmt(Math.abs(s.vsSpyAmt))}
          sub="vs SPY since start"
          valueColor={s ? clr(s.vsSpyAmt) : undefined}
        />
        {realizedData && (() => {
          const { positions = [], totalPnl } = realizedData;
          const best  = positions.length ? positions.reduce((a, b) => b.pnl > a.pnl ? b : a) : null;
          const worst = positions.length ? positions.reduce((a, b) => b.pnl < a.pnl ? b : a) : null;
          return (
            <MetricCard
              label="Realized P&L"
              value={totalPnl == null ? '—' : (totalPnl >= 0 ? '+€' : '-€') + fmt(Math.abs(totalPnl))}
              sub={
                positions.length
                  ? `${positions.length} closed · best: ${best?.symbol ?? '—'} worst: ${worst?.symbol ?? '—'}`
                  : 'No closed positions'
              }
              valueColor={clr(totalPnl)}
            />
          );
        })()}
      </div>

      {/* EUR/USD chart */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 10, padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
          EUR/USD{startDate ? ` (since ${startDate})` : ' (since start)'}
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
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid horizontal={true} vertical={false} stroke="var(--border-color)" strokeOpacity={0.5} strokeDasharray="0" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval={eurXInt} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(3)} width={52} domain={['auto', 'auto']} />
              <Tooltip content={<EurTooltip />} />
              <Area type="monotone" dataKey="rate" name="EUR/USD" stroke="#f59e0b" strokeWidth={2} fill="url(#eurGrad)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Transaction Upload — Realized P&L */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 10, padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Upload Transactions
        </div>
        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 16 }}>
          Upload your broker transaction export to calculate realized P&amp;L on closed positions using FIFO.
        </div>
        <TransactionUpload
          startDate={startDate ?? dateInput}
          onResults={(data) => {
            setRealizedData(data);
            if (data?.capitalAtStart != null) {
              setCapitalAtStart(data.capitalAtStart);
              localStorage.setItem('capital_at_start', String(data.capitalAtStart));
            } else if (!data) {
              setCapitalAtStart(null);
              localStorage.removeItem('capital_at_start');
            }
          }}
        />
      </div>

      {/* Disclaimer */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
        {startDate
          ? 'Start date is user-configured. '
          : 'Purchase dates are estimated by matching your average cost basis to historical weekly closing prices. '}
        SPY mirror assumes your total cost basis was invested in SPY at the start date.
        Currency impact reflects the USD/EUR exchange-rate effect on your portfolio value since the start date.
        Past performance is not indicative of future results. Data provided for informational purposes only.
      </div>
    </div>
  );
}
