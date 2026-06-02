'use client';
import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import SignupGate from '@/components/SignupGate';
import DemoPrompt from '@/components/DemoPrompt';
import UnifiedUpload from '@/components/UnifiedUpload';
import { useHoldings } from '@/lib/useHoldings';
import InfoTooltip from '@/components/InfoTooltip';

/* ─── Formatters ─────────────────────────────────────────────────────────── */
const fmt  = (n, d = 2) => n?.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) ?? '—';
const fmtD = (n, d = 2) => (n == null ? '—' : (n >= 0 ? '+' : '') + fmt(n, d) + '%');
const clr  = (n) => n == null ? 'var(--text-secondary)' : n >= 0 ? 'var(--positive)' : 'var(--negative)';

/* ─── Helpers (verbatim from V1) ─────────────────────────────────────────── */
function estimatePurchaseIdx(candles, avgCost) {
  if (!candles?.length || avgCost == null || avgCost <= 0) return 0;
  let best = 0, bestDiff = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const diff = Math.abs(candles[i].close - avgCost);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}

function candleIdxToDate(candles, idx) {
  if (!candles?.length) return '';
  const now = new Date();
  const weeksBack = candles.length - 1 - idx;
  const d = new Date(now.getTime() - weeksBack * 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function findCandleByDate(candles, dateStr) {
  if (!candles?.length || !dateStr) return 0;
  const target = new Date(dateStr).getTime();
  let best = 0, bestDiff = Infinity;
  for (let i = 0; i < candles.length; i++) {
    const diff = Math.abs(new Date(candles[i].date).getTime() - target);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}

/* ─── StatCard ───────────────────────────────────────────────────────────── */
// V2 mobile fix: flex '1 1 180px' (was '1 1 0' in V1 — collapsed to zero on mobile)
function StatCard({ label, value, sub, valueColor }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 10,
      padding: '20px 24px',
      flex: '1 1 180px',
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

/* ─── PortTooltip ────────────────────────────────────────────────────────── */
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
          {p.name}: {p.value >= 0 ? '+' : ''}{p.value?.toFixed(2)}%
        </div>
      ))}
    </div>
  );
}

/* ─── EurTooltip ─────────────────────────────────────────────────────────── */
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

