/**
 * Per-user localStorage helpers for portfolio holdings.
 *
 * stockdash_holdings  — shared session cache; all pages read from this.
 * holdings_${userId}  — user-scoped source of truth; survives sign-out/sign-in.
 *
 * NavBar is the sole authority that populates the cache on sign-in.
 * On sign-out the cache is cleared so the next user starts clean.
 */

export const CACHE_KEY   = 'stockdash_holdings';
export const userKey     = (userId) => `holdings_${userId}`;

/**
 * On first sign-in after this change is deployed, copy any existing
 * stockdash_holdings data into the user-scoped key so nothing is lost.
 */
export function migrateIfNeeded(userId) {
  if (!userId) return;
  try {
    const scoped = userKey(userId);
    if (!localStorage.getItem(scoped)) {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        localStorage.setItem(scoped, cached);
        console.log('[holdingsStorage] Migrated stockdash_holdings →', scoped);
      } else {
        console.log('[holdingsStorage] migrateIfNeeded: nothing to migrate — stockdash_holdings is empty');
      }
    } else {
      console.log('[holdingsStorage] migrateIfNeeded: scoped key already exists —', scoped);
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

/** Write holdings to both the shared cache and the user-scoped key. */
export function saveUserHoldings(userId, holdings) {
  try {
    const json = JSON.stringify(holdings);
    localStorage.setItem(CACHE_KEY, json);
    if (userId) localStorage.setItem(userKey(userId), json);
  } catch {}
}

/** Clear the shared cache. Call on sign-out so the next user starts clean. */
export function clearHoldingsCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}
