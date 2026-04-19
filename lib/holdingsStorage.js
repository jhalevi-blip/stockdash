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
 * On first sign-in after user-scoping was deployed, copy any existing
 * stockdash_holdings data into the user-scoped key so nothing is lost.
 * Only called after ownership has been verified safe by the caller.
 */
export function migrateIfNeeded(userId) {
  if (!userId) return;
  try {
    const scoped = userKey(userId);
    if (!localStorage.getItem(scoped)) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
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