/* ─── MetricCard ─────────────────────────────────────────────────────────── */
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

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function PerformanceV2Page() {
  const { user, isLoaded, isSignedIn } = useUser();
  const { holdings, error: holdingsError, refresh: holdingsRefresh } = useHoldings();
  // ── All 11 state slots declared now (9B/9C consume remaining fields) ──────
  const [rawData,        setRawData]        = useState(null);
  const [dataLoading,    setDataLoading]    = useState(false);
  const [error,          setError]          = useState(null);
  const [realizedData,   setRealizedData]   = useState(null);   // wired in 9C via TransactionUpload onResults
  const [startDate,      setStartDate]      = useState(null);   // YYYY-MM-DD or null
  const [dateInput,      setDateInput]      = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [estimatedDate,  setEstimatedDate]  = useState('');
  const [startingCash,   setStartingCash]   = useState(0);
  const [cashCurrency,   setCashCurrency]   = useState('EUR'); // 'EUR' | 'USD'
  // Stage 2a: start-date closes for reconstructed-start-value preview (display only).
  // Shape: { loading } | { error } | { prices: {ticker: close}, missing: [ticker] }
  const [startReconPrices, setStartReconPrices] = useState(null);

  /* ── Restore persisted date/cash preferences from localStorage ──────────── */
  useEffect(() => {
    const saved = localStorage.getItem('stockdash_start_date');
    if (saved) setStartDate(saved);
    const savedCash = localStorage.getItem('starting_cash_eur');
    if (savedCash) setStartingCash(parseFloat(savedCash) || 0);
    const savedCashCcy = localStorage.getItem('starting_cash_currency');
    if (savedCashCcy === 'EUR' || savedCashCcy === 'USD') setCashCurrency(savedCashCcy);
  }, []);

  /* ── Load realized P&L from Supabase (migrate localStorage on first load) ── */
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;
    let cancelled = false;

    (async () => {
      try {
        const res  = await fetch('/api/realized-data');
        const json = await res.json();
        if (cancelled) return;

        if (res.ok && json.transactions) {
          setRealizedData(json.transactions);
        } else {
          // Server empty — one-time migration from localStorage
          const raw = localStorage.getItem(`realized_pnl_${user.id}`)
                   ?? localStorage.getItem('realized_pnl');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (!cancelled) setRealizedData(parsed);
            // Persist to server so future loads come from Supabase
            fetch('/api/realized-data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transactions: parsed }),
            }).catch(() => {});
          }
        }
      } catch {
        // Silent degradation — page shows the upload prompt when realizedData is null
      }
    })();

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, user?.id]);

  /* ── Fetch raw candle + valuation data once holdings are known ───────────── */
  useEffect(() => {
    if (holdings === null || !holdings.length) return;
    let cancelled = false;
    setDataLoading(true);
    setError(null);

    async function fetchAll() {
      try {
        const tickers = holdings.map(h => h.t);
        const [spyRes, eurRes, valRes, pricesRes, ...tickerChartRes] = await Promise.all([
          fetch('/api/chart?symbol=SPY').then(r => r.json()),
          fetch('/api/chart?symbol=EURUSD%3DX').then(r => r.json()),
          fetch(`/api/valuation?${tickers.map(t => `tickers=${t}`).join('&')}`).then(r => r.json()),
          fetch(`/api/prices?tickers=SPY,${tickers.join(',')}`).then(r => r.json()),
          ...tickers.map(t => fetch(`/api/chart?symbol=${t}`).then(r => r.json())),
        ]);
        if (cancelled) return;

        const spyCandles    = spyRes.candles ?? [];
        const eurCandles    = eurRes.candles ?? [];
        const valArr        = Array.isArray(valRes) ? valRes : [];
        const tickerCandles = {};
        tickers.forEach((t, i) => { tickerCandles[t] = tickerChartRes[i]?.candles ?? []; });

        const livePrices = {};
        if (Array.isArray(pricesRes)) {
          pricesRes.forEach(p => { if (p.ticker && p.price != null) livePrices[p.ticker] = p.price; });
        }

        // Estimate start index from cost basis / explicit purchase dates
        const spyLen = spyCandles.length;
        const spyStartIndices = holdings.map(h => {
          if (h.d) return findCandleByDate(spyCandles, h.d);
          const pIdx = estimatePurchaseIdx(tickerCandles[h.t], h.c);
          const tLen = tickerCandles[h.t].length;
          if (!tLen) return 0;
          return Math.round((pIdx / tLen) * spyLen);
        });
        const optionBIdx      = Math.min(...spyStartIndices, spyLen - 1);
        const explicitDates   = holdings.map(h => h.d).filter(Boolean);
        const earliestExplicit = explicitDates.length
          ? explicitDates.reduce((a, b) => a < b ? a : b)
          : null;
        const optionBDate = earliestExplicit ?? candleIdxToDate(spyCandles, optionBIdx);

        if (!cancelled) {
          setRawData({ spyCandles, eurCandles, valArr, tickerCandles, livePrices });
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

  /* ── Full stats useMemo — all fields computed now ────────────────────────
     9A renders:  portNow, spyMirrorNow, vsSpyPct, portReturn, spyReturn,
                  adjustedCostBasis, totalCostBasis, netCapital,
                  startingCashUSD, realizedGainsUSD, hasRealizedData, twr
     9B consumes: chartData, eurData, portfolioBeta, eurNow, eurStart,
                  eurChangePct, currencyImpact, vsSpyAmt
     ─────────────────────────────────────────────────────────────────────── */
  const { chartData, eurData, stats } = useMemo(() => {
    if (!rawData || !holdings?.length) return { chartData: [], eurData: [], stats: null };

    const { spyCandles, eurCandles, valArr, tickerCandles, livePrices = {} } = rawData;
    const spyLen = spyCandles.length;
    if (!spyLen) return { chartData: [], eurData: [], stats: null };

    const eurUsd         = eurCandles[eurCandles.length - 1]?.close ?? 1;
    const totalCostBasis = holdings.reduce((sum, h) => sum + h.s * h.c, 0);

    const startingCashUSD   = cashCurrency === 'USD'
      ? (startingCash || 0)
      : (startingCash || 0) * eurUsd;
    const adjustedCostBasis = Math.max(0, totalCostBasis - startingCashUSD);

    // Current portfolio value — live Finnhub prices, fallback to last candle close
    // __CASH__ positions excluded (not invested capital)
    let portNow = 0;
    holdings.forEach(h => {
      if (h.t === '__CASH__') return;
      const price = livePrices[h.t] ?? tickerCandles[h.t]?.[tickerCandles[h.t].length - 1]?.close;
      if (price != null) portNow += h.s * price;
    });

    function portValAt(i) {
      let v = 0;
      holdings.forEach(h => {
        const tc = tickerCandles[h.t];
        if (!tc.length) return;
        v += h.s * (tc[Math.min(Math.round((i / spyLen) * tc.length), tc.length - 1)]?.close ?? h.c);
      });
      return v;
    }

    const realizedGainsUSD   = (realizedData?.totalPnl ?? 0) * eurUsd;
    const totalCostWithGains = adjustedCostBasis + realizedGainsUSD;
    const netCapital         = totalCostWithGains;

    // Determine start candle index
    let startIdx;
    if (startDate) {
      startIdx = findCandleByDate(spyCandles, startDate);
    } else {
      const explicitDates = holdings.map(h => h.d).filter(Boolean);
      const earliestDate  = explicitDates.length
        ? explicitDates.reduce((a, b) => a < b ? a : b) : null;
      if (earliestDate) {
        startIdx = findCandleByDate(spyCandles, earliestDate);
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

    const spyPriceAtStart = spyCandles[startIdx]?.close ?? spyCandles[0]?.close ?? 0;
    const spyShares       = spyPriceAtStart > 0 ? netCapital / spyPriceAtStart : 0;

    // Build chart points from startIdx to end
    const chartPoints = [];
    for (let i = startIdx; i < spyLen; i++) {
      chartPoints.push({
        date:      spyCandles[i].date,
        label:     spyCandles[i].label,
        portfolio: portValAt(i),
        spy:       spyShares * spyCandles[i].close,
      });
    }

    // Append live "today" point when today is after the last weekly candle
    const liveSpyPrice   = livePrices['SPY'] ?? null;
    const today          = new Date().toISOString().slice(0, 10);
    const todayLabel     = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const lastCandleDate = spyCandles[spyLen - 1]?.date ?? '';
    if (portNow > 0 && liveSpyPrice && today > lastCandleDate) {
      chartPoints.push({ date: today, label: todayLabel, portfolio: portNow, spy: spyShares * liveSpyPrice });
    }

    // Pin last point to live price so chart endpoint matches stat cards
    if (portNow > 0 && chartPoints.length > 0) {
      chartPoints[chartPoints.length - 1].portfolio = portNow;
    }

    const spyMirrorNow = chartPoints[chartPoints.length - 1]?.spy ?? null;
    const portReturn   = totalCostWithGains > 0 ? ((portNow - totalCostWithGains) / totalCostWithGains) * 100 : null;

    // Normalize to % return (both lines start at 0%)
    const portBase = netCapital;
    const spyBase  = chartPoints[0]?.spy ?? netCapital;
    let chartData  = portBase > 0 && spyBase > 0
      ? chartPoints.map(p => ({
          date:      p.date,
          label:     p.label,
          portfolio: (p.portfolio / portBase - 1) * 100,
          spy:       (p.spy       / spyBase  - 1) * 100,
        }))
      : [];

    // Shift so both lines start exactly at 0% on the start date
    if (chartData.length > 0 && chartData[0].portfolio != null) {
      const portOffset = chartData[0].portfolio;
      const spyOffset  = chartData[0].spy;
      chartData = chartData.map(p => ({
        ...p,
        portfolio: p.portfolio - portOffset,
        spy:       p.spy       - spyOffset,
      }));
    }

    // Pin last chart point to portReturn so line endpoint matches legend
    if (chartData.length > 0 && portReturn != null) {
      chartData[chartData.length - 1] = {
        ...chartData[chartData.length - 1],
        portfolio: portReturn,
      };
    }

    // EUR/USD series for the EUR chart (Phase 9B)
    const eurStartIdx  = Math.min(startIdx, eurCandles.length - 1);
    const eurData      = eurCandles.slice(eurStartIdx).map(c => ({ date: c.date, label: c.label, rate: c.close }));
    const eurStart     = eurCandles[eurStartIdx]?.close ?? null;
    const eurNow       = eurCandles[eurCandles.length - 1]?.close ?? null;
    const eurChangePct = eurStart && eurNow ? ((eurNow - eurStart) / eurStart) * 100 : null;
    let currencyImpact = null;
    if (eurStart && eurNow && eurStart > 0 && eurNow > 0) {
      currencyImpact = portNow * (1 / eurNow - 1 / eurStart);
    }

    // Portfolio beta — market-cap weighted (Phase 9B)
    let totalMktCap = 0, weightedBeta = 0;
    valArr.forEach(v => {
      if (v.beta != null && v.marketCap != null && v.marketCap > 0) {
        totalMktCap  += v.marketCap;
        weightedBeta += v.beta * v.marketCap;
      }
    });
    const portfolioBeta = totalMktCap > 0 ? weightedBeta / totalMktCap : null;

    const vsSpyAmt  = spyMirrorNow != null ? portNow - spyMirrorNow : null;
    const spyStart  = chartPoints[0]?.spy ?? netCapital;
    const spyReturn = spyStart > 0 && spyMirrorNow != null ? ((spyMirrorNow - spyStart) / spyStart) * 100 : null;
    const vsSpyPct  = portReturn != null && spyReturn != null ? portReturn - spyReturn : null;

    // Modified Dietz — deposit-timing-adjusted return.
    // MDR = (EndValue - StartValue - ΣDeposits) / (StartValue + Σ(Deposit × WeightRemaining))
    // Weight W_i = (T - t_i) / T where T = total candles in period, t_i = candles elapsed at deposit.
    let twr = null;
    const twrDeposits = (realizedData?.deposits ?? [])
      .filter(d => d.date && d.amountEur > 0)
      .sort((a, b) => a.date < b.date ? -1 : 1)
      .map(d => ({ amountUSD: d.amountEur * eurUsd, idx: findCandleByDate(spyCandles, d.date) }))
      .filter(d => d.idx > startIdx && d.idx < spyLen - 1);

    if (twrDeposits.length > 0) {
      const T           = (spyLen - 1) - startIdx;
      const startValue  = startingCashUSD;
      const totalDep    = twrDeposits.reduce((s, d) => s + d.amountUSD, 0);
      const weightedDep = twrDeposits.reduce((s, d) => {
        const t_i = d.idx - startIdx;
        return s + d.amountUSD * ((T - t_i) / T);
      }, 0);
      const denom = startValue + weightedDep;
      if (denom > 0) twr = ((portNow - startValue - totalDep) / denom) * 100;
    }

    return {
      chartData,
      eurData,
      stats: {
        portNow, spyMirrorNow, vsSpyAmt, vsSpyPct, portReturn, spyReturn,
        twr, portfolioBeta, eurNow, eurStart, eurChangePct, currencyImpact,
        totalCostBasis, adjustedCostBasis, startingCashUSD, netCapital,
        realizedGainsUSD, hasRealizedData: realizedData != null,
      },
    };
  }, [rawData, holdings, startDate, realizedData, startingCash, cashCurrency]);

  /* ── Stage 2a: reconstructed start value (DISPLAY ONLY — NOT wired to TWR) ────
     Rebuilds portfolio value as of the start date from the data persisted in
     Stage 1 (realizedData.tradeLegs + realizedData.cashEvents). This is a
     verification preview only — the Modified Dietz startValue above is left
     unchanged on purpose. ─────────────────────────────────────────────────── */

  // Do we have the Stage-1 arrays at all? Drives the graceful "no data" note.
  const hasReconData =
    Array.isArray(realizedData?.tradeLegs) && Array.isArray(realizedData?.cashEvents);

  // Effective reconstruction date. Falls back to the page's estimated date when
  // the user hasn't pinned a start date, so the preview is still useful.
  const reconStartDate = startDate ?? estimatedDate ?? '';

  // Start-held shares: net signed shares per ticker across all legs dated strictly
  // before the start date. Floor ≤0 to drop fully-closed / short artifacts
  // (e.g. AVGO buy 3 / sell 30 → −27 → dropped). tradeLeg.d / reconStartDate are
  // ISO YYYY-MM-DD, so string comparison is correct.
  const startHeld = useMemo(() => {
    if (!hasReconData || !reconStartDate) return null;
    const net = {};
    for (const leg of realizedData.tradeLegs) {
      if (!leg?.t || !leg?.d) continue;
      if (leg.d < reconStartDate) net[leg.t] = (net[leg.t] ?? 0) + (leg.s ?? 0);
    }
    const held = {};
    for (const [t, sh] of Object.entries(net)) {
      if (sh > 1e-9) held[t] = Math.round(sh * 1e8) / 1e8;
    }
    return held;
  }, [hasReconData, realizedData, reconStartDate]);

  // Cash at start (EUR): sum of every cashEvent dated strictly before the start date.
  const startCashEur = useMemo(() => {
    if (!hasReconData || !reconStartDate) return null;
    let sum = 0;
    for (const e of realizedData.cashEvents) {
      if (e?.date && e.date < reconStartDate && typeof e.amountEur === 'number') sum += e.amountEur;
    }
    return sum;
  }, [hasReconData, realizedData, reconStartDate]);

  // Fetch start-date closes for the start-held tickers (≤20). years=2 gives margin
  // around the start date. Mirrors the dashboard's historical-prices consumption:
  // the per-ticker series is sorted ascending, so the close on — or the most recent
  // trading day before — the start date is the last row with date ≤ reconStartDate
  // (carry-forward over weekends/holidays).
  useEffect(() => {
    if (!startHeld || !reconStartDate) { setStartReconPrices(null); return; }
    const tickers = Object.keys(startHeld).slice(0, 20);
    if (!tickers.length) { setStartReconPrices({ prices: {}, missing: [] }); return; }

    let cancelled = false;
    setStartReconPrices({ loading: true });
    (async () => {
      try {
        const res  = await fetch(`/api/historical-prices?tickers=${tickers.join(',')}&years=2`);
        const json = await res.json();
        if (cancelled) return;

        const byTicker = {};
        for (const { ticker, prices: p } of (Array.isArray(json?.data) ? json.data : [])) {
          byTicker[ticker] = p ?? [];
        }
        const prices = {};
        const missing = [];
        for (const t of tickers) {
          let close = null;
          for (const row of (byTicker[t] ?? [])) {
            if (row.date <= reconStartDate) close = row.close; // carry forward
            else break;
          }
          if (close == null) missing.push(t);
          else prices[t] = close;
        }
        setStartReconPrices({ prices, missing });
      } catch (e) {
        if (!cancelled) setStartReconPrices({ error: e?.message ?? 'Failed to load start-date prices' });
      }
    })();
    return () => { cancelled = true; };
  }, [startHeld, reconStartDate]);

  // Combine cash + holdings into the reconstructed start value.
  // USD→EUR uses eurStart (the start-date FX from the stats memo), NOT the latest
  // eurUsd. Start-held tickers here are US-listed (USD), so historical closes are
  // USD; EUR-listed start holdings would need their own conversion (deferred).
  const startRecon = useMemo(() => {
    if (!startHeld || startCashEur == null) return null;
    const eurStart  = stats?.eurStart ?? null;
    const priceSt   = startReconPrices;
    const havePrice = priceSt && priceSt.prices;

    const breakdown = [];
    const missing   = [];
    let holdingsValueUSD = 0;
    for (const t of Object.keys(startHeld)) {
      const shares = startHeld[t];
      const close  = havePrice ? priceSt.prices[t] : undefined;
      if (close == null) { missing.push(t); breakdown.push({ t, shares, close: null, valueUSD: null }); continue; }
      const valueUSD = shares * close;
      holdingsValueUSD += valueUSD;
      breakdown.push({ t, shares, close, valueUSD });
    }
    const holdingsValueEur = eurStart && eurStart > 0 ? holdingsValueUSD / eurStart : null;
    const totalEur         = holdingsValueEur != null ? startCashEur + holdingsValueEur : null;

    return {
      reconStartDate,
      cashEur:          startCashEur,
      holdingsValueUSD,
      holdingsValueEur,
      totalEur,
      eurStart,
      breakdown:        breakdown.sort((a, b) => (b.valueUSD ?? 0) - (a.valueUSD ?? 0)),
      missing,
      loading:          !!priceSt?.loading,
      error:            priceSt?.error ?? null,
    };
  }, [startHeld, startCashEur, startReconPrices, stats, reconStartDate]);

  // Secondary detail: dump the per-ticker breakdown to the console for inspection.
  useEffect(() => {
    if (startRecon && !startRecon.loading && !startRecon.error && startRecon.breakdown.length) {
      console.table(startRecon.breakdown.map(b => ({
        ticker: b.t, shares: b.shares, startClose: b.close, valueUSD: b.valueUSD,
      })));
    }
  }, [startRecon]);

  /* ── Date handlers ───────────────────────────────────────────────────────── */
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

  const s        = stats;
  const xInterval = Math.max(1, Math.floor((chartData.length - 1) / 5));
  const eurXInt   = Math.max(1, Math.floor((eurData.length   - 1) / 5));

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div style={{
      padding: '18px 20px',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>

      {/* ── Page heading — outside SignupGate (logged-out users see context) ── */}
      <div style={{ marginBottom: 2 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4,
        }}>
          Portfolio
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          Performance
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 600 }}>
          Track your portfolio return vs. SPY, EUR/USD impact, and realized P&amp;L.
        </p>
      </div>

      {/* ── SignupGate — all data + interactive content is auth-gated ────────── */}
      <SignupGate
        title="Performance"
        description="Sign up to track your portfolio return vs. SPY, analyze EUR/USD currency impact, and calculate realized P&L on closed positions."
      >
        {holdingsError ? (
          /* Fetch failed — show error + retry */
          <div style={{
            minHeight: 200, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
            color: 'var(--text-secondary)', fontSize: 14,
          }}>
            <div>We couldn't load your portfolio.</div>
            <button onClick={holdingsRefresh} style={{
              background: '#2563eb', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              padding: '9px 20px',
            }}>Retry</button>
          </div>
        ) : holdings === null ? (
          /* Holdings not yet resolved */
          <div className="chart-placeholder">Loading portfolio…</div>
        ) : !holdings.length ? (
          /* No holdings configured */
          <DemoPrompt message="No portfolio configured. Add holdings to track your performance." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Header: date pill + date picker toggle + starting cash ──────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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

              {/* Starting cash input + EUR/USD toggle */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
                title="Enter your cash balance at the start date to subtract it from cost basis for accurate P&L calculations"
              >
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Starting cash:</span>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{
                    position: 'absolute', left: 8, fontSize: 12,
                    color: 'var(--text-secondary)', pointerEvents: 'none',
                  }}>
                    {cashCurrency === 'EUR' ? '€' : '$'}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={startingCash || ''}
                    placeholder="0.00"
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 0;
                      setStartingCash(v);
                      if (v > 0) localStorage.setItem('starting_cash_eur', String(v));
                      else localStorage.removeItem('starting_cash_eur');
                    }}
                    style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                      borderRadius: 6, padding: '4px 8px 4px 22px', fontSize: 12,
                      color: 'var(--text-primary)', outline: 'none', width: 100,
                    }}
                  />
                </div>
                {['EUR', 'USD'].map(ccy => (
                  <button
                    key={ccy}
                    onClick={() => {
                      setCashCurrency(ccy);
                      localStorage.setItem('starting_cash_currency', ccy);
                    }}
                    style={{
                      background: 'none',
                      border: `1px solid ${cashCurrency === ccy ? '#22d3ee' : 'var(--border-color)'}`,
                      borderRadius: 4, padding: '3px 7px', fontSize: 11, cursor: 'pointer',
                      color: cashCurrency === ccy ? '#22d3ee' : 'var(--text-muted)',
                      fontWeight: cashCurrency === ccy ? 600 : 400,
                      lineHeight: 1,
                    }}
                  >
                    {ccy === 'EUR' ? '€' : '$'}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Stage 2a preview: reconstructed start value (DISPLAY ONLY) ────
                Verification panel — NOT wired into the TWR / Modified Dietz math. */}
            <div style={{
              background: 'var(--bg-card)', border: '1px dashed var(--border-color)',
              borderRadius: 10, padding: '14px 18px',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
                textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8,
              }}>
                Reconstructed start value — preview
              </div>

              {!hasReconData ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  No <code>tradeLegs</code> / <code>cashEvents</code> data — re-upload your
                  broker file to enable start-value reconstruction.
                </div>
              ) : !reconStartDate ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Set a start date to reconstruct the portfolio value as of that date.
                </div>
              ) : startRecon?.loading ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Loading start-date prices…
                </div>
              ) : startRecon?.error ? (
                <div style={{ fontSize: 12, color: 'var(--negative)' }}>
                  Start-date price fetch failed: {startRecon.error}
                </div>
              ) : startRecon ? (
                <>
                  {/* Headline components */}
                  <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Reconstructed total (EUR)</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {startRecon.totalEur != null ? `€${fmt(startRecon.totalEur)}` : '—'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        as of {startRecon.reconStartDate}{startDate ? '' : ' (estimated)'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Cash</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                        €{fmt(startRecon.cashEur)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>cashEvents &lt; start</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Holdings</div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {startRecon.holdingsValueEur != null ? `€${fmt(startRecon.holdingsValueEur)}` : '—'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        ${fmt(startRecon.holdingsValueUSD)} @ eurStart {startRecon.eurStart != null ? startRecon.eurStart.toFixed(4) : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Per-ticker breakdown */}
                  {startRecon.breakdown.length > 0 && (
                    <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%', maxWidth: 460 }}>
                      <thead>
                        <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                          <th style={{ padding: '2px 8px 2px 0', fontWeight: 600 }}>Ticker</th>
                          <th style={{ padding: '2px 8px', fontWeight: 600, textAlign: 'right' }}>Shares</th>
                          <th style={{ padding: '2px 8px', fontWeight: 600, textAlign: 'right' }}>Start close</th>
                          <th style={{ padding: '2px 0 2px 8px', fontWeight: 600, textAlign: 'right' }}>Value (USD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {startRecon.breakdown.map(b => (
                          <tr key={b.t} style={{ color: 'var(--text-secondary)' }}>
                            <td style={{ padding: '2px 8px 2px 0', color: 'var(--text-primary)' }}>{b.t}</td>
                            <td style={{ padding: '2px 8px', textAlign: 'right' }}>{fmt(b.shares, 0)}</td>
                            <td style={{ padding: '2px 8px', textAlign: 'right' }}>
                              {b.close != null ? `$${fmt(b.close)}` : <span style={{ color: 'var(--negative)' }}>no close</span>}
                            </td>
                            <td style={{ padding: '2px 0 2px 8px', textAlign: 'right' }}>
                              {b.valueUSD != null ? `$${fmt(b.valueUSD)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Surface tickers with no available start-date close (not valued at 0) */}
                  {startRecon.missing.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--negative)', marginTop: 8 }}>
                      No start-date close for: {startRecon.missing.join(', ')} — excluded from
                      holdings value (not counted as 0).
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* ── Inline date picker popover ──────────────────────────────────── */}
            {showDatePicker && (
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: 8, padding: '14px 20px',
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

            {/* ── 4 Stat Cards ─────────────────────────────────────────────────
                TWR card omitted when null (Choice A — V1 parity, wired in 9C)  */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <StatCard
                label="Portfolio Value"
                value={s ? `$${fmt(s.portNow)}` : '…'}
                sub={
                  s == null ? null :
                  s.startingCashUSD > 0 && s.realizedGainsUSD > 0
                    ? `$${fmt(s.totalCostBasis)} − ${cashCurrency === 'EUR' ? '€' : '$'}${fmt(startingCash)} cash = $${fmt(s.adjustedCostBasis)} + $${fmt(s.realizedGainsUSD, 0)} reinvested = $${fmt(s.netCapital, 0)}`
                    : s.startingCashUSD > 0
                    ? `$${fmt(s.totalCostBasis)} − ${cashCurrency === 'EUR' ? '€' : '$'}${fmt(startingCash)} cash = $${fmt(s.adjustedCostBasis)}`
                    : `Cost basis: $${fmt(s.totalCostBasis)}`
                }
                valueColor={s && s.portNow >= s.adjustedCostBasis ? 'var(--positive)' : s ? 'var(--negative)' : undefined}
              />
              <StatCard
                label="SPY Mirror"
                value={s ? `$${fmt(s.spyMirrorNow)}` : '…'}
                sub={
                  s == null ? null :
                  s.hasRealizedData && s.realizedGainsUSD > 0
                    ? `Based on $${fmt(s.adjustedCostBasis, 0)} net capital + $${fmt(s.realizedGainsUSD, 0)} reinvested gains · SPY ${fmtD(s.spyReturn, 1)}`
                    : s.hasRealizedData
                    ? `Based on $${fmt(s.netCapital, 0)} net capital deployed · SPY ${fmtD(s.spyReturn, 1)}`
                    : s.spyReturn != null ? `SPY return: ${fmtD(s.spyReturn, 1)}` : null
                }
              />
              <StatCard
                label="vs SPY"
                value={s?.vsSpyPct == null ? '—' : (s.vsSpyPct >= 0 ? '+' : '') + s.vsSpyPct.toFixed(1) + '%'}
                sub={s?.portReturn != null && s?.spyReturn != null ? `Portfolio ${fmtD(s.portReturn, 1)} · SPY ${fmtD(s.spyReturn, 1)}` : null}
                valueColor={s ? clr(s.vsSpyPct) : undefined}
              />
              {s?.twr != null && (
                <InfoTooltip text={
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>
                      Time-Weighted Return (Modified Dietz)
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      Your investment performance, adjusted for when you added money. Unlike the chart's return on cost basis, TWR isolates how well your investment decisions performed — not how big your portfolio grew from deposits.
                    </div>
                    <div style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: 12 }}>
                      Example: depositing €10K right before a rally inflates simple returns. TWR corrects for this.
                    </div>
                  </>
                }>
                  <StatCard
                    label="Time-Weighted Return*"
                    value={(s.twr >= 0 ? '+' : '') + s.twr.toFixed(1) + '%'}
                    sub="Modified Dietz — adjusted for deposit timing"
                    valueColor={clr(s.twr)}
                  />
                </InfoTooltip>
              )}
            </div>

            {/* ── Portfolio vs SPY AreaChart ───────────────────────────────── */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: 10, padding: '20px 24px',
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
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval={xInterval} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={v => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`} width={52} domain={['auto', 'auto']} />
                    <Tooltip content={<PortTooltip />} />
                    <Area type="monotone" dataKey="portfolio" name="Portfolio"   stroke="#58a6ff" strokeWidth={2} fill="url(#perfPortGrad)" dot={false} activeDot={{ r: 4 }} />
                    <Area type="monotone" dataKey="spy"       name="SPY Mirror" stroke="#4ade80" strokeWidth={2} fill="url(#perfSpyGrad)"  dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
              <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 12 }}>
                <span style={{ color: '#58a6ff', fontWeight: 600 }}>
                  — Portfolio {s?.portReturn != null ? `(${s.portReturn >= 0 ? '+' : ''}${s.portReturn.toFixed(1)}%)` : ''}
                </span>
                <span style={{ color: '#4ade80', fontWeight: 600 }}>
                  — SPY Mirror {s?.spyReturn != null ? `(${s.spyReturn >= 0 ? '+' : ''}${s.spyReturn.toFixed(1)}%)` : ''}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                Chart shows % return since the start date. Both lines are normalized to 0% at the start date.
              </div>
            </div>

            {/* ── Metric cards: Beta, EUR/USD Rate, Currency Impact, Outperformance ── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
                label={s?.vsSpyPct != null && s.vsSpyPct >= 0 ? 'Outperforming' : 'Underperforming'}
                value={s?.vsSpyPct == null ? '—' : (s.vsSpyPct >= 0 ? '+' : '') + s.vsSpyPct.toFixed(1) + '%'}
                sub="vs SPY since start"
                valueColor={s ? clr(s.vsSpyPct) : undefined}
              />
              {realizedData && (() => {
                const { positions = [], partialPositions = [], totalPnl } = realizedData;
                const allRealized = [...positions, ...partialPositions];
                const best  = allRealized.length ? allRealized.reduce((a, b) => b.pnl > a.pnl ? b : a) : null;
                const worst = allRealized.length ? allRealized.reduce((a, b) => b.pnl < a.pnl ? b : a) : null;
                return (
                  <MetricCard
                    label="Realized P&L"
                    value={totalPnl == null ? '—' : (totalPnl >= 0 ? '+€' : '-€') + fmt(Math.abs(totalPnl))}
                    sub={
                      allRealized.length
                        ? `${allRealized.length} realized · best: ${best?.symbol ?? '—'} worst: ${worst?.symbol ?? '—'}`
                        : 'No realized positions'
                    }
                    valueColor={clr(totalPnl)}
                  />
                );
              })()}
            </div>

            {/* ── EUR/USD AreaChart ─────────────────────────────────────────── */}
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: 10, padding: '20px 24px',
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
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval={eurXInt} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(3)} width={52} domain={['auto', 'auto']} />
                    <Tooltip content={<EurTooltip />} />
                    <Area type="monotone" dataKey="rate" name="EUR/USD" stroke="#f59e0b" strokeWidth={2} fill="url(#eurGrad)" dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {realizedData && (realizedData.totalDeposited > 0 || realizedData.totalDividends > 0 || realizedData.totalFees > 0) && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {realizedData.totalDeposited > 0 && (
                  <MetricCard
                    label="Total Deposited"
                    value={`€${fmt(realizedData.totalDeposited)}`}
                    sub={`${realizedData.deposits?.length ?? 0} deposit${(realizedData.deposits?.length ?? 0) !== 1 ? 's' : ''}`}
                  />
                )}
                {realizedData.totalDividends > 0 && (
                  <MetricCard
                    label="Dividends Received"
                    value={`+€${fmt(realizedData.totalDividends)}`}
                    sub={`${realizedData.dividends?.length ?? 0} payment${(realizedData.dividends?.length ?? 0) !== 1 ? 's' : ''}`}
                    valueColor="var(--positive)"
                  />
                )}
                <MetricCard
                  label="Fees Paid"
                  value={realizedData.totalFees > 0 ? `-€${fmt(realizedData.totalFees)}` : '€0.00'}
                  sub={`${realizedData.fees?.length ?? 0} fee entr${(realizedData.fees?.length ?? 0) !== 1 ? 'ies' : 'y'}`}
                  valueColor={realizedData.totalFees > 0 ? 'var(--negative)' : undefined}
                />
              </div>
            )}

            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              borderRadius: 10, padding: '20px 24px',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                Upload Transactions
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Upload your broker transaction export to calculate realized P&amp;L on closed positions using FIFO.
              </div>
              <UnifiedUpload
                startDate={startDate ?? dateInput}
                onTransactions={(data) => {
                  setRealizedData(data ?? null);
                  if (data) {
                    fetch('/api/realized-data', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ transactions: data }),
                    }).catch(() => {});
                  }
                }}
              />
            </div>

            {/* ── Disclaimer ───────────────────────────────────────────────── */}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
              {startDate
                ? 'Start date is user-configured. '
                : 'Purchase dates are estimated by matching your average cost basis to historical weekly closing prices. '}
              SPY mirror assumes your total cost basis was invested in SPY at the start date.
              Currency impact reflects the USD/EUR exchange-rate effect on your portfolio value since the start date.
              Past performance is not indicative of future results. Data provided for informational purposes only.
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                *Time-weighted return uses Modified Dietz approximation — weights each deposit by its position in the period to remove the effect of capital additions on the reported performance %.
              </div>
            </div>

          </div>
        )}
      </SignupGate>

    </div>
  );
}
