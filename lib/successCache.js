// Module-memory, success-only cache. Generalizes the pattern from the FMP
// earnings route: entries are written ONLY by the caller on a confirmed success,
// so a failed/empty upstream can never be served stale. Per-instance (resets on
// cold start), same lifetime semantics as the old Yahoo crumb cache.
//
// Note on nulls: a stored value of `null` is a legitimate cached success (e.g.
// "no upcoming earnings"). get() returns `undefined` for miss/expiry ONLY, so
// callers can cache null and still distinguish it from a miss:
//   const v = cache.get(key);
//   if (v !== undefined) return v;   // hit (including null)

/**
 * @param {number} ttlMs
 * @returns {{ get(key:string): any|undefined, set(key:string, value:any): void,
 *             delete(key:string): void, clear(): void }}
 */
export function createCache(ttlMs) {
  const store = new Map(); // key -> { value, expiresAt }

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    delete(key) { store.delete(key); },
    clear() { store.clear(); },
  };
}
