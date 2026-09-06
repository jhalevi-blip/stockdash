// Pure builder for the valuation chart (P/E + rolling 3-year revenue CAGR). No I/O:
// takes the TTM series from buildFinancialsSeries — each row carries TTM revenue, TTM
// netIncome and sharesDiluted (the latest quarter's diluted share count) — plus a price
// lookup, and returns one row per TTM quarter. Kept pure so it's unit-testable and
// reusable by the research route later.
//
// Guard rule (same as the rest of financials): uncomputable -> null, never 0/guess.
//   • TTM EPS = TTM netIncome / sharesDiluted (sharesDiluted must be > 0).
//   • P/E = price / TTM EPS, but ONLY when EPS > 0 — a zero/negative multiple is never
//     plotted; the line BREAKS (null) there instead.
//   • The MOST RECENT point is priced at `livePrice` (the current price) rather than its
//     quarter-end close, so the chart's right edge ties to the live Key stats P/E; every
//     earlier point keeps its own quarter-end close.
//   • rev CAGR (3y) = (TTM revenue now / TTM revenue 3 years prior)^(1/3) - 1, matched
//     exactly 12 calendar quarters back (by key, not array offset) so a missing quarter
//     can't misalign it; null for the first three years so the line starts where data
//     exists rather than plotting zero.

import { calIndexFromDate } from './calendarQuarter.js';

const num = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;

// Calendar index from an ISO period-end date, for finding the row exactly three years
// (12 quarters) earlier by key. Uses the SHARED snap so it's keyed identically to what
// the backfill stored — if these two ever disagreed the CAGR lookup would silently land
// on the wrong quarter. null on an unparseable date.
const calIndex = date => calIndexFromDate(date);

// TTM EPS for a shaped ttm row, or null. Diluted share count must be positive.
export function ttmEps(row) {
  const ni = num(row?.netIncome), sh = num(row?.sharesDiluted);
  return (ni !== null && sh !== null && sh > 0) ? ni / sh : null;
}

/**
 * @param {Array} ttmRows  chronological ttm series (oldest first) from buildFinancialsSeries
 * @param {(isoDate: string) => number|null} priceAt  as-of close at/just-before a date
 * @param {number|null} livePrice  current price applied to the MOST RECENT point only, so
 *   the chart's right edge ties to the live Key stats P/E; earlier points use quarter-end close
 * @returns rows [{ date, label, pe, revCagr3y }] over the FULL series (caller slices to range)
 */
export function buildValuationRows(ttmRows = [], priceAt = () => null, livePrice = null) {
  const byCal = new Map();
  for (const r of ttmRows) { const c = calIndex(r.date); if (c !== null) byCal.set(c, r); }
  const lastIdx = ttmRows.length - 1;
  const live = num(livePrice);

  return ttmRows.map((r, i) => {
    const eps = ttmEps(r);
    // Most recent point → live/current price (ties to Key stats); all earlier points →
    // their own quarter-end close.
    const price = (i === lastIdx && live !== null) ? live : num(priceAt(r.date));
    // Break (null) on non-positive EPS — never a zero/negative multiple.
    const pe = (eps !== null && eps > 0 && price !== null) ? price / eps : null;

    const c = calIndex(r.date);
    const prior = c === null ? null : byCal.get(c - 12);   // exactly 3 years earlier
    const revNow = num(r.revenue), revPrior = num(prior?.revenue);
    const revCagr3y = (revNow !== null && revNow > 0 && revPrior !== null && revPrior > 0)
      ? Math.pow(revNow / revPrior, 1 / 3) - 1
      : null;

    return { date: r.date, label: r.label, pe, revCagr3y };
  });
}

// As-of close lookup: the latest close with date <= target. Expects prices sorted
// ascending by date (the historical-prices route returns them sorted). Returns a finite
// number or null. A linear scan from the end is fine for ~5y of daily rows.
export function makePriceAt(prices = []) {
  return (isoDate) => {
    if (!isoDate) return null;
    for (let i = prices.length - 1; i >= 0; i--) {
      const p = prices[i];
      if (p && p.date && p.date <= isoDate) {
        const c = num(p.close);
        if (c !== null) return c;
      }
    }
    return null;
  };
}
