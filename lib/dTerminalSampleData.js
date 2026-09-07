// Sample portfolio powering the landing-page dashboard mock.
//
// EUR-denominated on purpose: a Dutch DEGIRO/Saxo book that mixes euro-listed
// names (ASML, Shell, Adyen, ASM International) with USD-listed names
// (NVDA, MSFT), so the "historical FX handled" pitch is visible in the mock —
// the two USD holdings carry ccy:'USD' and their euro cost basis already
// reflects the exchange rate at purchase.
//
// HARD RULE: nothing in this file may contain a hardcoded calendar date.
// Earnings dates and any "in N days" copy are derived from the current date
// at render via the helpers below, so the demo can never go stale again.

// ccy = native listing currency. Drives the small "USD" tag in the holdings
// table and the FX note in the AI summary. Prices and cost bases are in EUR
// (what the investor sees in a euro-denominated broker account).
export const SAMPLE_PORTFOLIO = {
  // costBasis = shares × average entry price. Entries are picked within each
  // name's recent trading range (below the current price, except Adyen bought
  // near its highs) so the book lands at a believable ~+9% — not a fantasy
  // return that a Dutch investor who knows these names would spot instantly.
  rows: [
    { ticker: 'ASML',  ccy: 'EUR', shares:  12, price:  985.00, costBasis: 10440.00, change:  1.15 }, // entry ~€870
    { ticker: 'SHELL', ccy: 'EUR', shares: 300, price:   32.40, costBasis:  8700.00, change: -0.42 }, // entry ~€29.00
    { ticker: 'ADYEN', ccy: 'EUR', shares:   6, price: 1662.00, costBasis: 10620.00, change:  2.05 }, // entry ~€1,770 (loser)
    { ticker: 'ASMI',  ccy: 'EUR', shares:  15, price:  565.00, costBasis:  7500.00, change:  1.60 }, // entry ~€500
    { ticker: 'NVDA',  ccy: 'USD', shares:  40, price:  163.20, costBasis:  5400.00, change:  0.93 }, // entry ~€135
    { ticker: 'MSFT',  ccy: 'USD', shares:  20, price:  386.50, costBasis:  6900.00, change:  0.55 }, // entry ~€345
  ],
  cash: 3250.00, // EUR
};

// Benchmark the book against MSCI World (not the S&P 500) — the natural
// yardstick for a euro investor. dailyPct drives the "vs MSCI World" mid-card.
export const SAMPLE_BENCHMARK = { name: 'MSCI World', dailyPct: 0.28 };

// ── Date helpers — everything relative to "today" at render, never hardcoded ──
function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

