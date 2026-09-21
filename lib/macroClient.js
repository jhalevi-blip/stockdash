// Shared client-side loader for /api/macro so the dashboard makes ONE request on
// load instead of two: the page-level "Today vs S&P" chip and MacroStrip both mount
// together and previously each fetched /api/macro independently. Callers still parse
// the resolved JSON their own way (spyPct vs transformMacro) — this only dedupes the
// network request. The in-flight promise is shared, and the result is cached for a
// short TTL so a remount within the window reuses it; failures are not cached (the
// promise rejects and is cleared, so each caller's own .catch runs and a later mount
// can retry), matching the previous per-caller error behaviour.
let cached = null; // { at: number, promise: Promise<object> }
const TTL_MS = 60_000;

export function fetchMacro() {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.promise;

  const entry = { at: now, promise: null };
  entry.promise = fetch('/api/macro')
    .then((r) => r.json())
    .catch((err) => {
      if (cached === entry) cached = null; // don't pin a failed fetch
      throw err;
    });
  cached = entry;
  return entry.promise;
}
