'use client';
// Client hook: fetches daily closes and drives the single-model /performance
// views from lib/performance/ledger.js. This is the page-facing glue; all math
// lives in ledger.js (unit-tested + validated by scripts/perf-compare.mjs).
//
// Data contract (verified Aug 2026 — see CLAUDE.md): shares from tradeLegs
// (exact), external flows from the deposits array, terminal cash from
// currentCash. cashEvents is NOT used (does not reconcile for multi-currency
// DeGiro). SPY uses dividend-adjusted (total-return) closes; portfolio tickers
// use raw closes with dividends credited from the dated dividends array.
import { useState, useEffect, useMemo } from 'react';
import {
  carryForwardLookup, sharesAt, buildDailyLedger, twrSeries, spyTwrSeries,
  windowIntegrity, unpricedHeldTickers, negativeShareTickers, xirr,
} from './ledger';

async function fetchDaily(tickers, adjusted) {
  // Route caps at 20 tickers/call; batch.
  const out = {};
  for (let i = 0; i < tickers.length; i += 20) {
    const batch = tickers.slice(i, i + 20);
    if (!batch.length) continue;
    try {
      const q = `tickers=${batch.join(',')}&years=5${adjusted ? '&adjusted=true' : ''}`;
      const res = await fetch(`/api/historical-prices?${q}`);
      const json = await res.json();
      for (const d of json?.data ?? []) out[d.ticker] = d.prices ?? [];
    } catch { /* leave missing → integrity gate flags */ }
  }
  return out;
}

export function usePerformanceLedger({ realizedData, currentCashEur, defaultStart }) {
  const [range, setRange] = useState('default');           // 'default' | 'inception'
  const [daily, setDaily] = useState(null);
  const [loading, setLoading] = useState(false);

  const legs = realizedData?.tradeLegs ?? null;
  const deposits = realizedData?.deposits ?? [];
  const dividends = realizedData?.dividends ?? [];

  const tradedTickers = useMemo(
    () => (legs ? [...new Set(legs.map(l => l.t))] : []),
    [legs]);
  const inceptionDate = useMemo(
    () => (legs ? legs.map(l => l.d).filter(Boolean).sort()[0] : null),
    [legs]);
  const D0 = range === 'inception' && inceptionDate ? inceptionDate : (defaultStart ?? '2025-07-01');

  // Fetch daily closes once per traded-ticker set: portfolio (raw) + SPY (raw+adj) + EURUSD.
  useEffect(() => {
    if (!tradedTickers.length) { setDaily(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [port, spyRaw, spyAdj, eur] = await Promise.all([
        fetchDaily(tradedTickers, false),
        fetchDaily(['SPY'], false),
        fetchDaily(['SPY'], true),
        fetchDaily(['EURUSD'], false),
      ]);
      if (cancelled) return;
      setDaily({ port, spyRaw: spyRaw.SPY ?? [], spyAdj: spyAdj.SPY ?? [], eur: eur.EURUSD ?? [] });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tradedTickers]);

  return useMemo(() => {
    if (!legs || !daily) return { loading, ready: false, range, setRange, inceptionDate };

    const closeOf = {};
    for (const t of tradedTickers) closeOf[t] = carryForwardLookup(daily.port[t] ?? []);
    const spyAdjOf = carryForwardLookup(daily.spyAdj);
    const fxOf = carryForwardLookup(daily.eur);
    const spine = daily.spyRaw.map(r => r.date).sort();
    const dates = spine.filter(d => d >= D0);
    if (!dates.length) return { loading, ready: false, range, setRange, inceptionDate };

    const tickers = tradedTickers.filter(
      t => sharesAt(legs, t, D0) > 0 || legs.some(l => l.t === t && l.d >= D0));
    const rows = buildDailyLedger({ dates, tickers, legs, closeOf, fxOf, dividends });
    const integrity = windowIntegrity(rows, {
      unpricedTickers: unpricedHeldTickers(dates, tickers, legs, closeOf),
      negativeTickers: negativeShareTickers(dates, tickers, legs),
    });

    const twr = twrSeries(rows);
    const spy = spyTwrSeries(dates, spyAdjOf, fxOf);
    // One chart array; both lines already start at 0%.
    const fmtLabel = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const chartData = dates.map((d, i) => ({
      date: d, label: fmtLabel(d),
      portfolio: twr[i]?.twrPct ?? null, spy: spy[i]?.twrPct ?? null,
    }));

    // MWR (XIRR) since D0 + € mirror share of the same flows.
    const H0 = rows.find(r => r.H != null)?.H ?? 0;
    const Hnow = [...rows].reverse().find(r => r.H != null)?.H ?? 0;
    const cf = [{ date: D0, amount: -H0 }];
    for (const dep of deposits) if (dep.date > D0 && dep.amountEur) cf.push({ date: dep.date, amount: -dep.amountEur });
    cf.push({ date: dates.at(-1), amount: Hnow + (currentCashEur ?? 0) });
    const mwr = xirr(cf);

    const twrNow = twr.at(-1)?.twrPct ?? null;
    const spyNow = spy.at(-1)?.twrPct ?? null;

    return {
      loading, ready: true, range, setRange, inceptionDate, D0, integrity,
      chartData,
      twrPct: twrNow, spyPct: spyNow,
      vsSpyPct: twrNow != null && spyNow != null ? twrNow - spyNow : null,   // = endpoint gap (no pin)
      mwrPct: mwr != null ? mwr * 100 : null,
      terminalEur: Hnow + (currentCashEur ?? 0),
    };
  }, [legs, daily, D0, range, tradedTickers, dividends, deposits, currentCashEur, loading, inceptionDate]);
}
