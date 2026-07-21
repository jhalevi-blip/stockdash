import { trackFMP } from '@/lib/apiUsage';

export const dynamic = 'force-dynamic';

const FMP_EARNINGS = 'https://financialmodelingprep.com/stable/earnings';

// Only SUCCESSFUL lookups are cached, in module memory, for 6h. Transport/HTTP/
// parse errors are never stored, so a failed fetch can never be served stale
// (this is what let Yahoo serve `noData` for hours after a date was confirmed).
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const earningsCache = new Map(); // symbol -> { result, expiresAt }   result: {date,epsEstimate} | null

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// Next confirmed earnings for one symbol from FMP's per-symbol stable/earnings.
// FMP returns rows newest-first; limit=8 comfortably covers the one upcoming
// quarter (verified: PHM/AMD return the future row at index 0 within 8 rows).
// Success  -> { symbol, date, hour:null, epsEstimate, noData:false }
// No future date (valid 200) -> { symbol, noData:true }        (cached)
// Any error -> { symbol, noData:true, _error:true }            (NOT cached, logged)
async function fetchNextEarnings(symbol, key, today) {
  const hit = earningsCache.get(symbol);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.result
      ? { symbol, date: hit.result.date, hour: null, epsEstimate: hit.result.epsEstimate, revenueEstimate: hit.result.revenueEstimate, noData: false }
      : { symbol, noData: true };
  }

  const url = `${FMP_EARNINGS}?symbol=${symbol}&limit=8&apikey=${key}`;
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' }); // never cache at the fetch layer; we cache successes ourselves
  } catch (err) {
    console.error(`[earnings] FMP fetch failed for ${symbol}:`, err);
    return { symbol, noData: true, _error: true };
  }
  if (!res.ok) {
    console.error(`[earnings] FMP ${res.status} for ${symbol}`);
    return { symbol, noData: true, _error: true };
  }

  let rows;
  try {
    rows = await res.json();
  } catch (err) {
    console.error(`[earnings] FMP bad JSON for ${symbol}:`, err);
    return { symbol, noData: true, _error: true };
  }
  if (!Array.isArray(rows)) {
    console.error(`[earnings] FMP unexpected shape for ${symbol}:`, JSON.stringify(rows).slice(0, 200));
    return { symbol, noData: true, _error: true };
  }

  // earliest row dated today or later
  const next = rows
    .filter(r => r.date && r.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const result = next
    ? { date: next.date, epsEstimate: next.epsEstimated ?? null, revenueEstimate: next.revenueEstimated ?? null }
    : null; // valid response with no upcoming earnings — safe to cache

  earningsCache.set(symbol, { result, expiresAt: Date.now() + CACHE_TTL_MS });

  return result
    ? { symbol, date: result.date, hour: null, epsEstimate: result.epsEstimate, revenueEstimate: result.revenueEstimate, noData: false }
    : { symbol, noData: true };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get('tickers') ?? '';
  const tickers = tickersParam
    ? tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
    : [];

  if (!tickers.length) return Response.json([]);

  const key = process.env.FMP_API_KEY;
  if (!key) {
    console.error('[earnings] FMP_API_KEY not configured');
    // Missing config is a server error — don't pin it at the CDN.
    return Response.json(
      tickers.map(symbol => ({ symbol, noData: true })),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  trackFMP(tickers.length).catch(() => {});

  const today = todayISO();
  const results = await Promise.all(tickers.map(t => fetchNextEarnings(t, key, today)));

  // If ANY ticker hit a transport/HTTP/parse error, the response is partial —
  // don't let the CDN pin it; the next request retries the failed ticker fresh.
  const hasError = results.some(r => r._error);

  // Preserve the shape the component expects: {symbol,date,hour,epsEstimate,noData}
  // for hits, {symbol,noData:true} for misses. Strip the internal _error flag.
  const sorted = [
    ...results.filter(r => !r.noData).sort((a, b) => a.date.localeCompare(b.date)),
    ...results.filter(r =>  r.noData).map(({ symbol }) => ({ symbol, noData: true })),
  ];

  return Response.json(sorted, {
    headers: {
      'Cache-Control': hasError
        ? 'no-store'                                   // error-containing → never pinned, retry fresh
        : 's-maxage=3600, stale-while-revalidate=300', // all-good → unchanged
    },
  });
}
