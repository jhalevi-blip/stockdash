// Shared wrapper for outbound calls to external data providers (FMP, Finnhub,
// Yahoo, SEC, …). Forces cache:'no-store' at the fetch layer — callers do their
// own success-only caching via lib/successCache — and guarantees every failure
// path is logged with a label, never a silent `return null`.

/**
 * @param {string} url
 * @param {{ label?: string, init?: RequestInit }} [opts]
 * @returns {Promise<{ok:true,data:any} | {ok:false,status?:number,error?:string}>}
 */
export async function fetchExternal(url, { label = 'externalFetch', init } = {}) {
  // Strip any `next` (revalidate/tags) a migrated route may have left behind, so
  // it can't conflict with the forced cache:'no-store' below.
  const { next, ...safeInit } = init || {};

  let res;
  try {
    // cache:'no-store' is forced last so a caller's init can't accidentally
    // re-enable the Next data cache (which is what pinned stale failures before).
    res = await fetch(url, { ...safeInit, cache: 'no-store' });
  } catch (err) {
    console.error(`[${label}] fetch failed: ${err?.message ?? err}`);
    return { ok: false, error: err?.message ?? String(err) };
  }

  if (!res.ok) {
    console.error(`[${label}] HTTP ${res.status}`);
    return { ok: false, status: res.status };
  }

  try {
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    console.error(`[${label}] JSON parse failed: ${err?.message ?? err}`);
    return { ok: false, status: res.status, error: 'invalid-json' };
  }
}

/**
 * Same contract as fetchExternal but for non-JSON payloads (e.g. Yahoo crumb).
 * @returns {Promise<{ok:true,text:string} | {ok:false,status?:number,error?:string}>}
 */
export async function fetchExternalText(url, { label = 'externalFetch', init } = {}) {
  const { next, ...safeInit } = init || {};

  let res;
  try {
    res = await fetch(url, { ...safeInit, cache: 'no-store' });
  } catch (err) {
    console.error(`[${label}] fetch failed: ${err?.message ?? err}`);
    return { ok: false, error: err?.message ?? String(err) };
  }
  if (!res.ok) {
    console.error(`[${label}] HTTP ${res.status}`);
    return { ok: false, status: res.status };
  }
  try {
    const text = await res.text();
    return { ok: true, text };
  } catch (err) {
    console.error(`[${label}] text read failed: ${err?.message ?? err}`);
    return { ok: false, status: res.status, error: 'unreadable-body' };
  }
}

/**
 * Build a JSON Response whose CDN header depends on whether any result is
 * flagged with an internal `_error: true`. If so → 'no-store' so the CDN never
 * pins a partial/failed response; otherwise → the supplied cdnHeader.
 * The internal `_error` flag is stripped from the serialized output.
 *
 * @param {any[]|object} results
 * @param {{ cdnHeader?: string }} [opts]
 */
export function cachedJson(results, { cdnHeader } = {}) {
  const flagged = r => !!(r && typeof r === 'object' && r._error);
  const hasError = Array.isArray(results) ? results.some(flagged) : flagged(results);

  const strip = r => {
    if (!r || typeof r !== 'object') return r;
    const { _error, ...rest } = r;
    return rest;
  };
  const clean = Array.isArray(results) ? results.map(strip) : strip(results);

  return Response.json(clean, {
    // Default to no-store when no cdnHeader is given — safe by default.
    headers: { 'Cache-Control': hasError ? 'no-store' : (cdnHeader ?? 'no-store') },
  });
}
