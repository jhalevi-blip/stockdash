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
  { label: 'Fear & Greed', value: '63',     change: 0,     changeAbs: 'Greed' },
];

export const HOLDINGS = [
  { ticker: 'ASML', name: 'ASML Holding NV',         shares: 80,   price: 904.21, change: 1.85,  costBasis: 312.40, mktValue: 72336.80, plDollar: 47344.00, plPct: 189.4, weight: 17.0, sector: 'Semis' },
  { ticker: 'NVDA', name: 'NVIDIA Corporation',       shares: 420,  price: 132.85, change: 2.41,  costBasis: 38.92,  mktValue: 55797.00, plDollar: 39450.10, plPct: 241.4, weight: 13.1, sector: 'Semis' },
  { ticker: 'ETOR', name: 'eToro Group',              shares: 760,  price: 64.12,  change: 0.93,  costBasis: 41.20,  mktValue: 48731.20, plDollar: 17413.20, plPct: 55.6,  weight: 11.5, sector: 'Fintech' },
  { ticker: 'AMD',  name: 'Advanced Micro Devices',   shares: 215,  price: 168.40, change: -1.71, costBasis: 92.18,  mktValue: 36206.00, plDollar: 16387.00, plPct: 82.7,  weight: 8.5,  sector: 'Semis' },
  { ticker: 'AAOI', name: 'Applied Optoelectronics',  shares: 1200, price: 28.94,  change: 4.82,  costBasis: 12.60,  mktValue: 34728.00, plDollar: 19608.00, plPct: 129.7, weight: 8.2,  sector: 'Tech' },
  { ticker: 'PHM',  name: 'PulteGroup, Inc.',         shares: 245,  price: 117.30, change: -2.06, costBasis: 96.40,  mktValue: 28738.50, plDollar: 5118.50,  plPct: 21.7,  weight: 6.8,  sector: 'Homebuilding' },
  { ticker: 'SOFI', name: 'SoFi Technologies',        shares: 2100, price: 13.21,  change: -3.22, costBasis: 12.50,  mktValue: 27741.00, plDollar: 1491.00,  plPct: 5.7,   weight: 6.5,  sector: 'Fintech' },
  { ticker: 'OXY',  name: 'Occidental Petroleum',     shares: 480,  price: 51.84,  change: -1.62, costBasis: 38.50,  mktValue: 24883.20, plDollar: 6403.20,  plPct: 34.7,  weight: 5.9,  sector: 'Energy' },
  { ticker: 'CELH', name: 'Celsius Holdings',         shares: 540,  price: 40.18,  change: 1.84,  costBasis: 28.10,  mktValue: 21697.20, plDollar: 6523.20,  plPct: 42.9,  weight: 5.1,  sector: 'Consumer' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.',          shares: 110,  price: 196.40, change: 0.92,  costBasis: 142.10, mktValue: 21604.00, plDollar: 5953.00,  plPct: 38.0,  weight: 5.1,  sector: 'Tech' },
  { ticker: 'NKE',  name: 'Nike Inc.',                shares: 320,  price: 64.85,  change: -0.61, costBasis: 73.40,  mktValue: 20752.00, plDollar: -2736.00, plPct: -11.6, weight: 4.9,  sector: 'Consumer' },
];

export const TICKER_SPARKS = {
  ASML: [820, 815, 832, 845, 838, 850, 862, 858, 870, 882, 878, 890, 895, 904],
  NVDA: [118, 120, 122, 119, 124, 127, 125, 128, 130, 128, 131, 130, 132, 132.85],
  AMD:  [180, 178, 175, 172, 174, 170, 168, 171, 169, 172, 170, 169, 170, 168.40],
  AAOI: [22, 23, 22, 24, 23, 25, 25, 26, 27, 26, 27, 28, 28, 28.94],
  OXY:  [55, 54, 55, 53, 54, 53, 52, 53, 52, 52, 53, 52, 52, 51.84],
  ETOR: [60, 61, 62, 60, 62, 63, 63, 64, 63, 64, 64, 63, 64, 64.12],
  SOFI: [14, 14, 14, 14, 13, 14, 13, 13, 13, 13, 14, 13, 13, 13.21],
  PHM:  [122, 121, 120, 119, 121, 120, 119, 118, 119, 118, 118, 117, 118, 117.30],
  AMZN: [192, 193, 194, 193, 195, 194, 196, 195, 197, 196, 196, 197, 196, 196.40],
  NKE:  [68, 67, 66, 67, 66, 66, 65, 66, 65, 65, 65, 65, 65, 64.85],
  CELH: [37, 38, 38, 39, 39, 40, 39, 40, 41, 40, 40, 40, 40, 40.18],
};

export const TOP_MOVERS_UP = [
  { ticker: 'AAOI', change: 4.82, last: 28.94 },
  { ticker: 'NVDA', change: 2.41, last: 132.85 },
  { ticker: 'ASML', change: 1.85, last: 904.21 },
  { ticker: 'CELH', change: 1.84, last: 40.18 },
];

export const TOP_MOVERS_DOWN = [
  { ticker: 'SOFI', change: -3.22, last: 13.21 },
  { ticker: 'PHM',  change: -2.06, last: 117.30 },
  { ticker: 'AMD',  change: -1.71, last: 168.40 },
  { ticker: 'OXY',  change: -1.62, last: 51.84 },
];

export const ALLOCATION = [
  { sector: 'Semiconductors', pct: 38.6, color: '#58a6ff' },
  { sector: 'Fintech',        pct: 18.0, color: '#22d3ee' },
  { sector: 'Tech',           pct: 13.3, color: '#3b82f6' },
  { sector: 'Homebuilding',   pct: 6.8,  color: '#c49a1a' },
  { sector: 'Energy',         pct: 5.9,  color: '#d97706' },
  { sector: 'Consumer',       pct: 10.0, color: '#3fb950' },
  { sector: 'Cash',           pct: 7.4,  color: '#6e7681' },
];

export const AI_SUMMARY = {
  rating: 7.2,
  rating_summary: "Concentrated tech exposure with strong winners but no defensive offset. Risk is heavily skewed to a single semiconductor cycle.",
  overview: "11 positions, +134% above cost basis. ASML, NVDA, and ETOR together represent ~42% of market value — and the three semis (ASML, NVDA, AMD) make up ~39% of the book.",
  whats_working: "ASML (+189%) and NVDA (+241%) are dominant winners riding semi capex and AI infra spend. AAOI and CELH also outperformed on optical-networking and beverage tailwinds.",
  whats_dragging: "NKE at -11.6% is the only red position. SOFI lagged the broader market with only +5.7% over the holding period despite its fintech weighting.",
  biggest_risk: "Hidden correlation. ASML, NVDA, and AMD all depend on the same semiconductor cycle. A single industry downturn would hit ~39% of the book at once. PHM adds rate-cycle exposure on top.",
  suggested_action: "Trim ASML by 25–30% to reduce single-name concentration and rotate proceeds into a non-correlated defensive — utilities or consumer staples — to offset the implicit semi beta.",
  language: 'en',
  portfolio_shape: {
    headline: "Three semis carry the book; the rest is fintech with a defensive gap",
    primary_clusters: [
      {
        label: "Semiconductor capex + AI infrastructure",
        confidence: "data_verified",
        concentration_pct: 38.6,
        positions: ["ASML", "NVDA", "AMD"],
        explanation: "Three positions tied to the same end-market: chip equipment, GPU silicon, and CPU/accelerator silicon. They will rise together on AI capex tailwinds and fall together on a semi cycle correction. Treat as one bet, not three."
      },
      {
        label: "Consumer fintech",
        confidence: "data_verified",
        concentration_pct: 18.0,
        positions: ["ETOR", "SOFI"],
        explanation: "Both depend on retail trading volume and consumer credit appetite. Rate-cut cycle helps both; recession hurts both."
      }
    ],
    honorable_mentions: [
      {
        label: "Tech mega-cap satellites",
        positions: ["AMZN", "AAOI"],
        note: "Adjacent to the semi thesis but with their own demand drivers (cloud, optical networking)."
      }
    ],
    blind_spots: [
      "No defensive sleeve — utilities, consumer staples, or healthcare are absent.",
      "No international diversification beyond ASML (Netherlands).",
      "No fixed income or cash-equivalent allocation beyond the small idle cash position."
    ]
  }
};
