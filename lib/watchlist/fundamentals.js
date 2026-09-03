// FMP fundamentals fetching + derived-field computation.
// Extracted from scripts/backfill-fundamentals.mjs so the backfill cron/script and
// the /api/watchlist/fundamentals route share one implementation (see backlog doc).
//
// Two exports:
//   fetchSymbolFundamentals(symbol, getJson?) — the six endpoint calls, raw results.
//     getJson(path) -> parsed JSON | null. The backfill injects its throttled getJson
//     (throttle stays a script concern); callers that don't need pacing (e.g. the
//     single-symbol route) can omit it and use the built-in fetcher.
//   computeDerived(raw, screenRow) — every derived field and guard.
//
// Guard rules: uncomputable field -> NULL (never 0, never a guess); a missing
// denominator is not a zero.

const BASE = 'https://financialmodelingprep.com';
const iso = d => d.toISOString().slice(0, 10);

// ── Numeric helpers. num() -> finite number or null (a guard, not a coercion). ─
export const num = v => (typeof v === 'number' && Number.isFinite(v)) ? v : null;
function cagr(end, start, years) {
  const e = num(end), s = num(start);
  if (e === null || s === null || s <= 0 || e <= 0) return null; // negative base => undefined
  return Math.pow(e / s, 1 / years) - 1;
}
function sampleStdev(xs) {
  const v = xs.filter(x => num(x) !== null);
  if (v.length < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1); // sample (n-1)
  return Math.sqrt(variance);
}
const ratio = (n, d) => { // divide with a real-denominator guard
  const nn = num(n), dd = num(d);
  return (nn === null || dd === null || dd === 0) ? null : nn / dd;
};
const inBand = (v, lo, hi) => { const n = num(v); return (n !== null && n >= lo && n <= hi) ? n : null; };

// Default fetcher for callers that don't inject one. No throttle — that's the
// backfill's concern; single-symbol callers don't need it.
async function defaultGetJson(path) {
  try {
    const r = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}apikey=${process.env.FMP_API_KEY}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j && typeof j === 'object' && (j['Error Message'] || j.error)) return null;
    return j;
  } catch { return null; }
}

// The probe-verified endpoints for one symbol. Returns the raw responses.
// Annual statements at limit=10 and quarterly at limit=40 (~10 years) for income
// statement, balance sheet AND cash flow, so period history (fundamentals_annual /
// fundamentals_quarterly) can be written and metric definitions recomputed later
// without re-probing. key-metrics-ttm/ratios-ttm/price stay for the snapshot's
// divergence, tax rate, gross margin and price-derived fields.
export async function fetchSymbolFundamentals(symbol, getJson = defaultGetJson) {
  const today = iso(new Date());
  const d = new Date(); d.setFullYear(d.getFullYear() - 1);
  const yearAgo = iso(d);
  const [km0, rt0, incA, cfA, bsA, incQ, cfQ, bsQ, px] = await Promise.all([
    getJson(`/stable/key-metrics-ttm?symbol=${symbol}`),
    getJson(`/stable/ratios-ttm?symbol=${symbol}`),
    getJson(`/stable/income-statement?symbol=${symbol}&period=annual&limit=10`),
    getJson(`/stable/cash-flow-statement?symbol=${symbol}&period=annual&limit=10`),
    getJson(`/stable/balance-sheet-statement?symbol=${symbol}&period=annual&limit=10`),
    getJson(`/stable/income-statement?symbol=${symbol}&period=quarter&limit=40`),
    getJson(`/stable/cash-flow-statement?symbol=${symbol}&period=quarter&limit=40`),
    getJson(`/stable/balance-sheet-statement?symbol=${symbol}&period=quarter&limit=40`),
    getJson(`/stable/historical-price-eod/light?symbol=${symbol}&from=${yearAgo}&to=${today}`),
  ]);
  return { km0, rt0, incA, cfA, bsA, incQ, cfQ, bsQ, px };
}

