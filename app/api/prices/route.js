import { parseTickers } from '@/lib/holdings';
import { getQuotesForGroup } from '@/lib/watchlist/quotes';
import { trackFMP } from '@/lib/apiUsage';

// Live per-ticker quotes for the dashboard holdings table.
//
// Source is FMP, not Finnhub: the Finnhub free tier returns c:0 outside regular
// hours and we used to silently substitute the previous close (`c>0 ? c : pc`),
// which is exactly how Friday's close showed all day Monday. We reuse the
// watchlist's success-gated, 60s-cached per-symbol fan-out (lib/watchlist/quotes)
// so the whole holdings set costs at most N FMP calls per minute per instance —
// well under FMP's 300/min limit. `force-dynamic` + `no-store` keep any Next Data
// Cache / CDN layer from pinning a stale payload; freshness is carried by each
// quote's own `asOf` (FMP's timestamp), never a response-time clock.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const holdings = parseTickers(searchParams);
  if (!holdings.length) return Response.json([]);

  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return Response.json({ error: 'FMP_API_KEY not configured' }, { status: 500 });

  const symbols = [...new Set(holdings.map(h => h.t))];
  const { quotes, upstreamCalls } = await getQuotesForGroup(symbols, {
    fmpKey,
    label: 'dashboard-prices',
  });
  // Fire-and-forget usage meter — telemetry only, same pattern as other FMP routes.
  if (upstreamCalls > 0) trackFMP(upstreamCalls).catch(() => {});

  const results = holdings.map(h => {
    const q = quotes[h.t];
    // No usable current price → price:null so the UI shows a dash. NEVER fall back
    // to the previous close. Log loudly so an upstream gap is visible, not hidden.
    if (!q || q.error || q.price == null) {
      console.error(`[dashboard-prices] no current price for ${h.t}: ${q?.error ?? 'missing price'}`);
      return { ticker: h.t, price: null, chgPct: null, prevClose: q?.prevClose ?? null, asOf: q?.asOf ?? null };
    }
    return {
      ticker:    h.t,
      price:     q.price,       // current price only — never previousClose
      chgPct:    q.changePct,
      prevClose: q.prevClose,
      asOf:      q.asOf,        // FMP's own timestamp (ms), or null — never Date.now()
    };
  });

  // no-store: the module-level 60s cache already bounds upstream FMP calls, so we
  // don't need (and must not add) a CDN/Data-Cache layer that could serve a stale
  // payload under a fresh response time — the original bug.
  return Response.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
