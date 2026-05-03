// The 5 sample holdings, exactly as the brief defines them in DTerminal.jsx
export const SAMPLE_PORTFOLIO = {
  rows: [
    { ticker: 'AAPL', shares: 120, price: 223.19, costBasis: 17280.00, change: -1.23 },
    { ticker: 'NVDA', shares: 380, price: 177.39, costBasis: 31920.00, change:  0.93 },
    { ticker: 'TSLA', shares:  60, price: 247.07, costBasis: 19200.00, change: -5.41 },
    { ticker: 'AMZN', shares: 140, price: 209.77, costBasis: 22260.00, change: -0.38 },
    { ticker: 'MSFT', shares:  90, price: 415.50, costBasis: 31050.00, change:  0.82 },
  ],
  cash: 8460.00,  // €8,000 + $460 — mirrors Jonathan's actual cash position
};

// Derived computations — call this once, memoize at component level
export function computeSampleStats() {
  const rows = SAMPLE_PORTFOLIO.rows.map(r => {
    const mktValue = r.shares * r.price;
    const pl = mktValue - r.costBasis;
    const plPct = (pl / r.costBasis) * 100;
    return { ...r, mktValue, pl, plPct };
  });
  const total = rows.reduce((s, r) => s + r.mktValue, 0) + SAMPLE_PORTFOLIO.cash;
  const totalCost = rows.reduce((s, r) => s + r.costBasis, 0);
  const totalPL = rows.reduce((s, r) => s + r.pl, 0);
  const dayPL = rows.reduce((s, r) => s + (r.mktValue * r.change / 100), 0);
  const biggestMover = [...rows].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  const biggestLoser = [...rows].sort((a, b) => a.pl - b.pl)[0];
  const biggestWinner = [...rows].sort((a, b) => b.pl - a.pl)[0];
  return { rows, total, totalCost, totalPL, dayPL, biggestMover, biggestLoser, biggestWinner };
}

// Stock Intel data — keyed by ticker, used by DTStockIntelStatic
export const SAMPLE_STOCK_INTEL = {
  AAPL: { rating: 6.2, thesis: "Quality moat at premium price. Services growth offsets hardware plateau, but China and regulatory drag are real overhangs.", pe: 33.4, mcap: '3.4T', shortFloat: '0.6%', earnDate: 'Jul 25', dy: '0.43%', beta: 1.21 },
  NVDA: { rating: 7.1, thesis: "AI infra leader with 92% data-center share. Valuation is the bear case — at 38× forward, perfection is priced in through 2027.", pe: 42.1, mcap: '4.3T', shortFloat: '1.0%', earnDate: 'May 28', dy: '0.02%', beta: 1.72 },
  TSLA: { rating: 4.3, thesis: "Auto unit decelerating, FSD optionality is the only multiple support. Delivery miss + margin compression = re-rating risk.", pe: 64.7, mcap: '0.8T', shortFloat: '3.1%', earnDate: 'Jul 23', dy: '—', beta: 2.42 },
  AMZN: { rating: 6.8, thesis: "AWS growth recovering from optimization cycle. Retail margin inflection real but slow. Ad business is the unsung compounder.", pe: 38.9, mcap: '2.2T', shortFloat: '0.7%', earnDate: 'Aug 01', dy: '—', beta: 1.34 },
  MSFT: { rating: 7.4, thesis: "Cleanest AI monetization story — Copilot attach + Azure inference. Premium multiple earned, but priced for flawless execution.", pe: 35.0, mcap: '3.1T', shortFloat: '0.5%', earnDate: 'Jul 30', dy: '0.71%', beta: 0.92 },
};

// AI Summary content — placeholder rating 5.5, sections rendered by DTAISummary.
// Will be wired to <PortfolioAISummary initialSummary={SAMPLE_AI_SUMMARY} /> later in Phase 3.
export const SAMPLE_AI_SUMMARY = {
  // Fields read by the existing <PortfolioAISummary /> component
  rating: 5.5,
  rating_summary: "Solid mega-cap exposure but tech-concentrated. NVDA and MSFT carry the book — diversification is shallow once you look past sector labels.",
  overview:         "5 holdings above cost. NVDA + MSFT together = ~52% of equity exposure.",
  whats_working:    "NVDA on data-center capex; MSFT compounding cleanly with cloud + AI attach. AAPL holding margin discipline through hardware cycle.",
  whats_dragging:   "TSLA -5.4% today on delivery miss; AMZN flat as AWS growth decelerates relative to peers.",
  biggest_risk:     "Tech concentration. All 5 positions are mega-cap tech — a single sector rotation hits 100% of equities at once.",
  suggested_action: "Trim NVDA by 15–20% to reduce single-name concentration; rotate proceeds into a non-correlated sleeve before next CPI print.",
};

// Top-stat overlay copy used by the 7-cell summary strip.
// Static decorative — not derived from holdings. Used by DTSummaryStrip.
export const SAMPLE_TOP_STATS = {
  nextEarnings:    { ticker: 'NVDA', when: 'May 28 · 5 days' },
  analystTargets:  { upsidePct: 12.4, sub: 'Avg upside · 5 stocks' },
  insiderActivity: { state: 'NET SELL', sub: '3 of 5 · last 30d' },
  mostShorted:     { ticker: 'TSLA', floatPct: '3.1%', sub: 'Float · in your book' },
  marketPulse:     { vix: 21.4, sub: 'Above 20 · risk-off' },
  topNews:         "NVDA Blackwell ramp ahead of schedule — Reuters",
};
