// Core of the theme-extraction / reconciliation flow (Gate 3). Framework-agnostic
// so it is importable by both the API route (app/api/theme-extract/route.js) and
// the test harness (scripts/test-theme-extract.mjs) — no next/server, no Response.
//
// Given a user's worldview and their full existing theme set (active AND retired),
// it asks the model to reconcile the set (reusing immutable theme_ids), validates
// the output strictly, and upserts to user_themes. The worldview is the complete
// source of truth. Never deletes rows.

import { getOrSeedUserThemes } from './userThemes.js';

export const THEME_EXTRACT_MODEL = 'claude-opus-4-8';

// Enum sets shared by the tool schema and server-side validation.
export const VALIDITY_VALUES = ['INTACT', 'WOBBLING'];
export const STATUS_VALUES   = ['active', 'retired'];
export const SOURCE_VALUES   = ['default', 'extracted'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Typed error so the route can map to the right HTTP status without string-matching.
function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// ── System prompt (rules) ────────────────────────────────────────────────────
// Static: the worldview + existing themes are passed as structured input in the
// user message. Every rule from the Gate 3 spec is preserved here verbatim in
// intent; only the formatting is adapted to match the sibling routes' style.
export const RECONCILIATION_SYSTEM_PROMPT = `You maintain a single investor's set of investment themes, derived from their macro worldview. You receive the current worldview text and their existing themes (active and retired), and you return the FULL reconciled theme set — every existing theme plus any new ones — by calling the reconcile_themes tool. The worldview is the complete source of truth.

THEME IDENTITY RULES
- theme_id is IMMUTABLE and is NEVER reused for a different concept.
- If a concept in the worldview matches an existing theme — even reworded, renamed, or re-emphasized — REUSE that theme's theme_id.
- Rename or rewording with the same underlying meaning: keep version unchanged. You may still update name, description, and guidance.
- If the MEANING of an existing theme materially changes (e.g. a bullish stance becomes bearish), keep the theme_id and increment version by 1.
- STRICT SOURCE OF TRUTH: any active theme not grounded in the current worldview text becomes status 'retired' — including seeded default themes. History does not keep a theme alive; only the worldview does.
- A retired theme whose concept reappears in the worldview is reactivated: same theme_id, status 'active', increment version by 1.
- Create a new theme_id only for a genuinely new concept. New ids are lowercase-kebab-case slugs and must not collide with ANY existing id, including retired ones.
- PRIORITY STABILITY: preserve an existing theme's relative order among surviving themes unless the worldview's emphasis has actually changed. When two themes have similar emphasis, keep their existing relative order rather than re-judging it.

CONTENT RULES (per theme)
- name: 1-4 words.
- description: one sentence, card-ready.
- guidance: 2-3 sentences defining what Benefits, Neutral, and Harmed mean for this theme. Lead with the mechanism, and name the classic false-positive to avoid.
- validity: 'INTACT' unless the worldview itself expresses doubt about the theme, in which case 'WOBBLING'.
- priority: 10, 20, 30, ... ranking themes by emphasis in the worldview (order of mention, strength of language, space devoted). Lower is more important.
- source: keep 'default' on reused default themes whose meaning is unchanged; use 'extracted' for new themes or any theme whose meaning changed.
- WORDING STABILITY: if a theme's meaning is unchanged and the worldview text relevant to it has not changed, return its existing name, description, and guidance VERBATIM. Only reword when the worldview adds, removes, or changes something the text must reflect.

RESTRAINT RULES
- Keep 3 to 6 ACTIVE themes. Do not invent themes that are not grounded in the worldview text.
- Do not split one concept into near-duplicate themes.

Return every existing theme (active or retired) AND every new theme in a single reconcile_themes call. Never drop an existing theme_id.`;

// ── Output tool schema (forced tool use, like the sibling routes) ─────────────
const reconcileTool = {
  name: 'reconcile_themes',
  description: 'Return the full reconciled investment-theme set for the user.',
  input_schema: {
    type: 'object',
    properties: {
      themes: {
        type: 'array',
        items: {
          type: 'object',
          required: ['theme_id', 'name', 'description', 'guidance', 'validity', 'version', 'status', 'source', 'priority'],
          properties: {
            theme_id:    { type: 'string', description: 'Immutable lowercase-kebab slug. Reuse for matching concepts; never reuse for a different concept.' },
            name:        { type: 'string', description: '1-4 word display label.' },
            description: { type: 'string', description: 'One card-ready sentence.' },
            guidance:    { type: 'string', description: '2-3 sentences: what Benefits/Neutral/Harmed means, mechanism-first, naming the classic false-positive.' },
            validity:    { type: 'string', enum: VALIDITY_VALUES },
            version:     { type: 'integer', minimum: 1, description: 'Unchanged on rename; +1 on meaning change or reactivation.' },
            status:      { type: 'string', enum: STATUS_VALUES },
            source:      { type: 'string', enum: SOURCE_VALUES },
            priority:    { type: 'integer', minimum: 1, description: '10, 20, 30... by worldview emphasis; lower = more important.' },
          },
        },
      },
    },
    required: ['themes'],
  },
};

// Trim existing rows to the fields the model needs (drop user_id/timestamps).
function projectForPrompt(themes) {
  return themes.map(t => ({
    theme_id: t.theme_id,
    name: t.name,
    description: t.description,
    guidance: t.guidance,
    validity: t.validity,
    version: t.version,
    status: t.status,
    source: t.source,
    priority: t.priority,
  }));
}

// ── Model call ────────────────────────────────────────────────────────────────
export async function callReconciliation({ apiKey, worldview, existingThemes }) {
  const userMessage = `Worldview:
${worldview}

Existing themes (JSON):
${JSON.stringify(projectForPrompt(existingThemes), null, 2)}

Reconcile the theme set against the worldview and return the full set (active and retired) via reconcile_themes.`;

  let res, raw;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: THEME_EXTRACT_MODEL,
        max_tokens: 3000,
        system: RECONCILIATION_SYSTEM_PROMPT,
        tools: [reconcileTool],
        tool_choice: { type: 'tool', name: 'reconcile_themes' },
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    raw = await res.json();
  } catch {
    throw err('generation_failed', 'Network error reaching AI service');
  }

  if (!res.ok) {
    throw err('generation_failed', raw?.error?.message ?? 'AI API error');
  }

  const toolUse = raw.content?.find(b => b.type === 'tool_use' && b.name === 'reconcile_themes');
  if (!toolUse?.input?.themes) {
    throw err('generation_failed', 'No structured output from AI');
  }
  return toolUse.input.themes;
}

