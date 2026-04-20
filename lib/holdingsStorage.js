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
