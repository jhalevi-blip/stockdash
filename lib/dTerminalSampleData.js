export const SAMPLE_STATS = {
  totalValue:        398594.70,
  dayPnl:            3672.40,
  dayPnlPct:         0.93,
  totalReturn:       71594.70,
  totalReturnPct:    21.9,
  holdingsCount:     5,
  claudeRating:      6.8,
  claudeRatingLabel: 'Constructive',
  asOf:              'Nov 14, 2025 — 4:00 PM ET',
};

export const SAMPLE_HOLDINGS = [
  { ticker: 'AAPL', name: 'Apple Inc.',   shares: 200, cost: 158.20, price:  232.10, dayPct:  0.41, totalPnl:  14780, weight: 11.6, rating: 6.2 },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', shares: 180, cost: 412.50, price: 1184.30, dayPct:  2.18, totalPnl: 138924, weight: 25.0, rating: 7.1 },
  { ticker: 'TSLA', name: 'Tesla Inc.',   shares:  80, cost: 241.10, price:  312.40, dayPct: -3.13, totalPnl:   5704, weight:  6.3, rating: 4.3 },
  { ticker: 'AMZN', name: 'Amazon.com',   shares: 120, cost: 148.60, price:  214.80, dayPct:  0.74, totalPnl:   7944, weight: 35.1, rating: 6.8 },
  { ticker: 'MSFT', name: 'Microsoft',    shares: 110, cost: 312.40, price:  447.20, dayPct:  1.02, totalPnl:  14808, weight: 22.0, rating: 7.4 },
];

export const SAMPLE_AI_SUMMARY = {
  // Fields consumed by <PortfolioAISummary initialSummary={...} /> today
  rating:           6.8,
  rating_summary:   'CONSTRUCTIVE',
  overview:         'Five mega-caps, $398K total. NVDA + MSFT = 47% of the book. The portfolio is up 21.9% YTD vs SPY +18.4% — alpha is real but mostly from one position.',
  whats_working:    "NVDA leadership in AI infra, MSFT's Copilot monetization, AMZN's AWS reacceleration. Three of five names sit on Claude ratings ≥ 6.8.",
  whats_dragging:   'TSLA at 4.3 — auto deceleration plus a 64× P/E with no margin support. AAPL is fine but range-bound on China + regulatory drag.',
  biggest_risk:     'Concentration. A 25% AI multiple compression hits 47% of the book directly. SPY would be down ~10% in the same scenario; this portfolio would be down ~17%.',
  suggested_action: "Trim NVDA on next +5% leg or add a defensive sleeve (XLP/XLV) to bring AI exposure under 35%. Don't touch MSFT — best risk/reward in the book.",

  // Phase 3 — not currently rendered
  label:       'CONSTRUCTIVE',
  thesis:      'Quality-tilted mega-cap blend with concentrated AI exposure. The thesis works if NVDA and MSFT compound; the risk is correlated drawdown if AI multiples compress.',
  generatedBy: 'Claude Opus 4.7 · 2m ago',
  sections: [
    { glyph: '📊', label: 'OVERVIEW',        body: 'Five mega-caps, $398K total. NVDA + MSFT = 47% of the book. The portfolio is up 21.9% YTD vs SPY +18.4% — alpha is real but mostly from one position.' },
    { glyph: '✅', label: "WHAT'S WORKING",   body: "NVDA leadership in AI infra, MSFT's Copilot monetization, AMZN's AWS reacceleration. Three of five names sit on Claude ratings ≥ 6.8." },
    { glyph: '⚠️', label: "WHAT'S DRAGGING", body: 'TSLA at 4.3 — auto deceleration plus a 64× P/E with no margin support. AAPL is fine but range-bound on China + regulatory drag.' },
    { glyph: '🎯', label: 'BIGGEST RISK',     body: 'Concentration. A 25% AI multiple compression hits 47% of the book directly. SPY would be down ~10% in the same scenario; this portfolio would be down ~17%.' },
    { glyph: '💡', label: 'SUGGESTED ACTION', body: "Trim NVDA on next +5% leg or add a defensive sleeve (XLP/XLV) to bring AI exposure under 35%. Don't touch MSFT — best risk/reward in the book." },
  ],
};

export const SAMPLE_STOCK_INTEL = {
  AAPL: {
    rating:       6.2,
    summary:      'Quality moat at premium price. Services growth offsets hardware plateau, but China and regulatory drag are real overhangs.',
    peRatio:      33.4,
    marketCap:    '3.4T',
    shortFloat:   0.6,
    nextEarnings: 'Jul 25',
    divYield:     0.43,
  },
  NVDA: {
    rating:       7.1,
    summary:      'AI infra leader with 92% data-center share. Valuation is the bear case — at 38× forward, perfection is priced in through 2027.',
    peRatio:      42.1,
    marketCap:    '4.3T',
    shortFloat:   1.0,
    nextEarnings: 'May 28',
    divYield:     0.02,
  },
  TSLA: {
    rating:       4.3,
    summary:      'Auto unit decelerating, FSD optionality is the only multiple support. Delivery miss + margin compression = re-rating risk.',
    peRatio:      64.7,
    marketCap:    '0.8T',
    shortFloat:   3.1,
    nextEarnings: 'Jul 23',
    divYield:     null,
  },
  AMZN: {
    rating:       6.8,
    summary:      'AWS growth recovering from optimization cycle. Retail margin inflection real but slow. Ad business is the unsung compounder.',
    peRatio:      38.9,
    marketCap:    '2.2T',
    shortFloat:   0.7,
    nextEarnings: 'Aug 01',
    divYield:     null,
  },
  MSFT: {
    rating:       7.4,
    summary:      'Cleanest AI monetization story — Copilot attach + Azure inference. Premium multiple earned, but priced for flawless execution.',
    peRatio:      35.0,
    marketCap:    '3.1T',
    shortFloat:   0.5,
    nextEarnings: 'Jul 30',
    divYield:     0.71,
  },
};
