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

// The six probe-verified endpoints for one symbol. Returns the raw responses.
export async function fetchSymbolFundamentals(symbol, getJson = defaultGetJson) {
  const today = iso(new Date());
  const d = new Date(); d.setFullYear(d.getFullYear() - 1);
  const yearAgo = iso(d);
  const [km0, rt0, inc, cf, bs, px] = await Promise.all([
    getJson(`/stable/key-metrics-ttm?symbol=${symbol}`),
    getJson(`/stable/ratios-ttm?symbol=${symbol}`),
    getJson(`/stable/income-statement?symbol=${symbol}&period=annual&limit=5`),
    getJson(`/stable/cash-flow-statement?symbol=${symbol}&period=annual&limit=3`),
    getJson(`/stable/balance-sheet-statement?symbol=${symbol}&period=annual&limit=3`),
    getJson(`/stable/historical-price-eod/light?symbol=${symbol}&from=${yearAgo}&to=${today}`),
  ]);
  return { km0, rt0, inc, cf, bs, px };
}

// Every derived field + guard, computed from the raw responses and the screener row.
export function computeDerived(raw, screenRow) {
  const { km0, rt0, inc, cf, bs, px } = raw;
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
  // NOPAT = EBIT * (1 - tax rate); invested capital denominator from key-metrics-ttm.
  const investedCapital = num(km?.investedCapitalTTM), ebit = num(inc0.ebit);
  let taxRate = inBand(rt?.effectiveTaxRateTTM, 0, 1);
  if (taxRate === null) { const t = ratio(inc0.incomeTaxExpense, inc0.incomeBeforeTax); taxRate = (t !== null && t >= 0 && t <= 1) ? t : 0; }
  const nopat = ebit !== null ? ebit * (1 - taxRate) : null;
  const roic = (investedCapital !== null && investedCapital > 0 && nopat !== null) ? nopat / investedCapital : null;
  // Thin-base flag: invested capital < 5% of revenue makes roic unreliable (small
  // denominator). We do NOT null/clip roic — this just marks it for the reader.
  // NULL when invested capital or revenue is unavailable.
  const roic_thin_base = (investedCapital !== null && rev0 !== null && rev0 > 0)
    ? investedCapital < 0.05 * rev0 : null;

  const nulled_ratios = [net_debt_ebitda, roic, roe, fcf_conversion].filter(v => v === null).length;

  return {
    symbol,
    as_of: iso(new Date()),

    market_cap: num(screenRow.marketCap),            // screener is authoritative for cap
    market_cap_divergence,
    avg_dollar_volume,
    sector: screenRow.sector || null,
    industry: screenRow.industry || null,

    roic,
    roic_thin_base,          // true = invested capital < 5% of revenue (roic kept as-is)
    roe,
    gross_margin: inBand(rt?.grossProfitMarginTTM, -1, 1),   // >1 or <-1 impossible -> NULL
    gross_margin_stdev,
    gross_margin_years,
    operating_income: incA.length ? num(incA[0].operatingIncome) : null,
    fcf: cfA.length ? num(cfA[0].freeCashFlow) : null,                 // latest annual reported
    net_income: incA.length ? num(incA[0].netIncome) : null,          // latest annual reported
    fcf_conversion,
    net_debt_ebitda,
    net_cash,                // true = netDebt<0 (passes leverage gate on merit)
    nulled_ratios,           // how many of the 4 guarded ratios were NULLed for this row
    shares_cagr_3y,
    revenue_cagr_3y,

    price,
    high_52w,
    drawdown_pct,

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