// ── Raw statement operands: db column -> FMP /stable field, by statement ────────
// One source of truth for both the snapshot's latest-annual operands (015) and the
// per-period history rows (016/017). Every read goes through num(), so a field FMP
// omits — or a name that drifts — yields NULL, never a throw (the guard rule:
// uncomputable -> NULL, never 0). All field names verified against a live AAPL probe
// (2026-09-03). Notes on the non-obvious ones:
//   weighted_average_shares_basic -> weightedAverageShsOut is a WEIGHTED AVERAGE, not
//     a point-in-time count; FMP's statements expose no period-end share count
//     (balance-sheet commonStock is a dollar value). Diluted is stored separately;
//     the basic/diluted gap is the dilution signal.
//   operating_lease_liability -> capitalLeaseObligations lumps finance + operating
//     leases; the current/non-current split is stored separately (lease_liability_*).
//   dividends_paid -> netDividendsPaid is common + preferred.
const INC_FIELDS = {
  revenue: 'revenue',
  cost_of_revenue: 'costOfRevenue',
  gross_profit: 'grossProfit',
  operating_income: 'operatingIncome',
  ebit: 'ebit',
  ebitda: 'ebitda',
  depreciation_amortization: 'depreciationAndAmortization',
  rd_expense: 'researchAndDevelopmentExpenses',
  interest_expense: 'interestExpense',
  interest_income: 'interestIncome',
  income_before_tax: 'incomeBeforeTax',
  income_tax_expense: 'incomeTaxExpense',
  net_income: 'netIncome',
  weighted_average_shares_basic: 'weightedAverageShsOut',      // weighted avg, not point-in-time
  weighted_average_shares_diluted: 'weightedAverageShsOutDil',
};
const BS_FIELDS = {
  total_assets: 'totalAssets',
  total_current_assets: 'totalCurrentAssets',
  inventory: 'inventory',
  total_current_liabilities: 'totalCurrentLiabilities',
  total_liabilities: 'totalLiabilities',
  total_equity: 'totalStockholdersEquity',
  total_debt: 'totalDebt',
  long_term_debt: 'longTermDebt',
  short_term_debt: 'shortTermDebt',
  cash_and_equivalents: 'cashAndCashEquivalents',
  goodwill: 'goodwill',
  intangible_assets: 'intangibleAssets',
  net_ppe: 'propertyPlantEquipmentNet',
  operating_lease_liability: 'capitalLeaseObligations',           // total finance+operating leases
  lease_liability_current: 'capitalLeaseObligationsCurrent',
  lease_liability_noncurrent: 'capitalLeaseObligationsNonCurrent',
  minority_interest: 'minorityInterest',
};
const CF_FIELDS = {
  operating_cash_flow: 'operatingCashFlow',
  capex: 'capitalExpenditure',
  dividends_paid: 'netDividendsPaid',                    // net = common + preferred
  share_repurchases: 'commonStockRepurchased',
  stock_based_compensation: 'stockBasedCompensation',
};

// Pull the mapped raw operands out of one income/balance/cash-flow row-set into an
// object keyed by db column name; every value guarded through num().
function rawOperands(incRow, bsRow, cfRow) {
  const out = {};
  for (const [col, f] of Object.entries(INC_FIELDS)) out[col] = num(incRow?.[f]);
  for (const [col, f] of Object.entries(BS_FIELDS))  out[col] = num(bsRow?.[f]);
  for (const [col, f] of Object.entries(CF_FIELDS))  out[col] = num(cfRow?.[f]);
  return out;
}

// ── Period history row builders (fundamentals_annual / fundamentals_quarterly) ──
const asArr = a => (Array.isArray(a) ? a : []);
const indexByDate = arr => { const m = new Map(); for (const r of asArr(arr)) if (r?.date) m.set(r.date, r); return m; };
// FMP returns fiscalYear as a STRING ("2025") — parse numeric strings, not just
// numbers, or fiscal_year reads null (annual rows get skipped, quarterly labels lost).
const intOrNull = v => {
  const n = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v)) : v;
  return (typeof n === 'number' && Number.isFinite(n)) ? Math.trunc(n) : null;
};
// FMP quarterly `period` is 'Q1'..'Q4' (annual is 'FY'); return 1..4 or null.
const parseFiscalQuarter = p => { const m = /^Q([1-4])$/.exec(String(p ?? '')); return m ? parseInt(m[1], 10) : null; };
// Keep the first row per key (statement arrays are newest-first, so first = newest).
// Guards Postgres upsert, which errors if one INSERT touches a PK twice.
function dedupeByKey(rows, keyFn) {
  const seen = new Set(); const out = [];
  for (const r of rows) { const k = keyFn(r); if (seen.has(k)) continue; seen.add(k); out.push(r); }
  return out;
}

