// Demo data for signed-out visitors to /themes. Mirrors the dashboard's
// real-??-mock convention: the page renders these when there is no signed-in
// portfolio. Verdicts per thesis use the fixed set: Benefits | Hurt | Neutral | Mixed.

import { DEFAULT_WORLDVIEW } from './theses';

export const MOCK_WORLDVIEW = DEFAULT_WORLDVIEW;

// Six illustrative holdings. weightPct sums to 100. verdicts keyed by thesis id.
export const MOCK_ROWS = [
  {
    ticker: 'NVDA',
    weightPct: 30,
    verdicts: {
      'debasement':  { verdict: 'Neutral',  rationale: "A cash-generative compounder, but not a direct hard-asset hedge against debasement." },
      'strong-ai':   { verdict: 'Benefits', rationale: "The core compute supplier to the AI buildout; demand scales with capex." },
      'k-shaped':    { verdict: 'Benefits', rationale: "Funded by deep-pocketed hyperscalers on the upper rung; insulated from the squeezed middle." },
      'instability': { verdict: 'Mixed',    rationale: "Sovereign-AI and defense demand help, but Taiwan concentration is a rearmament-era supply risk." },
    },
  },
  {
    ticker: 'WMT',
    weightPct: 20,
    verdicts: {
      'debasement':  { verdict: 'Benefits', rationale: "Trade-down demand and scale pricing power let it pass through a debasing dollar." },
      'strong-ai':   { verdict: 'Neutral',  rationale: "Adopts AI for logistics efficiency but isn't a primary beneficiary of the buildout." },
      'k-shaped':    { verdict: 'Benefits', rationale: "Captures the trading-down bottom half while holding the convenience-seeking top." },
      'instability': { verdict: 'Neutral',  rationale: "Domestic staples demand is steady but not a rearmament play." },
    },
  },
  {
    ticker: 'TOL',
    weightPct: 12,
    verdicts: {
      'debasement':  { verdict: 'Mixed',    rationale: "Real-asset inventory benefits, but higher-for-longer financing costs cut the other way." },
      'strong-ai':   { verdict: 'Neutral',  rationale: "Little direct exposure to the AI capex cycle." },
      'k-shaped':    { verdict: 'Benefits', rationale: "Luxury buyers on the top rung keep paying cash; insulated from the squeezed middle." },
      'instability': { verdict: 'Neutral',  rationale: "Domestic housing is largely insulated from geopolitical rearmament." },
    },
  },
  {
    ticker: 'GLD',
    weightPct: 18,
    verdicts: {
      'debasement':  { verdict: 'Benefits', rationale: "The cleanest expression of currency debasement — a scarce, non-sovereign store of value." },
      'strong-ai':   { verdict: 'Neutral',  rationale: "Untouched by the AI buildout; neither helped nor hurt directly." },
      'k-shaped':    { verdict: 'Neutral',  rationale: "A macro hedge, not a consumer-tier play." },
      'instability': { verdict: 'Benefits', rationale: "Safe-haven bid rises with geopolitical instability." },
    },
  },
  {
    ticker: 'NKE',
    weightPct: 8,
    verdicts: {
      'debasement':  { verdict: 'Hurt',    rationale: "Input and FX costs rise faster than it can reprice aspirational goods." },
      'strong-ai':   { verdict: 'Neutral', rationale: "Marginal AI efficiency gains; not a buildout beneficiary." },
      'k-shaped':    { verdict: 'Hurt',    rationale: "Exposed to the squeezed middle that is cutting discretionary spend." },
      'instability': { verdict: 'Hurt',    rationale: "Global supply chains and China exposure suffer as the world fragments." },
    },
  },
  {
    ticker: 'AXP',
    weightPct: 12,
    verdicts: {
      'debasement':  { verdict: 'Neutral',  rationale: "Spending-linked fees track nominal growth but offer no scarcity hedge." },
      'strong-ai':   { verdict: 'Neutral',  rationale: "AI trims servicing costs but isn't core to the thesis." },
      'k-shaped':    { verdict: 'Benefits', rationale: "Affluent cardholders on the top rung keep spending through any downturn." },
      'instability': { verdict: 'Neutral',  rationale: "Travel and entertainment spend is more cycle- than conflict-driven." },
    },
  },
];

// Per-thesis exposure as a share of portfolio weight, consistent with MOCK_ROWS.
// Mixed verdicts split their weight 50/50 between benefits and hurt. Each thesis sums to 100.
export const MOCK_EXPOSURE = {
  'debasement':  { benefitsPct: 44, hurtPct: 14, neutralPct: 42 },
  'strong-ai':   { benefitsPct: 30, hurtPct: 0,  neutralPct: 70 },
  'k-shaped':    { benefitsPct: 74, hurtPct: 8,  neutralPct: 18 },
  'instability': { benefitsPct: 33, hurtPct: 23, neutralPct: 44 },
};
