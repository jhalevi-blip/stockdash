'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import Card from '@/app/(v2)/_components/Card';
import HeroValue from './_components/HeroValue';
import MetricChip from './_components/MetricChip';
import MacroStrip from './_components/MacroStrip';
import HoldingsTable from './_components/HoldingsTable';
import AllocationDonut from './_components/AllocationDonut';
import MoversList from './_components/MoversList';
import PortfolioAISummary from '@/components/PortfolioAISummary';
import EarningsList from './_components/EarningsList';
import NewsFeed from './_components/NewsFeed';
import InsiderActivity from './_components/InsiderActivity';
import QuickJumpTiles from './_components/QuickJumpTiles';
import { PORTFOLIO, HOLDINGS, AI_SUMMARY, PORTFOLIO_SPARK, ALLOCATION } from './_lib/mockData';
import { fmtCurrency, fmtSigned, fmtPct, colorForChange } from '@/app/(v2)/_lib/format';
import { useHoldings } from '@/lib/useHoldings';
import { holdingsSignature } from '@/lib/holdingsStorage';
import { getMarketStatus } from '@/lib/marketStatus';
import { fetchMacro } from '@/lib/macroClient';
import { buildFxRates, toDisplay as toDisplayCcy, valuePosition, isPence, normCcy } from '../_lib/positionValue';

const SECTOR_COLORS = {
  'Technology':             '#58a6ff',
  'Semiconductors':         '#3b82f6',
  'Financial Services':     '#22d3ee',
  'Healthcare':             '#3fb950',
  'Energy':                 '#d97706',
  'Consumer Cyclical':      '#f0b429',
  'Consumer Defensive':     '#a3e635',
  'Industrials':            '#c084fc',
  'Real Estate':            '#fb923c',
  'Utilities':              '#94a3b8',
  'Communication Services': '#e879f9',
  'Basic Materials':        '#fbbf24',
  'Other':                  '#6e7681',
};
const FALLBACK_PALETTE = ['#58a6ff', '#22d3ee', '#3fb950', '#d97706', '#f0b429', '#c084fc', '#fb923c'];

