// Per-user theme set for /themes. Lazy seed: the first read for a user with no
// rows inserts the four defaults — the set that was hardcoded in
// app/(v2)/themes/_lib/theses.js before the dynamic-themes migration.
//
// Service-role Supabase client only — user_themes is RLS-protected with no
// public policies (see db/migrations/008_user_themes.sql).
//
// NOTE: exported but intentionally NOT called from any route yet. Wiring is
// Gate 4. The GUIDANCE prose below is copied inline (not imported from
// theme-classify/route.js) so this seed does not depend on a file that Gate 4
// refactors out from under it.

// The four default themes, mirroring THESES (name, description ← view, validity)
// and the GUIDANCE map (theme-classify/route.js L15-20) as of the pre-migration
// hardcoded set. Self-contained so seeding has a single source of truth.
const DEFAULT_THEMES = [
  {
    theme_id: 'debasement',
    name: 'Debasement',
    description: 'Deficits compound and real rates stay pinned below inflation; hard assets and scarcity win.',
    guidance: "Beneficiaries: hard assets, pricing power, nominal-asset owners, energy/commodity producers, crypto exposure. The mechanism is SUPPRESSED real rates and financial repression — never apply 'high rates hurt X' logic. Victims: long-duration cash flows with no pricing power.",
    validity: 'INTACT',
    priority: 10,
  },
  {
    theme_id: 'strong-ai',
    name: 'Strong AI',
    description: 'The AI buildout is real and compounding — compute and power lead, and it is deflationary in the sectors it touches.',
    guidance: 'Beneficiaries: compute, power infrastructure, AI-native operators that consume their own efficiency gains. Victims: businesses whose product AI deflates or replaces.',
    validity: 'INTACT',
    priority: 20,
  },
  {
    theme_id: 'k-shaped',
    name: 'K-Shaped Economy',
    description: 'The top decile spends through anything; the bottom half is in a rolling recession. Both ends win, the middle loses.',
    guidance: 'The top decile spends through anything; the bottom half trades down or exits. In trade-down-able goods both ends win and the MIDDLE is the victim. In threshold goods (housing, new cars) the bottom buyer exits entirely, so the entry tier is the victim. Mid-premium brands sold to ordinary people are the classic victim.',
    validity: 'INTACT',
    priority: 30,
  },
  {
    theme_id: 'instability',
    name: 'Instability & Rearmament',
    description: 'A more unstable world rearms — defense, energy security and cyber carry a structural bid, and the bill feeds the debasement.',
    guidance: 'Beneficiaries: direct revenue from defense, security, cyber, energy security. Victims: China-sourced supply chains, conflict-exposed logistics. A company merely operating globally is Neutral, not Hurt.',
    validity: 'INTACT',
    priority: 40,
  },
];

/**
 * Return the user's active themes, seeding the four defaults on first touch.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb - service-role client
 * @param {string} userId - Clerk user id
 * @returns {Promise<object[]>} active user_themes rows (empty array if sb/userId missing)
 */
export async function getOrSeedUserThemes(sb, userId) {
  if (!sb || !userId) return [];

  // A user's active theme set, ordered by display priority (lower = more
  // important), with theme_id as a stable tiebreak for equal priorities.
  const selectActive = () => sb
    .from('user_themes')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('priority', { ascending: true })
    .order('theme_id', { ascending: true });

  // 1. Existing themes always win — never re-seed a user who already has some.
  const { data: existing, error: selErr } = await selectActive();
  if (selErr) throw selErr;
  if (existing && existing.length) return existing;

  // 2. First touch — insert the four defaults. ignoreDuplicates makes this safe
  //    against a concurrent first-touch race: the loser no-ops on the
  //    (user_id, theme_id) primary key instead of erroring.
  const now = new Date().toISOString();
  const rows = DEFAULT_THEMES.map(t => ({
    user_id: userId,
    theme_id: t.theme_id,
    name: t.name,
    description: t.description,
    guidance: t.guidance,
    validity: t.validity,
    version: 1,
    status: 'active',
    source: 'default',
    priority: t.priority,
    created_at: now,
    updated_at: now,
  }));

  const { error: insErr } = await sb
    .from('user_themes')
    .upsert(rows, { onConflict: 'user_id,theme_id', ignoreDuplicates: true });
  if (insErr) throw insErr;

  // 3. Re-read so the return value is the authoritative active set regardless
  //    of who won the race.
  const { data: seeded, error: reErr } = await selectActive();
  if (reErr) throw reErr;
  return seeded ?? [];
}

// Deterministic fingerprint of the active theme set: sorted 'theme_id:version'
// pairs joined by commas. It changes when a theme is added, retired, or has its
// meaning bumped (version), but NOT on a rename/reword (version held) — matching
// the theme-version contract. Used as the cache-identity token for
// theme_classifications and the '_worldview' candidate aggregate, replacing the
// old global THESIS_VERSION.
export function activeThemeFingerprint(themes) {
  return (themes ?? [])
    .filter(t => t.status === 'active')
    .map(t => `${t.theme_id}:${t.version}`)
    .sort()
    .join(',');
}

// True only when the active set is EXACTLY the four untouched defaults: the four
// default theme_ids, every row source 'default' and version 1. Gates whether the
// portfolio-owner calibration examples still apply in theme-classify — once a user
// has edited/extracted their worldview, those hand-tuned examples no longer match.
export function isPristineDefaultSet(themes) {
  const active = (themes ?? []).filter(t => t.status === 'active');
  if (active.length !== DEFAULT_THEMES.length) return false;
  const ids = new Set(active.map(t => t.theme_id));
  if (ids.size !== DEFAULT_THEMES.length) return false;
  for (const d of DEFAULT_THEMES) if (!ids.has(d.theme_id)) return false;
  return active.every(t => t.source === 'default' && t.version === 1);
}
