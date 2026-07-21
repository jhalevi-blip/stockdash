// Single shared Yahoo Finance crumb handshake, hardened to match what the old
// /api/earnings route carried:
//   - module-memory crumb cache (4h TTL) so we don't re-handshake every request
//   - in-flight dedupe so concurrent requests share one handshake (no stampede)
//   - invalidate + retry-once on 401/403 (a cached crumb can rotate/expire)
// Replaces the three identical copies in institutional / short-interest /
// short-interest-data.

import { fetchExternal } from './externalFetch';

const CRUMB_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
let crumbCache = null;     // { crumb, cookie, expiresAt } | null
let crumbInFlight = null;  // Promise<auth|null> | null — dedupes concurrent refreshes

const UA = 'Mozilla/5.0';

// Raw two-step handshake (homepage cookie → getcrumb). No caching; callers use
// getYahooCrumb(). Kept as raw fetch because it needs Set-Cookie off the
// homepage response headers, which fetchExternal intentionally doesn't expose.
async function fetchFreshCrumb() {
  try {
    const homeRes = await fetch('https://finance.yahoo.com/', {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      redirect: 'follow',
      cache: 'no-store',
    });
    const rawCookies = homeRes.headers.getSetCookie?.() ?? [];
    const cookie = rawCookies.map(c => c.split(';')[0]).join('; ');

    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, 'Accept': 'text/plain', 'Cookie': cookie },
      cache: 'no-store',
    });
    if (!crumbRes.ok) {
      console.error(`[yahooCrumb] getcrumb HTTP ${crumbRes.status}`);
      return null;
    }
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.includes('{')) {
      console.error('[yahooCrumb] invalid crumb (consent wall or blocked)');
      return null;
    }
    return { crumb, cookie };
  } catch (err) {
    console.error(`[yahooCrumb] handshake failed: ${err?.message ?? err}`);
    return null;
  }
}

/** Drop the cached crumb so the next getYahooCrumb() re-handshakes. */
export function invalidateCrumb() {
  crumbCache = null;
}

/**
 * Return a valid { crumb, cookie } — cached when fresh, else re-handshake.
 * Concurrent refreshes share one in-flight handshake.
 * @param {{ forceRefresh?: boolean }} [opts]
 * @returns {Promise<{crumb:string, cookie:string, expiresAt:number}|null>}
 */
export async function getYahooCrumb({ forceRefresh = false } = {}) {
  if (!forceRefresh && crumbCache && crumbCache.expiresAt > Date.now()) {
    return crumbCache;
  }
  if (!crumbInFlight) {
    crumbInFlight = (async () => {
      const fresh = await fetchFreshCrumb();
      crumbCache = fresh ? { ...fresh, expiresAt: Date.now() + CRUMB_TTL_MS } : null;
      return crumbCache;
    })().finally(() => { crumbInFlight = null; });
  }
  return crumbInFlight;
}

/**
 * Convenience: authed quoteSummary fetch with retry-once on 401/403.
 * Returns the first result object, or an {ok:false,…} passthrough on failure.
 * @param {string} ticker
 * @param {string} modules  comma-separated, e.g. 'defaultKeyStatistics'
 * @param {{ label?: string }} [opts]
 * @returns {Promise<{ok:true,data:any} | {ok:false,status?:number,error?:string}>}
 */
export async function yahooQuoteSummary(ticker, modules, { label = 'yahooQuoteSummary' } = {}) {
  let auth = await getYahooCrumb();
  if (!auth) return { ok: false, error: 'no-crumb' };

  const build = a =>
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}` +
    `?modules=${encodeURIComponent(modules)}&crumb=${encodeURIComponent(a.crumb)}`;
  const init = a => ({
    headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Cookie': a.cookie },
  });

  let res = await fetchExternal(build(auth), { label, init: init(auth) });

  // A cached crumb can be rejected (rotated/expired) — refresh once and retry.
  if (!res.ok && (res.status === 401 || res.status === 403)) {
    invalidateCrumb();
    auth = await getYahooCrumb({ forceRefresh: true });
    if (!auth) return { ok: false, error: 'no-crumb' };
    res = await fetchExternal(build(auth), { label, init: init(auth) });
  }

  if (!res.ok) return res;

  const result = res.data?.quoteSummary?.result?.[0] ?? null;
  if (result == null) {
    console.error(`[${label}] empty quoteSummary result for ${ticker}`);
  }
  return { ok: true, data: result };
}
