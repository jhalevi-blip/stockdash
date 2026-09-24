// Shared quality-screen metrics, imported by BOTH the API route
// (app/api/screen/route.js) and the refresh job (scripts/refresh-screen-quotes.mjs)
// so the two can never drift on the ROIC / flagging / leverage definitions.
//
// Operating ROIC (the screen's definition — NOT the snapshot's `roic` column, which
// uses the wrong invested-capital base, and NEVER FMP's investedCapitalTTM):
//   invested capital = (current assets − cash) − (current liabilities − short-term debt)
//                      + net PP&E
//   NOPAT            = ebit × (1 − tax_rate)
//   operating ROIC   = NOPAT / invested capital

export const ROIC_MIN = 0.13;        // ROIC floor
export const ROIC_NM_MAX = 2.0;      // operating ROIC > 200% is not-meaningful
export const DIVERGENCE_MAX = 0.2;   // market_cap_divergence above this ⇒ data-quality flag
export const DRAWDOWN_MIN = 0.35;    // ≥ 35% below the stored 52-week high
export const INDUSTRY_MIN = 5;       // < this many evaluable names ⇒ too small to rank
export const HIGHLIGHT_PCTL = 0.2;   // best 20% of the composite percentile

// Snapshot operand columns the pipeline reads (industry/sector come from symbol_universe).
export const SNAP_COLS = [
  'symbol', 'price',
  'ebit', 'tax_rate', 'ebitda',
  'total_current_assets', 'cash_and_equivalents', 'total_current_liabilities',
  'short_term_debt', 'net_ppe',
  'roic_reported', 'gross_margin_stdev', 'net_debt_ebitda', 'net_cash',
  'market_cap_divergence',
].join(', ');

export const fin = v => typeof v === 'number' && Number.isFinite(v);

// Operating invested capital. NULL when a core operand is missing (a missing
// short-term-debt line is treated as 0 — no short-term debt to add back).
export function investedCapitalOperating(r) {
  if (!fin(r.total_current_assets) || !fin(r.cash_and_equivalents) ||
      !fin(r.total_current_liabilities) || !fin(r.net_ppe)) return null;
  const std = fin(r.short_term_debt) ? r.short_term_debt : 0;
  return (r.total_current_assets - r.cash_and_equivalents)
       - (r.total_current_liabilities - std)
       + r.net_ppe;
}

// Classify one evaluable snapshot row: compute operating ROIC and decide whether it is
// a clean candidate or belongs in the flagged review group (rules 6 + 8).
//   flagged    : true ⇒ diverted out of the funnel (never gated/highlighted/dropped)
//   roicNm     : true ⇒ ROIC is not-meaningful (shown "n/m"): IC ≤ 0 or ROIC > 200%
//   reasons    : human-readable flag reasons
//   ic, roic   : operating invested capital and operating ROIC (roic NULL if uncomputable)
export function classifyRow(r) {
  const ic = investedCapitalOperating(r);
  const roic = (fin(ic) && ic > 0 && fin(r.ebit) && fin(r.tax_rate))
    ? (r.ebit * (1 - r.tax_rate)) / ic
    : null;

  const reasons = [];
  if (fin(ic) && ic <= 0) reasons.push('operating invested capital ≤ 0');
  if (fin(roic) && roic > ROIC_NM_MAX) reasons.push('ROIC > 200%');
  const roicNm = reasons.length > 0;
  if (fin(r.market_cap_divergence) && r.market_cap_divergence > DIVERGENCE_MAX) {
    reasons.push('market-cap divergence > 0.2');
  }
  return { ic, roic, roicNm, reasons, flagged: reasons.length > 0 };
}

export const passesRoic = roic => fin(roic) && roic >= ROIC_MIN;

// A single sortable leverage axis (lower = better), encoding rule 7:
//   EBITDA ≤ 0            → +Infinity (worst)
//   net cash + EBITDA > 0 → −Infinity (best)
//   otherwise            → net_debt_ebitda multiple
// null when leverage is indeterminate (no EBITDA and no net-cash flag).
export function leverageValue(r) {
  if (!fin(r.ebitda) || r.ebitda <= 0) return Number.POSITIVE_INFINITY;
  if (r.net_cash === true) return Number.NEGATIVE_INFINITY;
  if (fin(r.net_debt_ebitda)) return r.net_debt_ebitda;
  return null;
}

// Percentile rank of v within a cohort sorted ascending: (#strictly-less)/(n-1), so the
// lowest value is 0 (best) and the highest is 1. ±Infinity members sort to the ends.
export function pctRank(sorted, v) {
  const n = sorted.length;
  if (n <= 1) return 0;
  let less = 0;
  while (less < n && sorted[less] < v) less++;
  return less / (n - 1);
}
