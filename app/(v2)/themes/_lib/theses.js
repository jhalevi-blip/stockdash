// Fixed thesis set for /themes (Theme Research).
//
// MIGRATION STATUS (dynamic themes, Gate 4a): the backend routes now read per-user
// themes from user_themes (see lib/userThemes.js). What remains here:
//   • DEFAULT_WORLDVIEW — ACTIVE: worldview fallback used across routes + pages, and
//     the source of the seeded default worldview.
//   • VERDICTS          — ACTIVE: the verdict enum, still shared by all routes.
//   • THESES            — LEGACY: only page.jsx + mockData.js still import it; the
//     four entries are mirrored into the seeded defaults in lib/userThemes.js.
//     Removed when the UI moves to per-user themes (Gate 4b).
//   • CALIBRATION       — LEGACY: used by theme-classify ONLY for the pristine
//     default set (isPristineDefaultSet); keyed by the default theme ids.
//   • THESIS_VERSION    — LEGACY/DEAD: superseded by per-theme version and the
//     active-set fingerprint (activeThemeFingerprint). No remaining importers.

export const THESIS_VERSION = 'v1-2026-06-04';

export const DEFAULT_WORLDVIEW = "Fiscal dominance and currency debasement long-term, with simultaneous AI-driven deflation in certain sectors — together producing an even stronger K-shaped economy.";

export const THESES = [
  { id: 'debasement', name: 'Debasement', validity: 'INTACT', view: "Deficits compound and real rates stay pinned below inflation; hard assets and scarcity win." },
  { id: 'strong-ai', name: 'Strong AI', validity: 'INTACT', view: "The AI buildout is real and compounding — compute and power lead, and it is deflationary in the sectors it touches." },
  { id: 'k-shaped', name: 'K-Shaped Economy', validity: 'INTACT', view: "The top decile spends through anything; the bottom half is in a rolling recession. Both ends win, the middle loses." },
  { id: 'instability', name: 'Instability & Rearmament', validity: 'INTACT', view: "A more unstable world rearms — defense, energy security and cyber carry a structural bid, and the bill feeds the debasement." },
];

export const VERDICTS = ['Benefits', 'Hurt', 'Neutral', 'Mixed'];

export const CALIBRATION = {
  AMD:  { debasement: { verdict: 'Benefits', rationale: 'Nominal asset with pricing power.' }, 'strong-ai': { verdict: 'Benefits', rationale: 'Core compute supplier to the buildout.' }, 'k-shaped': { verdict: 'Mixed', rationale: 'Enterprise demand strong; consumer/PC silicon leans on the squeezed half.' }, instability: { verdict: 'Mixed', rationale: 'Sovereign-AI tailwind versus Taiwan supply dependence.' } },
  AMZN: { debasement: { verdict: 'Benefits', rationale: 'Pricing power and real infrastructure.' }, 'strong-ai': { verdict: 'Benefits', rationale: 'AWS and robotics — consumes its own deflation.' }, 'k-shaped': { verdict: 'Benefits', rationale: 'Value plus convenience captures both ends of the K.' }, instability: { verdict: 'Neutral', rationale: 'No dominant exposure either way.' } },
  SOFI: { debasement: { verdict: 'Mixed', rationale: 'Suppressed rates mean cheap funding and nominal credit growth; borrowers sit on the squeezed side.' }, 'strong-ai': { verdict: 'Neutral', rationale: 'No dominant exposure.' }, 'k-shaped': { verdict: 'Mixed', rationale: 'Growth lender whose borrower base skews toward the squeezed half.' }, instability: { verdict: 'Neutral', rationale: 'No dominant exposure.' } },
  CELH: { debasement: { verdict: 'Neutral', rationale: 'No dominant exposure.' }, 'strong-ai': { verdict: 'Neutral', rationale: 'No dominant exposure.' }, 'k-shaped': { verdict: 'Neutral', rationale: 'Mass-fitness positioning, not cleanly on either arm.' }, instability: { verdict: 'Neutral', rationale: 'No dominant exposure.' } },
  OXY:  { debasement: { verdict: 'Benefits', rationale: 'Hard asset — the closest held debasement hedge.' }, 'strong-ai': { verdict: 'Neutral', rationale: 'No dominant exposure.' }, 'k-shaped': { verdict: 'Neutral', rationale: 'No dominant exposure.' }, instability: { verdict: 'Benefits', rationale: 'Energy supply carries a conflict premium.' } },
  NKE:  { debasement: { verdict: 'Neutral', rationale: 'No dominant exposure.' }, 'strong-ai': { verdict: 'Neutral', rationale: 'No dominant exposure.' }, 'k-shaped': { verdict: 'Hurt', rationale: 'Mid-premium brand squeezed from both directions.' }, instability: { verdict: 'Hurt', rationale: 'China sourcing and a global supply chain.' } },
  ELF:  { debasement: { verdict: 'Neutral', rationale: 'No dominant exposure.' }, 'strong-ai': { verdict: 'Neutral', rationale: 'No dominant exposure.' }, 'k-shaped': { verdict: 'Benefits', rationale: 'The mass-prestige dupe winner of the trade-down.' }, instability: { verdict: 'Hurt', rationale: 'Heavily China-sourced — tariff and supply-route sensitive.' } },
  ETOR: { debasement: { verdict: 'Benefits', rationale: 'Crypto-platform beta — indirect debasement exposure.' }, 'strong-ai': { verdict: 'Neutral', rationale: 'No dominant exposure.' }, 'k-shaped': { verdict: 'Neutral', rationale: 'No dominant exposure.' }, instability: { verdict: 'Neutral', rationale: 'No dominant exposure.' } },
  NNE:  { debasement: { verdict: 'Benefits', rationale: 'Energy infrastructure as a real asset.' }, 'strong-ai': { verdict: 'Benefits', rationale: 'AI power demand is the order book.' }, 'k-shaped': { verdict: 'Neutral', rationale: 'No dominant exposure.' }, instability: { verdict: 'Benefits', rationale: 'Energy security demand.' } },
  HNST: { debasement: { verdict: 'Neutral', rationale: 'No dominant exposure.' }, 'strong-ai': { verdict: 'Neutral', rationale: 'No dominant exposure.' }, 'k-shaped': { verdict: 'Hurt', rationale: 'Premium staples sold to a squeezed demographic.' }, instability: { verdict: 'Neutral', rationale: 'No dominant exposure.' } },
  PHM:  { debasement: { verdict: 'Mixed', rationale: 'Land banks are hard assets and suppressed mortgage rates reignite demand; the entry-level K-squeeze is the offset.' }, 'strong-ai': { verdict: 'Neutral', rationale: 'No dominant exposure.' }, 'k-shaped': { verdict: 'Mixed', rationale: 'Move-up demand holds; first-time buyers are the squeezed cohort.' }, instability: { verdict: 'Neutral', rationale: 'No dominant exposure.' } },
  LEN:  { debasement: { verdict: 'Mixed', rationale: 'Same land-bank and suppressed-rates logic; entry-buyer squeeze offsets.' }, 'strong-ai': { verdict: 'Neutral', rationale: 'No dominant exposure.' }, 'k-shaped': { verdict: 'Mixed', rationale: 'Entry-level exposure sits on the squeezed arm.' }, instability: { verdict: 'Neutral', rationale: 'No dominant exposure.' } },
};
