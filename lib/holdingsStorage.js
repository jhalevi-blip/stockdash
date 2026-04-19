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
    const cached = localStorage.getItem(CACHE_KEY);
    const existing = localStorage.getItem(scoped);
    console.log('[migrate] called for', scoped,
      '| stockdash_holdings=', cached ? JSON.parse(cached).map(h=>h.t) : 'empty',
      '| scoped key exists=', !!existing,
      existing ? '| scoped tickers=' + JSON.parse(existing).map(h=>h.t) : '');
    if (!existing) {
      if (cached) {
        localStorage.setItem(scoped, cached);
        console.log('[migrate] COPIED stockdash_holdings →', scoped, '(tickers:', JSON.parse(cached).map(h=>h.t), ')');
      } else {
        console.log('[migrate] nothing to migrate — stockdash_holdings is empty');
      }
    } else {
      console.log('[migrate] scoped key already exists — no migration needed');
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
