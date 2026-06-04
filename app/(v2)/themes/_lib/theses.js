// Fixed thesis set for /themes (Theme Research). The classifier scores each
// holding against these four theses. Bump THESIS_VERSION whenever the thesis
// text or set changes so cached classifications can be invalidated.

export const THESIS_VERSION = 'v1-2026-06-04';

export const DEFAULT_WORLDVIEW = "Fiscal dominance and currency debasement long-term, with simultaneous AI-driven deflation in certain sectors — together producing an even stronger K-shaped economy.";

export const THESES = [
  { id: 'debasement', name: 'Debasement', validity: 'INTACT', view: "Deficits compound and real rates stay pinned below inflation; hard assets and scarcity win." },
  { id: 'strong-ai', name: 'Strong AI', validity: 'INTACT', view: "The AI buildout is real and compounding — compute and power lead, and it is deflationary in the sectors it touches." },
  { id: 'k-shaped', name: 'K-Shaped Economy', validity: 'INTACT', view: "The top decile spends through anything; the bottom half is in a rolling recession. Both ends win, the middle loses." },
  { id: 'instability', name: 'Instability & Rearmament', validity: 'INTACT', view: "A more unstable world rearms — defense, energy security and cyber carry a structural bid, and the bill feeds the debasement." },
];

// Calibration examples for the classifier are added in the next stage — none here.