// e.g. "12 Sep"
export function fmtDayMonth(date) {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

// e.g. "today" | "tomorrow" | "in 5 days"
export function relDays(n) {
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

// Given an offset in days from today, return { date, rel } for earnings labels.
export function earnLabel(offsetDays, base = new Date()) {
  return { date: fmtDayMonth(addDays(base, offsetDays)), rel: relDays(offsetDays) };
}

// Derived computations — call this once, memoize at component level.
export function computeSampleStats() {
  const priced = SAMPLE_PORTFOLIO.rows.map(r => {
    const mktValue = r.shares * r.price;
    const pl = mktValue - r.costBasis;
    const plPct = (pl / r.costBasis) * 100;
    return { ...r, mktValue, pl, plPct };
  });
  const equity = priced.reduce((s, r) => s + r.mktValue, 0);
  const rows = priced.map(r => ({
    ...r,
    // Weight is share of equity (ex-cash) so the column sums to ~100%.
    weight: ((r.mktValue / equity) * 100).toFixed(1) + '%',
    rating: (SAMPLE_STOCK_INTEL[r.ticker]?.rating ?? 0).toFixed(1),
  }));
  const total = equity + SAMPLE_PORTFOLIO.cash;
  const totalCost = rows.reduce((s, r) => s + r.costBasis, 0);
  const totalPL = rows.reduce((s, r) => s + r.pl, 0);
  const dayPL = rows.reduce((s, r) => s + (r.mktValue * r.change / 100), 0);
  const biggestMover = [...rows].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  const biggestLoser = [...rows].sort((a, b) => a.pl - b.pl)[0];
  const biggestWinner = [...rows].sort((a, b) => b.pl - a.pl)[0];
  return { rows, total, totalCost, totalPL, dayPL, biggestMover, biggestLoser, biggestWinner };
}

// Stock Intel data — keyed by ticker. earnOffsetDays is an integer offset from
// "today"; the actual date label is computed at render via earnLabel().
export const SAMPLE_STOCK_INTEL = {
  ASML:  { rating: 7.6, thesis: "The only supplier of EUV lithography — a genuine monopoly on the tooling every leading-edge fab depends on. Cyclical order book, but the AI capex wave underwrites demand well into the decade.", pe: 34.2, mcap: '€385B', shortFloat: '0.8%', earnOffsetDays: 12, dy: '0.9%', beta: 1.28 },
  SHELL: { rating: 6.4, thesis: "Cash-generative integrated major trading at a discount to US peers. Buybacks and a covered dividend support the floor; the bear case is terminal-demand and transition capex discipline.", pe: 11.3, mcap: '€195B', shortFloat: '0.5%', earnOffsetDays: 33, dy: '3.9%', beta: 0.71 },
  ADYEN: { rating: 5.7, thesis: "High-quality single-platform payments processor still recovering from the 2023 growth-and-margin scare. Re-acceleration is real but the multiple leaves little room for a miss.", pe: 41.5, mcap: '€52B',  shortFloat: '2.1%', earnOffsetDays: 26, dy: '—',    beta: 1.66 },
  ASMI:  { rating: 7.1, thesis: "ALD deposition leader levered to the same gate-all-around transition as the foundries. Smaller and more volatile than ASML, but structurally advantaged on advanced-node intensity.", pe: 29.8, mcap: '€28B',  shortFloat: '1.2%', earnOffsetDays: 8,  dy: '0.7%', beta: 1.44 },
  NVDA:  { rating: 7.1, thesis: "AI infrastructure leader with ~92% data-centre share. Valuation is the bear case — at 38x forward, perfection is priced in through 2027. USD-listed: your euro return also carries FX.", pe: 42.1, mcap: '€3.9T', shortFloat: '1.0%', earnOffsetDays: 5,  dy: '0.02%', beta: 1.72 },
  MSFT:  { rating: 7.4, thesis: "Cleanest AI monetisation story — Copilot attach plus Azure inference. Premium multiple earned, but priced for flawless execution. USD-listed: euro return reflects EUR/USD moves.", pe: 35.0, mcap: '€2.9T', shortFloat: '0.5%', earnOffsetDays: 19, dy: '0.71%', beta: 0.92 },
};

// AI Summary content — placeholder, sections rendered by DTAISummary.
export const SAMPLE_AI_SUMMARY = {
  rating: 6.1,
  rating_summary: "A well-built EUR core — quality European compounders plus two US mega-caps — but heavily tilted to semiconductors once you look through the country labels.",
  overview:         "6 holdings, all above cost except Adyen. ASML + ASMI + NVDA together are ~half of equity — this is a semis book with a euro wrapper.",
  whats_working:    "ASML and ASM International riding the EUV / AI-capex cycle; NVDA compounding on data-centre demand. Shell adds cash-generative, low-beta ballast.",
  whats_dragging:   "Adyen still ~6% below your entry after the 2023 de-rating. Shell soft today on weaker crude.",
  biggest_risk:     "Semiconductor concentration. A single capex-cycle turn hits ASML, ASMI and NVDA at once — nearly half the book.",
  suggested_action: "Trim one of ASML/ASMI to cut the semis overlap. Note NVDA + MSFT are USD-denominated: your euro return already reflects historical EUR/USD moves, not just the share price.",
};

// Top-stat overlay copy for the 7-cell summary strip. Computed (not a frozen
// constant) so the "next earnings" tile counts down from today — earnings dates
// are derived, everything else here is static decorative copy.
export function computeSampleTopStats(base = new Date()) {
  const soonest = Object.entries(SAMPLE_STOCK_INTEL)
    .map(([ticker, v]) => ({ ticker, offset: v.earnOffsetDays }))
    .filter(e => Number.isFinite(e.offset) && e.offset >= 0)
    .sort((a, b) => a.offset - b.offset)[0];
  const e = earnLabel(soonest.offset, base);

  return {
    nextEarnings:    { ticker: soonest.ticker, when: `${e.date} · ${e.rel}` },
    analystTargets:  { upsidePct: 11.8, sub: 'Avg upside · 6 stocks' },
    insiderActivity: { state: 'NET SELL', sub: '4 of 6 · last 30d' },
    mostShorted:     { ticker: 'ADYEN', floatPct: '2.1%', sub: 'Float · in your book' },
    marketPulse:     { vix: 18.6, sub: 'Below 20 · risk-on' },
    topNews:         "ASML lifts 2030 sales outlook on AI-driven EUV demand — Reuters",
  };
}