// ── Server-side validation (before any write) ────────────────────────────────
// Throws { code: 'validation_failed' } and logs the raw output on any breach.
export function validateReconciliation(themes, existingThemes) {
  const fail = (reason) => {
    console.error('[theme-extract] validation failed:', reason);
    console.error('[theme-extract] raw model themes:\n', JSON.stringify(themes, null, 2));
    throw err('validation_failed', reason);
  };

  if (!Array.isArray(themes) || themes.length === 0) fail('themes must be a non-empty array');

  const seen = new Set();
  for (const t of themes) {
    if (!t || typeof t.theme_id !== 'string' || !SLUG_RE.test(t.theme_id)) fail(`invalid theme_id: ${t?.theme_id}`);
    if (seen.has(t.theme_id)) fail(`duplicate theme_id: ${t.theme_id}`);
    seen.add(t.theme_id);

    for (const f of ['name', 'description', 'guidance']) {
      if (typeof t[f] !== 'string' || !t[f].trim()) fail(`theme ${t.theme_id}: ${f} must be a non-empty string`);
    }
    if (!VALIDITY_VALUES.includes(t.validity)) fail(`theme ${t.theme_id}: invalid validity ${t.validity}`);
    if (!STATUS_VALUES.includes(t.status))     fail(`theme ${t.theme_id}: invalid status ${t.status}`);
    if (!SOURCE_VALUES.includes(t.source))     fail(`theme ${t.theme_id}: invalid source ${t.source}`);
    if (!Number.isInteger(t.version) || t.version < 1)   fail(`theme ${t.theme_id}: version must be a positive int`);
    if (!Number.isInteger(t.priority) || t.priority < 1) fail(`theme ${t.theme_id}: priority must be a positive int`);
  }

  // No existing theme_id may be dropped (rule: every existing id appears in the response).
  const returned = seen;
  for (const e of existingThemes) {
    if (!returned.has(e.theme_id)) fail(`existing theme_id dropped: ${e.theme_id}`);
  }

  // Immutable-id integrity: a reused id must not go backwards in version.
  const byId = new Map(existingThemes.map(e => [e.theme_id, e]));
  for (const t of themes) {
    const prev = byId.get(t.theme_id);
    if (prev && t.version < prev.version) fail(`theme ${t.theme_id}: version regressed ${prev.version} -> ${t.version}`);
  }

  const activeCount = themes.filter(t => t.status === 'active').length;
  if (activeCount < 3 || activeCount > 6) fail(`active theme count out of range: ${activeCount} (must be 3-6)`);
}

const byPriority = (a, b) => a.priority - b.priority || a.theme_id.localeCompare(b.theme_id);

