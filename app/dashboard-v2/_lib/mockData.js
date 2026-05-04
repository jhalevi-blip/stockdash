// Mock data for v2 dashboard. Replaced by real API data in a later phase.
// Numbers are illustrative — they match the design prototype.

export const PORTFOLIO = {
  totalValue: 425249.39,
  totalCost: 181842.11,
  unrealized: 243407.28,
  unrealizedPct: 133.85,
  dayChange: 4726.67,
  dayChangePct: 1.12,
  cash: 12830.50,
  positions: 11,
  asOf: 'May 4, 2026 · 4:00 PM ET',
};

// Last 30 days of total portfolio value, for the hero sparkline.
export const PORTFOLIO_SPARK = [
  402100, 401200, 405400, 407800, 406300, 410200, 412500, 411800, 413900, 416100,
  415200, 418600, 420100, 419800, 417300, 421900, 423400, 422100, 424800, 426300,
  425100, 423700, 422900, 425600, 427200, 426400, 424100, 422800, 423900, 425249.39,
];

export const MACRO = [
  { label: 'S&P 500',   value: '5,824.16',  change: +0.82, changeAbs: '+47.21' },
  { label: 'Nasdaq',    value: '18,512.74', change: +1.14, changeAbs: '+208.93' },
  { label: 'Dow',       value: '42,310.55', change: +0.31, changeAbs: '+131.04' },
  { label: 'VIX',       value: '14.82',     change: -2.15, changeAbs: '-0.33' },
  { label: '10Y Yield', value: '4.21%',     change: -0.04, changeAbs: '-4 bp' },
  { label: 'Bitcoin',   value: '$72,140',   change: +2.68, changeAbs: '+$1,884' },
];
