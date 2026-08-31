// Server-side FMP quote fetch for the watchlist (spec §4).
//
// The Starter plan has NO working batch-quote endpoint (batch-quote and
// batch-quote-short are subscription-restricted, the legacy v3 batch is retired,
// and quote?symbol=A,B silently returns []). So we fan out one quote?symbol=X call
// per symbol — but wrap the whole GROUP in a 60s cache keyed by the sorted symbol
// list, so no matter how many browser tabs or 60s polls hit the route, the upstream
// sees at most N calls per minute per group. This preserves the spec's intent
// (bounded upstream calls; quote data cached, the per-user joined payload NOT) even
// though the literal "one call" isn't available on this tier.

import { fetchExternal } from '../externalFetch.js';
import { createCache } from '../successCache.js';

const FMP_BASE = 'https://financialmodelingprep.com/stable';

// Module-memory cache; success-gated (see below). 60s TTL per spec §4.
const quoteCache = createCache(60_000);

function mapQuoteRow(row) {
  return {
    price:      row.price ?? null,
    changePct:  row.changePercentage ?? null,
    change:     row.change ?? null,
    prevClose:  row.previousClose ?? null,
    dayHigh:    row.dayHigh ?? null,
    dayLow:     row.dayLow ?? null,
    exchange:   row.exchange ?? null,
    // FMP timestamp is epoch seconds → ms. If FMP omits it, leave asOf null —
    // NEVER synthesize Date.now(): a fabricated "now" makes stale data look fresh
    // (the bug that showed Friday's prices all Monday). Clients render null as "—".
    asOf:       row.timestamp ? row.timestamp * 1000 : null,
  };
}

/**
 * Fetch quotes for one asset-class group.
 * @param {string[]} symbols provider symbols (already resolved, non-null)
 * @param {{ fmpKey: string, label: string }} opts
 * @returns {Promise<{ quotes: Record<string, object>, upstreamCalls: number }>}
 *   Each quotes[symbol] is either a mapped quote or `{ error: string }` — every
 *   failure is represented, never dropped (the UI renders it).
 */
export async function getQuotesForGroup(symbols, { fmpKey, label }) {
  const sorted = [...new Set(symbols)].sort();
  if (sorted.length === 0) return { quotes: {}, upstreamCalls: 0 };

  const key = `${label}:${sorted.join(',')}`;
  const cached = quoteCache.get(key);
  if (cached !== undefined) return { quotes: cached, upstreamCalls: 0 };

  const entries = await Promise.all(sorted.map(async sym => {
    const url = `${FMP_BASE}/quote?symbol=${encodeURIComponent(sym)}&apikey=${fmpKey}`;
    const res = await fetchExternal(url, { label: `${label}:${sym}` });
    if (!res.ok) {
      return [sym, { error: res.status ? `HTTP ${res.status}` : (res.error || 'fetch failed') }];
    }
    const row = Array.isArray(res.data) ? res.data[0] : null;
    if (!row) {
      // Loud: a 200 with an empty/unshaped payload is still a failure to quote.
      // (fetchExternal already logs non-2xx / network / parse failures.)
      console.error(`[${label}:${sym}] no quote returned (empty payload)`);
      return [sym, { error: 'no quote returned' }];
    }
    return [sym, mapQuoteRow(row)];
  }));

  const quotes = Object.fromEntries(entries);

  // Cache only when at least one symbol resolved — never pin a total upstream
  // outage for 60s (successCache semantics). Per-symbol errors inside a partly-ok
  // batch do get cached for the TTL, which is acceptable: they self-heal in ≤60s
  // and the alternative is hammering a flaky upstream.
  if (Object.values(quotes).some(v => !v.error)) {
    quoteCache.set(key, quotes);
  }

  return { quotes, upstreamCalls: sorted.length };
}

// Exposed for tests / cache busting.
export function _clearQuoteCache() { quoteCache.clear(); }