// Annual rows: aligned across the three statements by period-end date, keyed by
// fiscal_year (the table PK — rows without one are skipped).
function periodRowsAnnual(symbol, incA, bsA, cfA) {
  const bsByDate = indexByDate(bsA), cfByDate = indexByDate(cfA);
  const rows = [];
  for (const inc of asArr(incA)) {
    const fy = intOrNull(inc?.fiscalYear);
    if (fy === null) continue;
    const date = inc?.date || null;
    rows.push({ symbol, fiscal_year: fy, report_date: date, ...rawOperands(inc, date ? bsByDate.get(date) : null, date ? cfByDate.get(date) : null) });
  }
  return rows;
}

// Quarterly rows: keyed on CALENDAR (year, quarter) derived from the period-end
// date; FMP's fiscal labels stored alongside. Rows without a parseable date are
// skipped (no calendar key). No TTM is computed — that's a query-time concern.
function periodRowsQuarterly(symbol, incQ, bsQ, cfQ) {
  const bsByDate = indexByDate(bsQ), cfByDate = indexByDate(cfQ);
  const rows = [];
  for (const inc of asArr(incQ)) {
    const date = inc?.date || null;
    const d = date ? new Date(date) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    rows.push({
      symbol,
      calendar_year: d.getUTCFullYear(),
      calendar_quarter: Math.floor(d.getUTCMonth() / 3) + 1,   // 1..4
      fiscal_year: intOrNull(inc?.fiscalYear),
      fiscal_quarter: parseFiscalQuarter(inc?.period),
      report_date: date,
      ...rawOperands(inc, bsByDate.get(date), cfByDate.get(date)),
    });
  }
  return rows;
}

// Build both period-history row sets for one symbol from its raw responses. The
// backfill writes annual -> fundamentals_annual, quarterly -> fundamentals_quarterly.
export function buildPeriodRows(raw, symbol) {
  return {
    annual: dedupeByKey(periodRowsAnnual(symbol, raw.incA, raw.bsA, raw.cfA), r => r.fiscal_year),
    quarterly: dedupeByKey(periodRowsQuarterly(symbol, raw.incQ, raw.bsQ, raw.cfQ), r => `${r.calendar_year}-${r.calendar_quarter}`),
  };
}