// Persisted content fields (everything except priority) — used for churn detection.
const CONTENT_FIELDS = ['name', 'description', 'guidance', 'validity', 'version', 'status', 'source'];
const contentEqual   = (t, b) => CONTENT_FIELDS.every(f => t[f] === b[f]);
const fullyUnchanged = (t, b) => contentEqual(t, b) && t.priority === b.priority;

// Anti-churn: if the model only renumbered priorities WITHOUT changing the relative
// order of surviving active themes, snap those priorities back to their baseline
// values so an otherwise no-op reconciliation doesn't rewrite them. Mutates
// `reconciled` in place. A genuine reorder (relative order actually changed) is
// left untouched. A snap that would duplicate another theme's priority is skipped.
function stabilizePriorities(reconciled, baselineById) {
  const survActive = reconciled.filter(t => t.status === 'active' && baselineById.has(t.theme_id));
  const seqBy = (prio) => survActive.slice()
    .sort((a, b) => prio(a) - prio(b) || a.theme_id.localeCompare(b.theme_id))
    .map(t => t.theme_id).join(',');
  const relativeOrderUnchanged =
    seqBy(t => t.priority) === seqBy(t => baselineById.get(t.theme_id).priority);
  if (!relativeOrderUnchanged) return;

  for (const t of reconciled) {
    const b = baselineById.get(t.theme_id);
    if (b && contentEqual(t, b) && t.priority !== b.priority) {
      const collision = reconciled.some(o => o !== t && o.priority === b.priority);
      if (!collision) t.priority = b.priority;
    }
  }
}

// ── Orchestration ────────────────────────────────────────────────────────────
// Route calls this with dryRun=false. The harness may pass dryRun=true to see the
// reconciliation WITHOUT persisting it (note: first-touch default seeding still
// happens, since that is the baseline the model reconciles against).
export async function extractThemesForUser(sb, userId, { apiKey, dryRun = false } = {}) {
  if (!sb) throw err('config', 'Supabase client required');
  if (!userId) throw err('config', 'userId required');
  if (!apiKey) throw err('ai_unavailable', 'AI service unavailable');

  // (b) Worldview — the source of truth. Empty/null is a hard 400 upstream.
  const { data: settings, error: sErr } = await sb
    .from('user_settings').select('worldview').eq('user_id', userId).maybeSingle();
  if (sErr) throw err('db_error', sErr.message);
  const worldview = typeof settings?.worldview === 'string' ? settings.worldview.trim() : '';
  if (!worldview) throw err('no_worldview', 'No worldview saved — nothing to extract from.');

  // (c) Seed the four defaults on first touch (first real caller of the Gate 2 helper).
  await getOrSeedUserThemes(sb, userId);

  // Full existing set — active AND retired — for the prompt and validation.
  const { data: existingThemes, error: eErr } = await sb
    .from('user_themes').select('*').eq('user_id', userId);
  if (eErr) throw err('db_error', eErr.message);

  // (d) Model reconciliation.
  const reconciled = await callReconciliation({ apiKey, worldview, existingThemes: existingThemes ?? [] });

  // (3) Validate before writing anything.
  validateReconciliation(reconciled, existingThemes ?? []);

  // Anti-churn: snap no-op priority renumbering back to baseline before writing.
  const baselineById = new Map((existingThemes ?? []).map(b => [b.theme_id, b]));
  stabilizePriorities(reconciled, baselineById);

  // (e) Upsert new + changed rows only — rows fully unchanged vs baseline are
  // skipped entirely, so their updated_at is not bumped. Never delete. created_at
  // is left untouched on update (not in payload) and defaults on insert.
  if (!dryRun) {
    const now = new Date().toISOString();
    const rows = reconciled
      .filter(t => {
        const b = baselineById.get(t.theme_id);
        return !b || !fullyUnchanged(t, b);
      })
      .map(t => ({
        user_id: userId,
        theme_id: t.theme_id,
        name: t.name,
        description: t.description,
        guidance: t.guidance,
        validity: t.validity,
        version: t.version,
        status: t.status,
        source: t.source,
        priority: t.priority,
        updated_at: now,
      }));
    if (rows.length) {
      const { error: upErr } = await sb.from('user_themes').upsert(rows, { onConflict: 'user_id,theme_id' });
      if (upErr) throw err('db_error', upErr.message);
    }
  }

  // (f) Return the reconciled active set (+ context for the harness diff).
  const active = dryRun
    ? reconciled.filter(t => t.status === 'active').slice().sort(byPriority)
    : await getOrSeedUserThemes(sb, userId);

  return { worldview, before: existingThemes ?? [], reconciled, active, dryRun };
}
