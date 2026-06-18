/**
 * Per-user localStorage helpers for portfolio holdings.
 *
 * stockdash_holdings        — shared session cache; all pages read from this.
 * stockdash_holdings_owner  — userId that last wrote the cache (never 'anonymous').
 *                             'demo' is written by startDemo.js only.
 * holdings_${userId}        — user-scoped source of truth; survives sign-out/sign-in.
 *
 * NavBar is the sole authority that populates the cache on sign-in via migrateIfNeeded
 * + saveUserHoldings. On sign-out the cache and owner are cleared so the next user
 * starts clean. saveUserHoldings refuses to write when userId is absent or synthetic.
 */

export const CACHE_KEY = 'stockdash_holdings';
export const OWNER_KEY = 'stockdash_holdings_owner';
export const userKey   = (userId) => `holdings_${userId}`;

/** Who wrote the current shared cache. Returns userId, 'demo', 'anonymous', or null. */
export function getCacheOwner() {
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}

/**
 * Ownership-aware read of the shared holdings cache. Pure — no writes, no side effects.
 *
 * Policy (owner is a "real user" when truthy and not 'demo'/'anonymous'):
 *   - Signed in (currentUserId truthy): return holdings only when owner === currentUserId,
 *     otherwise [] — never expose another user's (or a stale) cache.
 *   - Guest (currentUserId falsy): return [] when the owner is a real user (a foreign cache
 *     left on a shared device — the leak); otherwise return holdings (own anonymous upload or demo).
 */
export function getCachedHoldings(currentUserId) {
  let holdings = [];
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    holdings = stored ? JSON.parse(stored) : [];
  } catch { return []; }
  const owner = getCacheOwner();
  const ownerIsRealUser = !!owner && owner !== 'demo' && owner !== 'anonymous';
  if (currentUserId) return owner === currentUserId ? holdings : [];
  return ownerIsRealUser ? [] : holdings;
}

/**
 * Promote the shared cache into the user-scoped key — only if the cache
 * is verifiably owned by this user. Refuses (silently) when:
 *   - owner key is absent (null) — pre-ownership-key or cleared data
 *   - owner is someone else, 'demo', or 'anonymous'
 * Is a no-op when the scoped key already exists (returning user).
 * Called by NavBar's sign-in effect as the single canonical migration path.
 */
export function migrateIfNeeded(userId) {
  if (!userId) return;
  try {
    const scoped = userKey(userId);
    if (!localStorage.getItem(scoped)) {
      const cached = localStorage.getItem(CACHE_KEY);
      const owner  = localStorage.getItem(OWNER_KEY);
      if (cached && owner === userId) {
        // Only migrate when the cache is verifiably owned by this exact user.
        // No owner (pre-deployment data) or mismatched owner: refuse silently.
        localStorage.setItem(scoped, cached);
      }
    }
  } catch {}
}

/** Read holdings for a user from their scoped key. Returns array or null. */
export function loadUserHoldings(userId) {
  if (!userId) return null;
  try {
    const s = localStorage.getItem(userKey(userId));
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

/**
 * Write holdings to the shared cache, the owner key, and the user-scoped key.
 * Refuses to write when userId is absent or synthetic — demo/anonymous writes
 * go through startDemo.js directly so no caller can pollute the shared cache
 * with an un-owned or mis-stamped entry.
 */
export function saveUserHoldings(userId, holdings) {
  if (!userId || userId === 'anonymous' || userId === 'demo') return;
  try {
    const json = JSON.stringify(holdings);
    localStorage.setItem(CACHE_KEY, json);
    localStorage.setItem(OWNER_KEY, userId);
    localStorage.setItem(userKey(userId), json);
  } catch {}
}

/** Clear the shared cache and its owner tag. Call on sign-out. */
export function clearHoldingsCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(OWNER_KEY);
  } catch {}
}

/**
 * Private-by-default wipe for sign-out / confirmed-guest-load so nothing leaks
 * to the next person on a shared browser. PRESERVE-LIST approach: delete every
 * localStorage key EXCEPT the known-safe set below. Anything personal that is
 * added in future is therefore wiped automatically — no maintenance required.
 *
 * PRESERVED:
 *   - any key starting with `_`  → third-party SDK storage (Clerk __clerk*,
 *     Clarity _cl*, GA _ga*). The app's own keys never start with `_`.
 *   - any key starting with `ph_` → PostHog.
 *   - the exact preference/flag + guest-owned-quota keys listed below.
 *   - the demo holdings cache (CACHE_KEY/OWNER_KEY) only when owner === 'demo'.
 *
 * NOTE: a new third-party SDK that uses a localStorage key NOT starting with `_`
 * or `ph_` must have its prefix added to KEEP_PREFIXES here, or it will be wiped.
 */
export function clearAllForeignData() {
  const KEEP_PREFIXES = ['_', 'ph_'];
  const KEEP_EXACT = new Set([
    'stockdash_theme',
    'stockdash_demo',
    'stockdash_demo_dismissed',
    'stockdash_tour_done',
    'tour_completed',
    'tour_pending',
    'dev_mode',
    'devMode',
    'portfolio_ai_summary_anon',
    'portfolio_ai_usage_anon',
    'research_thesis_usage_anon',
  ]);
  try {
    // Demo holdings cache survives only while a demo is active.
    const demoActive = getCacheOwner() === 'demo';
    for (const key of Object.keys(localStorage)) {
      if (KEEP_PREFIXES.some((p) => key.startsWith(p))) continue;
      if (KEEP_EXACT.has(key)) continue;
      if (demoActive && (key === CACHE_KEY || key === OWNER_KEY)) continue;
      localStorage.removeItem(key);
    }
  } catch {}
}
