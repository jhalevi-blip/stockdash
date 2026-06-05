// Tracker configuration for the /themes temperature engine. Pure data — no fetch,
// no math. Each thesis maps to one or more "trackers": either a single-symbol read
// or a ratio of two equal-weight baskets (numerator over denominator).
//
// Tracker shapes:
//   { id, label, single: 'SYM' }                  — one symbol
//   { id, label, num: ['A','B'], den: ['C'] }     — basket ratio (winners / victims)
//
// Bump ENGINE_VERSION whenever the tracker set or the temperature math changes, so
// cached snapshots in theme_temperatures invalidate. Keep thesis ids aligned with
// _lib/theses.js.

export const ENGINE_VERSION = 'temp-v3-2026-06-05';
export const HISTORY_YEARS = 2;

// Symbols we'll quietly drop from a basket (with a note) if the feed lacks them,
// rather than erroring the whole tracker. e.g. the OTC ADR LVMUY.
export const OPTIONAL_SYMBOLS = ['LVMUY'];

// Trackers grouped by thesis id. For k-shaped, the per-tracker results render as the
// per-sector chips.
export const TRACKERS_BY_THESIS = {
  debasement: [
    { id: 'gld',     label: 'Gold (GLD)',                single: 'GLD' },
    { id: 'tip-ief', label: 'Real-rate proxy (TIP/IEF)', num: ['TIP'], den: ['IEF'] },
  ],
  'strong-ai': [
    { id: 'smh-spy',  label: 'Semis vs market (SMH/SPY)', num: ['SMH'], den: ['SPY'] },
    { id: 'ai-power', label: 'AI power leg vs market',    num: ['GRID', 'VST', 'CEG'], den: ['SPY'] },
  ],
  'k-shaped': [
    { id: 'retail-k',  label: 'Retail K (premium+discount vs middle)', num: ['RL', 'TPR', 'LVMUY', 'WMT', 'DG', 'DLTR'], den: ['TGT', 'KSS', 'GAP'] },
    { id: 'housing-k', label: 'Housing K (luxury vs entry-level)',     num: ['TOL'],         den: ['DHI', 'LEN'] },
    { id: 'autos-k',   label: 'Autos K (exotic vs mass-market)',       num: ['RACE'],        den: ['F', 'GM'] },
    { id: 'travel-k',  label: 'Travel K (legacy premium vs budget)',   num: ['DAL', 'UAL'],  den: ['LUV', 'JBLU'] },
    { id: 'credit-k',  label: 'Credit K (prime vs subprime)',          num: ['AXP'],         den: ['SYF', 'OMF'] },
  ],
  instability: [
    { id: 'ita-spy',  label: 'US defense vs market (ITA/SPY)', num: ['ITA'],  den: ['SPY'] },
    { id: 'cibr-spy', label: 'Cyber vs market (CIBR/SPY)',     num: ['CIBR'], den: ['SPY'] },
  ],
};

// Flat list of every tracker across all theses.
export const TRACKERS = Object.values(TRACKERS_BY_THESIS).flat();