// Every derived field + guard, computed from the raw responses and the screener row.
export function computeDerived(raw, screenRow) {
  const { km0, rt0, px } = raw;
  const inc = raw.incA, cf = raw.cfA, bs = raw.bsA;   // latest-annual arrays (newest first)
  const symbol = screenRow.symbol;
  const km = Array.isArray(km0) ? km0[0] : null;
  const rt = Array.isArray(rt0) ? rt0[0] : null;
  const incA = Array.isArray(inc) ? inc : [];        // annual, newest first
  const cfA = Array.isArray(cf) ? cf : [];
  const prices = Array.isArray(px) ? px : [];         // newest first: [{price,volume,date}]

  // Price-derived
  const price = prices.length ? num(prices[0].price) : null;
  const highs = prices.map(p => num(p.price)).filter(x => x !== null);
  const high_52w = highs.length ? Math.max(...highs) : null;
  const drawdown_pct = (high_52w !== null && price !== null && high_52w > 0)
    ? (high_52w - price) / high_52w : null;
  const dvWindow = prices.slice(0, 30).map(p => ratio(num(p.price) * num(p.volume), 1))
    .filter(x => x !== null); // price*volume per day, last 30d
  const avg_dollar_volume = dvWindow.length ? dvWindow.reduce((a, b) => a + b, 0) / dvWindow.length : null;

  // Gross-margin series. A margin outside [-1, 1] is arithmetically impossible
  // (bad FMP data) -> drop that year entirely. The >=4 rule and gross_margin_years
  // then reflect USABLE years, not filed years.
  const gmComputable = incA.map(y => ratio(y.grossProfit, y.revenue)).filter(x => x !== null);
  const gmSeries = gmComputable.filter(x => x >= -1 && x <= 1);
  const gmDropped = gmComputable.length - gmSeries.length;
  const gross_margin_years = gmSeries.length;                       // usable years only
  const gross_margin_stdev = gmSeries.length >= 4 ? sampleStdev(gmSeries) : null;

  // Data-quality: how far FMP's two market-cap sources disagree (screener vs TTM
  // metrics). >0.2 => FMP contradicts itself; the row shouldn't be trusted.
  const screenerCap = num(screenRow.marketCap);
  const metricsCap = num(km?.marketCap);
  const market_cap_divergence = (screenerCap !== null && screenerCap > 0 && metricsCap !== null)
    ? Math.abs(screenerCap - metricsCap) / screenerCap : null;

  // 3y CAGRs need index 0 (latest) and index 3 (3 fiscal years back)
  const revenue_cagr_3y = incA.length >= 4 ? cagr(incA[0].revenue, incA[3].revenue, 3) : null;
  const shares_cagr_3y = incA.length >= 4 ? cagr(incA[0].weightedAverageShsOut, incA[3].weightedAverageShsOut, 3) : null;

  // ── Tail-prone ratios: recompute from raw components, guard the denominator ──
  // Never use FMP's precomputed ratio (returnOnEquityTTM, netDebtToEBITDATTM, …):
  // those divided by tiny/negative denominators, which is what produced the wild
  // tails. If a denominator is meaningless OR unavailable -> NULL (no fallback).
  const inc0 = incA[0] || {}, cf0 = cfA[0] || {};
  const bs0 = (Array.isArray(bs) ? bs[0] : null) || {};

  // net_debt_ebitda = netDebt / EBITDA ; EBITDA must be > 0 AND >= 5% of revenue.
  // Net-cash names (netDebt < 0): the leverage multiple is meaningless -> NULL it
  // and flag net_cash so the gate ("net_debt_ebitda < 3.0 OR net_cash") passes them
  // on merit. net_cash is NULL when netDebt itself is unavailable.
  const ebitda = num(inc0.ebitda), rev0 = num(inc0.revenue), netDebt = num(bs0.netDebt);
  const net_cash = netDebt === null ? null : netDebt < 0;
  const ebitdaOk = ebitda !== null && ebitda > 0 && rev0 !== null && rev0 > 0 && ebitda >= 0.05 * rev0;
  const net_debt_ebitda = (net_cash === false && ebitdaOk) ? netDebt / ebitda : null;

  // roe = netIncome / totalStockholdersEquity ; equity must be > 0
  const equity = num(bs0.totalStockholdersEquity), ni0 = num(inc0.netIncome);
  const roe = (equity !== null && equity > 0 && ni0 !== null) ? ni0 / equity : null;

  // fcf_conversion = FCF / netIncome ; net income must be MATERIAL: >= 2% of revenue.
  // A near-zero positive net income inflates the ratio straight through the >0.8
  // gate, the same failure mode as a negative denominator.
  const fcf0 = num(cf0.freeCashFlow);
  const niMaterial = ni0 !== null && rev0 !== null && rev0 > 0 && ni0 >= 0.02 * rev0;
  const fcf_conversion = (niMaterial && fcf0 !== null) ? fcf0 / ni0 : null;

  // roic = NOPAT / invested capital ; invested capital must be > 0.
  // NOPAT = EBIT * (1 - tax rate). The PRIMARY base strips goodwill (acquisition
  // premium) but KEEPS intangibles, computed from OUR balance sheet:
  //   invested_capital_ex_goodwill = total_debt + total_equity - cash - goodwill  (primary -> roic)
  //   invested_capital_reported    = total_debt + total_equity - cash             (-> roic_reported)
  // goodwill absent -> treated as 0 for the base (nothing to strip); the debt/equity/
  // cash base must be present or invested capital is NULL.
  const ebit = num(inc0.ebit);
  const _debt = num(bs0.totalDebt), _eq = num(bs0.totalStockholdersEquity), _cash = num(bs0.cashAndCashEquivalents);
  const _gw = num(bs0.goodwill);
  const investedCapitalReported = (_debt !== null && _eq !== null && _cash !== null) ? _debt + _eq - _cash : null;
  const investedCapitalExGoodwill = investedCapitalReported === null ? null : investedCapitalReported - (_gw ?? 0);

  // goodwill_share = goodwill / invested_capital_reported: the share of reported
  // invested capital that is acquisition premium, so a goodwill-heavy name is visible
  // at a glance. NULL when the reported base isn't positive or goodwill is missing
  // (absent goodwill is not a 0% share we can assert).
  const goodwill_share = (investedCapitalReported !== null && investedCapitalReported > 0 && _gw !== null)
    ? _gw / investedCapitalReported : null;

  // Tax rate: TTM effective rate if in [0,1], else derived from the latest annual
  // statement, else NULL. CHANGED: when both sources fail we NULL the rate (and thus
  // roic) rather than defaulting to 0 — a fail-open there inflates NOPAT ~20% on a
  // number we gate on. tax_rate is stored so the choice is auditable.
  let taxRate = inBand(rt?.effectiveTaxRateTTM, 0, 1);
  if (taxRate === null) { const t = ratio(inc0.incomeTaxExpense, inc0.incomeBeforeTax); taxRate = (t !== null && t >= 0 && t <= 1) ? t : null; }
  const nopat = (ebit !== null && taxRate !== null) ? ebit * (1 - taxRate) : null;

  const roic = (investedCapitalExGoodwill !== null && investedCapitalExGoodwill > 0 && nopat !== null)
    ? nopat / investedCapitalExGoodwill : null;
  const roic_reported = (investedCapitalReported !== null && investedCapitalReported > 0 && nopat !== null)
    ? nopat / investedCapitalReported : null;
  // Thin-base flag: primary (ex-goodwill) invested capital < 5% of revenue makes roic
  // unreliable (small denominator). roic is NOT nulled/clipped — this only marks it.
  // NULL when invested capital or revenue is unavailable.
  const roic_thin_base = (investedCapitalExGoodwill !== null && rev0 !== null && rev0 > 0)
    ? investedCapitalExGoodwill < 0.05 * rev0 : null;

  const nulled_ratios = [net_debt_ebitda, roic, roe, fcf_conversion].filter(v => v === null).length;

  // Latest-annual raw operands persisted on the snapshot (015) so metric definitions
  // can be recomputed in SQL without a refetch. Includes operating_income/net_income.
  const operands = rawOperands(inc0, bs0, cf0);

  return {
    symbol,
    as_of: iso(new Date()),

    market_cap: num(screenRow.marketCap),            // screener is authoritative for cap
    market_cap_divergence,
    avg_dollar_volume,
    sector: screenRow.sector || null,
    industry: screenRow.industry || null,

    roic,                    // NOPAT / invested_capital_ex_goodwill (primary)
    roic_reported,           // NOPAT / invested_capital_reported
    roic_thin_base,          // true = ex-goodwill invested capital < 5% of revenue (roic kept as-is)
    goodwill_share,          // goodwill / invested_capital_reported (acquisition-premium share)
    tax_rate: taxRate,       // effective rate used for NOPAT; NULL when both sources failed
    roe,
    gross_margin: inBand(rt?.grossProfitMarginTTM, -1, 1),   // >1 or <-1 impossible -> NULL
    gross_margin_stdev,
    gross_margin_years,
    fcf: cfA.length ? num(cfA[0].freeCashFlow) : null,                 // latest annual reported
    fcf_conversion,
    net_debt_ebitda,
    net_cash,                // true = netDebt<0 (passes leverage gate on merit)
    nulled_ratios,           // how many of the 4 guarded ratios were NULLed for this row
    shares_cagr_3y,
    revenue_cagr_3y,

    price,
    high_52w,
    drawdown_pct,

    ...operands,             // ebit, revenue, gross_profit, total_debt, goodwill, … (015)

    __gmDropped: gmDropped,   // diagnostic: stripped before upsert, ignored by coverage
  };
}

