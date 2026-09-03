// Pure builders for the financials-history charts. No I/O: the route passes raw
// fundamentals_annual / fundamentals_quarterly rows in, these shape the three period
// series (annual, quarterly, ttm) consumed by the Revenue / Margins / Leverage charts.
// Kept pure so it's unit-testable and reusable by the future research route.
//
// Rules (see the component/plan):
//   - Flows (revenue, gross/operating/net income, EBITDA): quarterly = as reported;
//     ttm = rolling 4-quarter sum; annual = the fiscal-year figure.
//   - Balance-sheet items (debt, cash, lease) are POINT-IN-TIME — the value as at the
//     period end, never summed.
//   - net_debt = total_debt + operating_lease_liability(0 if missing) - cash.
//   - Margins null when revenue <= 0.
//   - net_debt / EBITDA is ALWAYS on trailing-twelve-month EBITDA, in every mode
//     (a single-quarter multiple isn't a number anyone reads), and null when TTM
//     EBITDA isn't positive rather than plotting a spike.

const num = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;
const ratio = (n, d) => (n !== null && d !== null && d > 0) ? n / d : null;   // denominator must be > 0

// Point-in-time net debt. NULL when debt or cash is unavailable (can't assert a net
// figure); a missing lease liability is treated as 0 (no lease line == none to add).
function netDebt(r) {
  const debt = num(r.total_debt), cash = num(r.cash_and_equivalents);
  if (debt === null || cash === null) return null;
  return debt + (num(r.operating_lease_liability) ?? 0) - cash;
}

// One output row shared by the charts. `ttmEbitda` is passed in separately so the
// leverage ratio is always on trailing-twelve-month EBITDA regardless of mode. The
// income lines are emitted BOTH as absolute currency (for the Abs view) and as margins
// (for the % view); callers pass as-reported flows for quarterly/annual and 4-quarter
// sums for ttm, so both views are correct per period with no extra work here.
function shapeRow({ date, label, revenue, grossProfit, operatingIncome, netIncome, nd, ttmEbitda }) {
  const rev = num(revenue);
  return {
    date,
    label,
    // absolute (currency)
    revenue: rev,
    grossProfit: num(grossProfit),
    operatingIncome: num(operatingIncome),
    netIncome: num(netIncome),
    // margins (share of revenue; null when revenue <= 0)
    grossMargin: ratio(num(grossProfit), rev),
    operatingMargin: ratio(num(operatingIncome), rev),
    netMargin: ratio(num(netIncome), rev),
    netDebt: nd,
    netDebtToEbitda: nd === null ? null : ratio(nd, num(ttmEbitda)),
  };
}

// Calendar index of a quarterly row, used to detect 4 CONSECUTIVE quarters so a
// rolling sum never spans a gap (a missing quarter would otherwise understate TTM).
const qIndex = r => (r.calendar_year * 4) + (r.calendar_quarter - 1);

// Sum flow fields across a window; NULL for a field if ANY quarter in the window is
// missing it, so an incomplete TTM window doesn't silently understate the total.
function sumFlows(rows) {
  const f = key => {
    let s = 0;
    for (const r of rows) { const v = num(r[key]); if (v === null) return null; s += v; }
    return s;
  };
  return {
    revenue: f('revenue'),
    grossProfit: f('gross_profit'),
    operatingIncome: f('operating_income'),
    netIncome: f('net_income'),
    ebitda: f('ebitda'),
  };
}

function buildAnnual(annualRows) {
  return [...annualRows]
    .sort((a, b) => (a.fiscal_year ?? 0) - (b.fiscal_year ?? 0))
    .map(r => shapeRow({
      date: r.report_date,
      label: `FY${r.fiscal_year}`,
      revenue: r.revenue, grossProfit: r.gross_profit,
      operatingIncome: r.operating_income, netIncome: r.net_income,
      nd: netDebt(r),
      ttmEbitda: r.ebitda,   // an annual figure is already twelve months
    }));
}

// Builds both the quarterly (as-reported flows) and ttm (rolling 4Q flows) series in
// one pass. Both take net debt point-in-time at the quarter end; both take the ratio
// on the trailing-4Q EBITDA sum ending at that quarter (null until 4 quarters exist).
function buildQuarterlyAndTtm(quarterlyRows) {
  const qs = [...quarterlyRows].sort((a, b) => qIndex(a) - qIndex(b));
  const quarterly = [], ttm = [];
  for (let i = 0; i < qs.length; i++) {
    const r = qs[i];
    const label = `Q${r.fiscal_quarter ?? '?'} ${r.fiscal_year ?? r.calendar_year}`;
    // Trailing-4Q window ending at i, only when the 4 quarters are consecutive.
    let sums = null;
    if (i >= 3 && qIndex(r) - qIndex(qs[i - 3]) === 3) sums = sumFlows(qs.slice(i - 3, i + 1));
    const ttmEbitda = sums ? sums.ebitda : null;

    quarterly.push(shapeRow({
      date: r.report_date, label,
      revenue: r.revenue, grossProfit: r.gross_profit,
      operatingIncome: r.operating_income, netIncome: r.net_income,
      nd: netDebt(r),
      ttmEbitda,   // leverage on trailing-4Q EBITDA even in quarterly mode
    }));

    if (sums) {
      ttm.push(shapeRow({
        date: r.report_date, label: `TTM ${label}`,
        revenue: sums.revenue, grossProfit: sums.grossProfit,
        operatingIncome: sums.operatingIncome, netIncome: sums.netIncome,
        nd: netDebt(r),          // point-in-time at the window's latest quarter
        ttmEbitda: sums.ebitda,
      }));
    }
  }
  return { quarterly, ttm };
}

// annualRows: fundamentals_annual rows; quarterlyRows: fundamentals_quarterly rows.
// Returns { annual, quarterly, ttm }, each chronological (oldest first).
export function buildFinancialsSeries(annualRows = [], quarterlyRows = []) {
  const { quarterly, ttm } = buildQuarterlyAndTtm(quarterlyRows);
  return { annual: buildAnnual(annualRows), quarterly, ttm };
}