// PortfolioAISummary is reused as-is from the live dashboard. It
// renders its own card chrome (bg-card, border, border-radius 8) so we
// drop it directly into the page flow — no v2 Card wrapper. Passing
// initialSummary locks the component into display-only mode: no API
// calls, no buttons, no localStorage reads. See Phase D investigation.
export default function DashboardV2Page() {
  const router = useRouter();
  const [range,   setRange]  = useState('1M');
  const [sectors, setSectors] = useState({});
  // S&P 500 today % for the "Today vs S&P" KPI card; null until loaded / on error.
  const [spyPct,  setSpyPct]  = useState(null);

  // Real holdings + cash — Supabase-authoritative, listens to portfolio-saved event
  const { holdings, cash: cashData, error, refresh } = useHoldings();
  const [prices,   setPrices]   = useState({});
  // Oldest FMP source timestamp (ms) across the returned quotes — drives the
  // "Updated …" label AND the stale banner. This is the data's own age, NOT the
  // response time (a fresh response time on a stale payload is what hid the bug).
  // null until the first successful load.
  const [pricesAsOf, setPricesAsOf] = useState(null);
  // Ticking clock (ms) for age/staleness — a state value keeps render pure and
  // lets the stale banner appear/refresh between price polls.
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Raw daily closes per ticker (in each quote's own currency) + the sorted date
  // union. The hero series is derived from this in a currency-aware memo below, so
  // the chart uses the SAME per-position currency rule as the headline.
  const [histRaw, setHistRaw] = useState(null); // { tickerDateClose: {t:{date:close}}, dates: [] }
  // Load state for `history`, so a signed-in user with holdings never sees the mock
  // demo curve: 'loading' while the fetch is in flight, 'error' on failure / no data,
  // 'ready' once the real series is in. Anonymous / zero-holdings ignore this (mock).
  const [historyStatus, setHistoryStatus] = useState('loading');
  // Live EUR/USD (USD per EUR, ≈1.16). null until loaded → aggregates show a brief
  // loading state rather than flashing USD figures as if they were EUR. USD→EUR = ÷ eurUsd.
  const [eurUsd,   setEurUsd]   = useState(null);
  // Live GBP/USD (USD per GBP) — needed to convert GBP/GBX (LSE, pence) positions
  // into the display currency. null until loaded; a GBP position stays "no price"
  // until it resolves rather than being valued at a wrong rate.
  const [gbpUsd,   setGbpUsd]   = useState(null);
  // Realized P&L (EUR) from /api/realized-data. null = not yet resolved; resolves to
  // a number on both success and error (so the hero gate never stalls on it).
  const [realizedEur, setRealizedEur] = useState(null);
  // Raw amount from Supabase (no currency conversion — pre-existing display behaviour preserved)
  const cash         = cashData?.amount   ?? 0;
  const cashCurrency = cashData?.currency ?? 'USD';
  const { user, isLoaded, isSignedIn } = useUser();

  // Prices: initial fetch on holdings change, then poll every 60s while the tab
  // is visible. Reuses the exact same endpoint + response handling as before.
  //  - Initial load keeps its original error behavior: blank prices on failure.
  //  - Polls are silent on failure: keep the last good prices + timestamp.
  //  - No polling while the tab is hidden; on return to foreground we refetch
  //    once immediately, then resume the interval.
  // Re-running (holdings change / unmount) tears down interval + listener first.
  useEffect(() => {
    if (!holdings?.length) return;
    const tickers = holdings.map(x => x.t).join(',');
    const url = `/api/prices?tickers=${tickers}`;

    // Shared success path — identical to the original effect's state update,
    // plus the timestamp used by the "Updated …" label.
    const commit = priceArr => {
      const priceMap = {};
      let oldestAsOf = null;
      if (Array.isArray(priceArr)) priceArr.forEach(p => {
        priceMap[p.ticker] = p;
        // Oldest source timestamp governs "Updated"/staleness so a single lagging
        // symbol surfaces instead of being hidden behind fresher ones.
        if (p.asOf != null) oldestAsOf = oldestAsOf == null ? p.asOf : Math.min(oldestAsOf, p.asOf);
      });
      setPrices(priceMap);
      setPricesAsOf(oldestAsOf);
    };

    // Initial load — unchanged: on failure blank prices (no timestamp update).
    fetch(url).then(r => r.json()).then(commit).catch(() => setPrices({}));

    // Poll tick — swallow failures so a bad poll never blanks prices/timestamp.
    const poll = () => { fetch(url).then(r => r.json()).then(commit).catch(() => {}); };

    let interval = null;
    const start = () => { if (interval == null) interval = setInterval(poll, 60000); };
    const stop  = () => { if (interval != null) { clearInterval(interval); interval = null; } };

    const onVisibility = () => {
      if (document.hidden) {
        stop();               // never poll in the background
      } else {
        poll();               // immediate refresh on return to foreground
        start();              // then resume the 60s cadence
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [holdings]);

  // Tick the staleness clock every 30s so the "N min old" age and the stale
  // banner advance even when a poll returns an unchanged oldest asOf.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Live EUR/USD rate (last close of EURUSD=X) — used to display portfolio
  // aggregates in EUR. Fetched once on mount; same /api/chart source the
  // performance page uses.
  useEffect(() => {
    fetch('/api/chart?symbol=EURUSD%3DX')
      .then(r => r.json())
      .catch(() => ({}))
      .then(json => {
        const candles = json?.candles ?? [];
        const last = candles[candles.length - 1]?.close;
        if (last != null && last > 0) setEurUsd(last);
      });
  }, []);

  // Live GBP/USD (same source) — for GBP/GBX (pence, ÷100) positions.
  useEffect(() => {
    fetch('/api/chart?symbol=GBPUSD%3DX')
      .then(r => r.json())
      .catch(() => ({}))
      .then(json => {
        const last = (json?.candles ?? []).at(-1)?.close;
        if (last != null && last > 0) setGbpUsd(last);
      });
  }, []);

  // S&P 500 today % for the "Today vs S&P" card. Shares the single /api/macro request
  // with MacroStrip via fetchMacro() (both mount together) instead of firing its own.
  // No polling; leave null on any error.
  useEffect(() => {
    fetchMacro()
      .then(json => setSpyPct(json?.indices?.SPY?.changesPercentage ?? null))
      .catch(() => {});
  }, []);

  // Realized P&L (EUR) — mirrors the performance page's /api/realized-data fetch.
  // totalPnl is already EUR (do NOT multiply by FX). Resolves to a number on both
  // success and error so the hero gate never stalls. Anonymous users skip (→ stays 0).
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user?.id) { setRealizedEur(0); return; }
    let cancelled = false;
    fetch('/api/realized-data')
      .then(r => r.json())
      .then(json => { if (!cancelled) setRealizedEur(json?.transactions?.totalPnl ?? 0); })
      .catch(() => { if (!cancelled) setRealizedEur(0); });
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, user?.id]);

  // Fetch 1-year daily prices for all held tickers and compute portfolio value per day.
  // Runs after holdings are known. Skips if holdings is empty/null (mock/demo case).
  const prevHistSigRef = useRef(null);
  // Mirrors whether a real chart is currently on screen. `holdings` gets a fresh
  // reference on every refresh (portfolio-saved / refresh() re-seed from a JSON-parsed
  // cache), so this effect re-runs even when tickers/shares are unchanged — we use this
  // to keep the existing chart up across a refresh instead of flashing loading/error.
  const historyReadyRef = useRef(false);
  useEffect(() => {
    if (!holdings?.length) return;
    let cancelled = false;

    // D2: when the held tickers/shares change (e.g. optimistic cache → network
    // reconcile), clear the previous portfolio's chart line first so it isn't
    // shown against the new holdings while the new series is fetched.
    const sig = holdingsSignature(holdings);
    if (prevHistSigRef.current !== null && prevHistSigRef.current !== sig) {
      setHistRaw(null);
      historyReadyRef.current = false;
    }
    prevHistSigRef.current = sig;

    // Show the loading state only when there's no valid chart to keep (first load, or
    // holdings just changed and we cleared it). A same-holdings refresh leaves the
    // current chart in place until the new series arrives.
    if (!historyReadyRef.current) setHistoryStatus('loading');

    const tickers = [...new Set(holdings.map(h => h.t))];

    (async () => {
      try {
        const res  = await fetch(`/api/historical-prices?tickers=${tickers.join(',')}`);
        const json = await res.json();
        if (cancelled) return; // a newer holdings change superseded this fetch
        // Failure / no data: surface 'error' only when nothing is already on screen;
        // otherwise keep the existing chart rather than blanking a good one.
        if (!Array.isArray(json.data) || !json.data.length) {
          if (!historyReadyRef.current) { setHistRaw(null); setHistoryStatus('error'); }
          return;
        }

        // Store raw per-ticker daily closes (each in its own quote currency) + the
        // date union. Valuation (currency conversion, priced-only) happens in the
        // `history` memo, so the chart obeys the same rule as the headline.
        const tickerDateClose = {};
        const dateSet = new Set();
        for (const { ticker, prices: p } of json.data) {
          tickerDateClose[ticker] = {};
          for (const { date, close } of p) { tickerDateClose[ticker][date] = close; dateSet.add(date); }
        }
        const dates = [...dateSet].sort();

        if (cancelled) return;
        setHistRaw({ tickerDateClose, dates });
        setHistoryStatus('ready');
        historyReadyRef.current = true;
      } catch {
        if (cancelled) return;
        // Keep an existing chart on a failed refresh; only error when there's none.
        if (!historyReadyRef.current) { setHistRaw(null); setHistoryStatus('error'); }
      }
    })();

    return () => { cancelled = true; };
  }, [holdings]);

  // Fetch sector classification for each held ticker from /api/sectors.
  // Runs after holdings are known; 24h CDN cache on the route.
  useEffect(() => {
    if (!holdings?.length) return;
    const tickers = [...new Set(holdings.map(h => h.t))].join(',');
    fetch(`/api/sectors?tickers=${tickers}`)
      .then(r => r.json())
      .then(map => { if (map && !map.error) setSectors(map); })
      .catch(() => {});
  }, [holdings]);


  // ── Per-position currency + FX ─────────────────────────────────────────────
  // Display currency: EUR once EUR/USD loads, else USD (the hero render is gated on
  // eurUsd, so EUR magnitudes are never flashed stale). FX rates are USD-per-unit.
  const displayCcy = eurUsd ? 'EUR' : 'USD';
  const fxRates = buildFxRates(eurUsd, gbpUsd);
  // Local wrapper over the shared converter (binds the current rates + display ccy).
  const toDisplay = (amount, fromCcy) => toDisplayCcy(amount, fromCcy, fxRates, displayCcy);

  // Compute enriched rows in the shape HoldingsTable expects, each valued in its OWN
  // currency via the shared valuePosition helper (same rule /performance uses): a
  // position is priced only when the quote's currency MATCHES the holding's currency
  // (no ADR substitution); otherwise it is "no price" and excluded from every total.
  const enrichedRows = (() => {
    if (!holdings?.length) return [];
    const rows = holdings.map(h => {
      const q = prices[h.t] ?? {};
      const v = valuePosition(h, q, fxRates, displayCcy);
      const base = { ticker: h.t, name: h.name ?? '', shares: h.s, costBasis: v.costNative,
                     currency: v.nativeCcy, quoteCurrency: q.currency ?? null, isin: h.isin ?? null,
                     unresolved: !!h.unresolved, sector: '' };
      if (!v.priced) {
        return { ...base, price: null, change: null, mktValue: null, plDollar: null,
                 plPct: null, valueDisplay: null, plDisplay: null, priced: false, weight: null };
      }
      return { ...base, price: v.price, change: q.chgPct ?? 0, mktValue: v.mktNative,
               plDollar: v.plNative, plPct: v.plPct,
               valueDisplay: v.valueDisplay, plDisplay: v.plDisplay, priced: true, weight: 0 };
    });
    // Weights over converted (display-currency) values, so mixed-currency positions
    // are comparable.
    const totalDisp = rows.reduce((s, r) => s + (r.valueDisplay ?? 0), 0);
    return rows.map(r => ({
      ...r,
      weight: r.priced && totalDisp > 0 ? (r.valueDisplay / totalDisp) * 100 : (r.priced ? 0 : null),
    }));
  })();

  // Priced subset + unpriced count. Every total below is computed over pricedRows
  // only; unpricedCount is surfaced so a partial total never looks complete.
  const pricedRows   = enrichedRows.filter(r => r.priced);
  const unpricedCount = enrichedRows.length - pricedRows.length;

  // Live headline positions value (display currency) and display-currency cash —
  // shared by the totals and the hero chart so the two always agree.
  const livePositionsValue = pricedRows.reduce((s, r) => s + (r.valueDisplay ?? 0), 0);
  const cashDisplay = toDisplay(cash, cashCurrency) ?? 0;

  // ── Hero chart series (currency-aware, priced-only) ────────────────────────
  // Value each position's daily history in its OWN currency and convert, using the
  // SAME price/currency-match rule as the headline: a position that is "no price"
  // in the headline is excluded from the chart too, so the chart's last point
  // equals the headline positions value. Final point is pinned to the live value.
  const history = useMemo(() => {
    if (!histRaw?.dates?.length || !holdings?.length) return null;
    const meta = new Map();
    for (const h of holdings) {
      const q = prices[h.t] ?? {};
      const rawCcy = h.currency || 'USD';
      const nativeCcy = normCcy(rawCcy);
      const quoteCcy = q.currency ? normCcy(q.currency) : null;
      const priceable = q.price != null && quoteCcy != null && quoteCcy === nativeCcy
        && fxRates[nativeCcy] != null && fxRates[displayCcy] != null;
      if (priceable) meta.set(h.t, { ccy: nativeCcy, shares: h.s, pence: isPence(q.currency) });
    }
    if (meta.size === 0) return null;
    const lastClose = {};
    const series = histRaw.dates.map(date => {
      let value = 0;
      for (const [t, m] of meta) {
        const raw = histRaw.tickerDateClose[t]?.[date];
        if (raw != null) lastClose[t] = raw;
        const c = lastClose[t];
        if (c == null) continue;
        const priceNative = m.pence ? c / 100 : c; // historical close is in the quote ccy
        value += toDisplay(m.shares * priceNative, m.ccy) ?? 0;
      }
      return { date, value };
    });
    // Pin the final point to the live headline positions value so chart == headline.
    if (series.length) series[series.length - 1] = { ...series[series.length - 1], value: livePositionsValue };
    return series;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histRaw, holdings, prices, eurUsd, gbpUsd, displayCcy, livePositionsValue]);

  // Slice the full history array by the selected range → { date, value }[]. Falls back
  // to mock PORTFOLIO_SPARK (synthetic trailing dates) when history hasn't loaded yet.
  const sparkData = useMemo(() => {
    if (!history || !history.length) {
      const now = Date.now();
      return PORTFOLIO_SPARK.map((value, i) => ({
        date: new Date(now - (PORTFOLIO_SPARK.length - 1 - i) * 86400000).toISOString().slice(0, 10),
        value,
      }));
    }
    const sliceCount = { '1W': 7, '1M': 22, '3M': 66, '1Y': Infinity, 'ALL': Infinity };
    const n = sliceCount[range] ?? 22; // '1D' guard: treat unknown range as 1M
    return n === Infinity ? history : history.slice(-n);
  }, [history, range]);

  // Positions + cash view: history is already in the display currency, so just fold
  // in today's (display-currency) cash flat, matching the headline Total.
  const sparkDataEur = useMemo(
    () => (history == null ? sparkData : sparkData.map(p => ({ ...p, value: p.value + cashDisplay }))),
    [sparkData, cashDisplay, history],
  );

  // "Updated"/staleness are driven by the data's own source timestamp (oldest
  // asOf across holdings), never response time. "Stale" only flags while the US
  // market is open — a gap outside regular hours is expected, not a fault.
  const usMarketOpen = getMarketStatus(new Date(nowMs)).isOpen;
  const pricesStale  = usMarketOpen && pricesAsOf != null && (nowMs - pricesAsOf) > 15 * 60 * 1000;
  const pricesAgeMin = pricesAsOf != null ? Math.floor((nowMs - pricesAsOf) / 60000) : null;

  // Derive top movers from PRICED rows only, sorted by day change %. Unpriced
  // positions have unknown change and must not appear as movers. null when no
  // priced holdings — MoversList falls back to mock.
  const realMovers = pricedRows.length > 0
    ? {
        up:   [...pricedRows].sort((a, b) => b.change - a.change).slice(0, 4).map(r => ({ ticker: r.ticker, change: r.change, last: r.price })),
        down: [...pricedRows].sort((a, b) => a.change - b.change).slice(0, 4).map(r => ({ ticker: r.ticker, change: r.change, last: r.price })),
      }
    : null;

  // Comma-separated ticker string for feed components (news, earnings, insider).
  // null when no real holdings are loaded — feeds will skip their fetch and show loading state.
  const tickerList = enrichedRows.length > 0
    ? [...new Set(enrichedRows.map(r => r.ticker))].join(',')
    : HOLDINGS.map(h => h.ticker).join(',');

  // Compute sector allocation from enrichedRows + fetched sectors map.
  // Returns null when sectors haven't loaded yet — AllocationDonut falls back to ALLOCATION mock.
  const realAllocation = (() => {
    if (pricedRows.length === 0 || Object.keys(sectors).length === 0) return null;
    // Denominator is the PRICED total so the donut slices sum to 100% of what we
    // can actually value — unpriced positions are excluded, not counted as zero.
    const totalMktValue = pricedRows.reduce((s, r) => s + (r.valueDisplay ?? 0), 0);
    if (totalMktValue <= 0) return null;
    const bySector = {};
    for (const r of pricedRows) {
      const sector = sectors[r.ticker]?.sector ?? 'Other';
      bySector[sector] = (bySector[sector] ?? 0) + (r.valueDisplay ?? 0);
    }
    const entries = Object.entries(bySector)
      .map(([sector, val]) => ({ sector, pct: (val / totalMktValue) * 100 }))
      .sort((a, b) => b.pct - a.pct);
    return entries.map((e, i) => ({
      ...e,
      color: SECTOR_COLORS[e.sector] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length],
    }));
  })();

  // Compute real portfolio stats from enrichedRows + live prices.
  // Returns null when no real holdings are loaded (anonymous / demo).
  const realPortfolioStats = (() => {
    if (enrichedRows.length === 0) return null;
    // Every aggregate is over PRICED rows only, and each position is converted from
    // its OWN currency into the display currency BEFORE summing — never summed raw
    // across currencies. Cost is excluded alongside value for the same positions, so
    // Total P&L stays coherent (excluding a position's value but keeping its cost
    // would fabricate a loss).
    // positionsValue + cashDisplay are the SAME values that pin the hero chart's last
    // point, so the chart and the headline can never disagree.
    const positionsValue = livePositionsValue;
    const totalCostEur   = pricedRows.reduce((s, r) => s + (toDisplay(r.shares * r.costBasis, r.currency) ?? 0), 0);
    const dayChange      = pricedRows.reduce((s, r) => s + (r.valueDisplay ?? 0) * (r.change / 100), 0);
    const unrealizedPct  = totalCostEur > 0 ? ((positionsValue - totalCostEur) / totalCostEur) * 100 : 0;
    const prevValue      = positionsValue - dayChange;
    const dayChangePct   = prevValue > 0 ? (dayChange / prevValue) * 100 : 0;

    // Realized P&L is already in EUR; only fold it in when the display currency is EUR.
    const realizedDisplay = displayCcy === 'EUR' ? (realizedEur ?? 0) : 0;
    return {
      totalValue:     positionsValue + cashDisplay,
      totalCost:      totalCostEur,
      unrealized:     positionsValue - totalCostEur,
      unrealizedPct,
      // Total P&L = unrealized (display ccy) + realized (EUR, folded in only for EUR).
      totalPnl:       (positionsValue - totalCostEur) + realizedDisplay,
      dayChange,
      dayChangePct,
      cash, cashCurrency,
      positions: enrichedRows.length,       // total holdings
      pricedPositions: pricedRows.length,   // how many are actually valued
      unpricedPositions: unpricedCount,     // excluded from the totals above
      displayCurrency: displayCcy,
      asOf: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
    };
  })();

  // hero: real stats when signed in with holdings, mock otherwise
  const hero = realPortfolioStats ?? PORTFOLIO;

  // Hold the hero (which shows EUR aggregates) until the FX rate AND realized P&L have
  // loaded, so we never flash USD magnitudes or an €81k→€118k jump. Only applies to real
  // holdings; the mock/sample hero (PORTFOLIO, USD) renders immediately. realizedEur
  // resolves to a number on success and error, so this never stalls.
  const heroFxPending = isSignedIn && Array.isArray(holdings) && holdings.length > 0 && (eurUsd == null || realizedEur === null);

  // Hero chart region. A signed-in user with holdings tracks the real history load
  // ('loading' → 'error' → 'ready') so they never see the mock demo curve; anonymous
  // and zero-holdings viewers stay on 'ready' and keep the demo curve as before.
  const signedInWithHoldings = isSignedIn && Array.isArray(holdings) && holdings.length > 0;
  const chartState = signedInWithHoldings ? historyStatus : 'ready';

  // Map enrichedRows to the shape PortfolioAISummary expects (matches /dashboard row keys).
  const aiRows = enrichedRows.map(r => ({
    t:       r.ticker,
    s:       r.shares,
    costVal: r.shares * r.costBasis,
    price:   r.price,
    pnlPct:  r.plPct,
    mktVal:  r.mktValue,
  }));

  // portfolioStats shape for PortfolioAISummary (anonymous/mock fallback)
  const portfolioStats = {
    totalValue: PORTFOLIO.totalValue,
    totalPnl: PORTFOLIO.unrealized,
    totalPnlPct: PORTFOLIO.unrealizedPct,
    cash: PORTFOLIO.cash,
  };

  // ── Signed-in early-return guards (all hooks called above this line) ────────
  const centeredBox = {
    minHeight: '60vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 12,
    color: 'var(--text-secondary)', fontSize: 14, padding: 40,
  };
  const retryBtn = {
    background: '#2563eb', border: 'none', borderRadius: 6,
    color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    padding: '9px 20px',
  };

  if (!isLoaded) {
    return <div style={centeredBox}>Loading…</div>;
  }

  if (isSignedIn && error) {
    return (
      <div style={centeredBox}>
        <div>We couldn't load your portfolio.</div>
        <button onClick={refresh} style={retryBtn}>Retry</button>
      </div>
    );
  }

  if (isSignedIn && holdings === null) {
    return <div style={centeredBox}>Loading your portfolio…</div>;
  }

  // Signed-in user with zero holdings — let them see the sample/mock dashboard
  // (realPortfolioStats is null → hero = PORTFOLIO, tables fall back to HOLDINGS etc.)
  // with a prominent banner explaining it's sample data.
  const isSampleView = isLoaded && isSignedIn && !error && Array.isArray(holdings) && holdings.length === 0;

  return (
    <div style={{
      padding: '18px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
    }}>
      {/* Sample-data banner — signed-in users with no holdings only */}
      {isSampleView && (
        <div style={{
          background: 'rgba(34,211,238,0.06)',
          border: '1px solid rgba(34,211,238,0.25)',
          borderRadius: 8,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Sample portfolio</strong>
            {' — this isn\u2019t your data yet. Add your portfolio to track your real holdings.'}
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-portfolio-editor'))}
            style={{
              background: '#2563eb', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              padding: '9px 20px', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >Add your portfolio</button>
        </div>
      )}

      {/* 1. Hero strip */}
      <Card padding="18px 20px">
        {heroFxPending ? (
          <div style={{
            minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: 13,
          }}>Loading…</div>
        ) : (
          <HeroValue
            range={range}
            onRange={setRange}
            sparkData={hero.displayCurrency === 'EUR' ? sparkDataEur : sparkData}
            data={hero}
            chartState={chartState}
          />
        )}
      </Card>

      {/* 2. KPI chips */}
      <div className="dv2-kpi-grid">
        <MetricChip label="Today's P&L"  value={fmtCurrency(hero.dayChange, 0, hero.displayCurrency)}  change={hero.dayChangePct} />
        <MetricChip label="Total P&L"    value={fmtSigned(hero.totalPnl ?? hero.unrealized, 0, hero.displayCurrency)} valueColor={(hero.totalPnl ?? hero.unrealized) >= 0 ? 'var(--positive)' : 'var(--negative)'} />
        {spyPct == null ? (
          <MetricChip label="Today vs S&P" value="—" valueColor="var(--text-muted)" />
        ) : (
          <MetricChip
            label="Today vs S&P"
            value={`${fmtSigned(hero.dayChangePct - spyPct)} pp`}
            valueColor={colorForChange(hero.dayChangePct - spyPct)}
            sub={`You ${fmtPct(hero.dayChangePct)} · S&P ${fmtPct(spyPct)}`}
          />
        )}
        <MetricChip label="Cash"         value={fmtCurrency(hero.cash, 0, hero.cashCurrency)} />
      </div>

      {/* 3. Macro strip */}
      <MacroStrip />

      {/* 4. Holdings + side rail */}
      <div className="dv2-holdings-grid">
        <Card
          title="Holdings"
          eyebrow="Live"
          footer={pricesAsOf ? `Updated ${new Date(pricesAsOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}` : undefined}
        >
          {pricesStale && (
            <div role="status" style={{
              padding: '8px 12px', marginBottom: 10, borderRadius: 6,
              border: '1px solid var(--warn)', color: 'var(--warn)',
              background: 'var(--bg-secondary)', fontSize: 12, fontWeight: 600,
            }}>
              ⚠ Prices may be stale — oldest quote is {pricesAgeMin} min old while the US market is open.
            </div>
          )}
          {/* Use real enriched rows when available; fall back to mock for demo/anonymous visitors */}
          <HoldingsTable rows={enrichedRows.length > 0 ? enrichedRows : HOLDINGS} onRowClick={(r) => router.push(`/research?ticker=${r.ticker}`)} />
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Card title="Allocation by sector" eyebrow="Composition">
            <AllocationDonut size={120} strokeWidth={20} data={realAllocation ?? ALLOCATION} />
          </Card>
          <Card title="Top movers today" eyebrow="Intraday">
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: 'var(--positive)',
              marginBottom: 4,
            }}>↑ Gainers</div>
            <MoversList kind="up"   movers={realMovers?.up} />
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
              textTransform: 'uppercase', color: 'var(--negative)',
              marginTop: 8, marginBottom: 4,
            }}>↓ Decliners</div>
            <MoversList kind="down" movers={realMovers?.down} />
          </Card>
        </div>
      </div>

      {/* 5. AI Summary — defer until Clerk resolves to prevent mock initialSummary being
            captured into useState before isSignedIn is known (race condition on refresh) */}
      {!isLoaded ? (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          minHeight: 200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 12,
        }}>
          Loading…
        </div>
      ) : (
        <PortfolioAISummary
          key={isSignedIn ? (user?.id || 'signed-in') : 'anon'}
          holdings={isSignedIn ? aiRows : HOLDINGS}
          portfolioStats={isSignedIn ? {
            totalValue:  hero.totalValue,
            totalPnl:    hero.unrealized,
            totalPnlPct: hero.unrealizedPct,
            cash:        hero.cash,
          } : portfolioStats}
          initialSummary={isSignedIn ? undefined : AI_SUMMARY}
          isSignedIn={!!isSignedIn}
        />
      )}

      {/* 6. Earnings · News · Insider — 3-column feed row */}
      <div className="dv2-feed-grid">
        <Card title="Upcoming Earnings" eyebrow="Calendar">
          <EarningsList tickers={tickerList} />
        </Card>
        <Card title="Portfolio News" eyebrow="Headlines">
          <NewsFeed tickers={tickerList} />
        </Card>
        <Card title="Insider Activity" eyebrow="Form 4">
          <InsiderActivity tickers={tickerList} />
        </Card>
      </div>

      {/* 7. Quick-jump tiles */}
      <div>
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--text-muted)',
          marginBottom: 8,
        }}>Explore</div>
        <QuickJumpTiles />
      </div>

      <div style={{
        marginTop: 8,
        padding: '14px 0 24px',
        color: 'var(--text-faint, rgba(230,237,243,0.45))',
        fontSize: 11,
        textAlign: 'center',
        borderTop: '1px solid var(--border-section, var(--border-color))',
      }}>
        StockDashes is for informational purposes only and does not constitute financial advice ·
        No account needed · Loads in seconds · EU-hosted, never sold
      </div>
    </div>
  );
}