// ── /watchlist detail-panel fundamentals (STEP 2) ─────────────────────────────
// ADDITIVE: separate from fetchSymbolFundamentals/computeDerived above, which
// serve scripts/backfill-fundamentals.mjs and must not change. The panel needs a
// different, smaller set and its own endpoints. All five are probe-verified on the
// Starter key (scripts/probe-panel-fundamentals.js, 2026-09-02).
//
// Endpoint choices — the probe caught two traps:
//   • market cap + EV come from key-metrics-ttm (marketCap, enterpriseValueTTM),
//     NOT /stable/enterprise-values: that endpoint is an ANNUAL snapshot and was a
//     full year stale (MSFT cap off ~25%).
//   • debt + cash come from the latest QUARTERLY balance sheet (fresher than the
//     annual figures the enterprise-values endpoint carries).
//   • next earnings uses /stable/earnings?symbol= (per-symbol). /stable/earnings-
//     calendar ignores the symbol filter — do NOT use it.
// No price series here: the chart reuses the existing /api/historical-prices route.
const PANEL_QUARTERS = 5;

// The five panel endpoint calls for one symbol. getJson(path) -> parsed JSON|null,
// same contract as fetchSymbolFundamentals; the route injects a logging fetcher.
export async function fetchPanelFundamentals(symbol, getJson = defaultGetJson) {
  const [km0, rt0, bsq, incq, earn] = await Promise.all([
    getJson(`/stable/key-metrics-ttm?symbol=${symbol}`),
    getJson(`/stable/ratios-ttm?symbol=${symbol}`),
    getJson(`/stable/balance-sheet-statement?symbol=${symbol}&period=quarter&limit=1`),
    getJson(`/stable/income-statement?symbol=${symbol}&period=quarter&limit=${PANEL_QUARTERS}`),
    getJson(`/stable/earnings?symbol=${symbol}&limit=12`),
  ]);
  return { km0, rt0, bsq, incq, earn };
}

