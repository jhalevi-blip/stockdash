// Central registry of Claude model IDs.
//
// Model strings are NOT stable forever: a retired ID returns a hard 404
// ("not_found_error") from the Anthropic API. That is exactly how the
// /research quick-action chips silently broke — they pointed at the retired
// `claude-sonnet-4-0` while the rest of the app had already moved on. Keeping
// every model reference here means a rename is a one-line change and no two
// routes can drift onto different (or dead) model strings again.
//
// Import these constants instead of hardcoding model strings in a route.

export const CLAUDE_MODELS = {
  // Deep reasoning / long-form analysis: AI theses, portfolio summaries,
  // theme classification.
  flagship: 'claude-opus-5',
  // Mid tier for short, high-volume, anonymously-fireable prompts (research
  // quick-action chips, max_tokens ~400). Opus there is the biggest cost
  // exposure on the site, so keep these on Sonnet.
  quick: 'claude-sonnet-4-6',
  // Fast, cheap tier for short classification / preview tasks.
  fast: 'claude-haiku-4-5-20251001',
};

// Convenience default for callers that just want "the main model".
export const DEFAULT_CLAUDE_MODEL = CLAUDE_MODELS.flagship;

// Turns a model ID into a human display label, e.g.
//   'claude-opus-5'              -> 'Opus 5'
//   'claude-opus-4-8'            -> 'Opus 4.8'
//   'claude-haiku-4-5-20251001'  -> 'Haiku 4.5'
// Use this for any UI that names the model so the label can never drift from
// the ID actually used (e.g. the /research thesis card header).
export function modelLabel(id) {
  const m = /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?/.exec(id ?? '');
  if (!m) return 'Claude';
  const family  = m[1][0].toUpperCase() + m[1].slice(1);
  const version = m[3] ? `${m[2]}.${m[3]}` : m[2];
  return `${family} ${version}`;
}

// Pre-computed label for the thesis-writing (flagship) model.
export const FLAGSHIP_LABEL = modelLabel(CLAUDE_MODELS.flagship);
