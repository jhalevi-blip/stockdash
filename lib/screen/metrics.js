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

export const ROIC_MIN = 0.15;        // through-cycle ROIC floor (10-yr median, was 0.13 latest)
export const ROIC_NM_MAX = 2.0;      // operating ROIC > 200% is not-meaningful
export const DIVERGENCE_MAX = 0.2;   // market_cap_divergence above this ⇒ data-quality flag
export const DRAWDOWN_MIN = 0.40;    // ≥ 40% below the stored 52-week high (was 0.35)
export const INDUSTRY_MIN = 5;       // < this many evaluable names ⇒ too small to rank
export const HIGHLIGHT_PCTL = 0.2;   // best 20% of the composite percentile

// Through-cycle ROIC — the screen gates on the MEDIAN of per-fiscal-year operating
// ROIC, not the latest year, to reward durable rather than momentary returns.
export const MAX_HISTORY_YEARS = 10;   // window: up to the last 10 fiscal years
export const MIN_HISTORY_YEARS = 6;    // fewer computable years ⇒ "insufficient history"
// Per-year tax rate = income_tax_expense / income_before_tax, trusted only within this
// band. An invalid/missing year uses the company's OWN median valid rate; only a company
// with fewer than MIN_VALID_TAX_YEARS valid years falls back to TAX_DEFAULT.
export const TAX_VALID_LO = 0;
export const TAX_VALID_HI = 0.5;
export const MIN_VALID_TAX_YEARS = 3;
export const TAX_DEFAULT = 0.21;

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

// ── Through-cycle operating ROIC ────────────────────────────────────────────────
export function median(nums) {
  if (!nums || nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// Effective tax rate for one annual statement row, or null when unavailable.
function rawTaxRate(r) {
  if (!fin(r.income_tax_expense) || !fin(r.income_before_tax) || r.income_before_tax === 0) return null;
  return r.income_tax_expense / r.income_before_tax;
}
const taxIsValid = t => fin(t) && t >= TAX_VALID_LO && t <= TAX_VALID_HI;

// Per-fiscal-year operating ROIC over up to MAX_HISTORY_YEARS of annual rows, reduced
// to the through-cycle (median) figure.
//   - Operating ROIC uses the SAME operating invested-capital definition as the latest
//     snapshot (investedCapitalOperating). A year counts only when its IC is > 0 and
//     EBIT is present.
//   - Per-year tax: the year's own effective rate when within [TAX_VALID_LO, TAX_VALID_HI];
//     otherwise the company's median valid rate; otherwise (fewer than MIN_VALID_TAX_YEARS
//     valid years) TAX_DEFAULT. A substituted year is counted, never dropped.
// Returns { years, median, latest, taxFallback, series } — series newest-first, `latest`
// is the most-recent computable year's ROIC.
export function throughCycleRoic(annualRows) {
  const rows = [...(annualRows || [])]
    .sort((a, b) => (b.fiscal_year ?? -Infinity) - (a.fiscal_year ?? -Infinity))
    .slice(0, MAX_HISTORY_YEARS);

  const validRates = rows.map(rawTaxRate).filter(taxIsValid);
  const companyMedianTax = validRates.length >= MIN_VALID_TAX_YEARS ? median(validRates) : null;

  const series = [];
  let taxFallback = 0;
  for (const r of rows) {
    const ic = investedCapitalOperating(r);
    if (!fin(ic) || ic <= 0 || !fin(r.ebit)) continue;   // operating ROIC uncomputable this year
    const own = rawTaxRate(r);
    let tax;
    if (taxIsValid(own)) tax = own;
    else { tax = companyMedianTax != null ? companyMedianTax : TAX_DEFAULT; taxFallback++; }
    series.push({ fiscalYear: r.fiscal_year, roic: (r.ebit * (1 - tax)) / ic });
  }
  return {
    years: series.length,
    median: median(series.map(s => s.roic)),
    latest: series.length ? series[0].roic : null,   // most-recent computable fiscal year
    taxFallback,
    series,
  };
}

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