// Next scheduled earnings: the earliest earnings row dated today or later. Returns
// an ISO date string or null. `today` is injectable for testing.
function nextEarningsDate(earn, today = iso(new Date())) {
  if (!Array.isArray(earn)) return null;
  const future = earn
    .map(e => (e && typeof e.date === 'string') ? e.date : null)
    .filter(d => d !== null && d >= today)
    .sort();
  return future.length ? future[0] : null;
}

// Shape the raw panel responses into exactly the panel payload — nothing else.
// Every number goes through num() (uncomputable -> null, never 0/guess), the same
// guard rule the screener path uses.
export function computePanelView(raw) {
  const { km0, rt0, bsq, incq, earn } = raw;
  const km = Array.isArray(km0) ? km0[0] : null;
  const rt = Array.isArray(rt0) ? rt0[0] : null;
  const bs = Array.isArray(bsq) ? bsq[0] : null;
  const incQ = Array.isArray(incq) ? incq : [];

  // Last 5 quarters, newest first (FMP returns newest first).
  const quarters = incQ.slice(0, PANEL_QUARTERS).map(q => ({
    date: (q && typeof q.date === 'string') ? q.date : null,
    period: q?.period ?? null,
    fiscalYear: q?.fiscalYear ?? null,
    revenue: num(q?.revenue),
    grossProfit: num(q?.grossProfit),
    netIncome: num(q?.netIncome),
  }));

  return {
    marketCap: num(km?.marketCap),
    enterpriseValue: num(km?.enterpriseValueTTM),
    totalDebt: num(bs?.totalDebt),
    cashAndEquivalents: num(bs?.cashAndCashEquivalents),
    peRatio: num(rt?.priceToEarningsRatioTTM),
    psRatio: num(rt?.priceToSalesRatioTTM),
    nextEarningsDate: nextEarningsDate(earn),
    quarters,   // newest first, up to 5
  };
}

// ── Universe-exclusion signals (STEP: universe construction) ───────────────────
// ADDITIVE helpers used by scripts/backfill-fundamentals.mjs --refresh-universe to
// decide universe-level exclusions at construction. They single-source the same
// gross-margin rule computeDerived uses (gm in [-1,1]); computeDerived itself is
// left unchanged. Both take the ANNUAL income-statement array (newest first).

// Newest annual costOfRevenue / revenue, or null if uncomputable. The raw signal
// behind the cogs_ratio exclusion (a value outside [0,1] => not a normal gross
// margin: negative gross profit, or COGS > revenue).
export function latestCogsRev(inc) {
  const arr = Array.isArray(inc) ? inc : [];
  return arr.length ? ratio(arr[0].costOfRevenue, arr[0].revenue) : null;
}

// Count of annual years with a USABLE gross margin (grossProfit/revenue in [-1,1]),
// matching computeDerived's gmSeries rule. The raw signal behind the gm_years rule.
export function grossMarginYears(inc) {
  const arr = Array.isArray(inc) ? inc : [];
  return arr.map(y => ratio(y.grossProfit, y.revenue)).filter(x => x !== null && x >= -1 && x <= 1).length;
}
