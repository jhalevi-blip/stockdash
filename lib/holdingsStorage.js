/**
 * Per-user localStorage helpers for portfolio holdings.
 *
 * stockdash_holdings        — shared session cache; all pages read from this.
 * stockdash_holdings_owner  — userId (or 'demo'/'anonymous') that wrote the cache.
 * holdings_${userId}        — user-scoped source of truth; survives sign-out/sign-in.
 *
 * NavBar is the sole authority that populates the cache on sign-in.
 * On sign-out the cache and owner are cleared so the next user starts clean.
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
 * is verifiably owned by this user. Refuses to migrate when no owner key
 * is set (pre-ownership-key data) or when the owner is someone else.
 * NavBar no longer calls this for first-time sign-ins; it exists as a
 * safety net for returning users whose scoped key is already present
 * (in which case it's a no-op).
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

/** Write holdings to the shared cache, the owner key, and the user-scoped key. */
export function saveUserHoldings(userId, holdings) {
  try {
    const json = JSON.stringify(holdings);
    localStorage.setItem(CACHE_KEY, json);
    localStorage.setItem(OWNER_KEY, userId ?? 'anonymous');
    if (userId) localStorage.setItem(userKey(userId), json);
  } catch {}
}

/** Clear the shared cache and its owner tag. Call on sign-out. */
export function clearHoldingsCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(OWNER_KEY);
  } catch {}
}
