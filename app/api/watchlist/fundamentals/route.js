// GET /api/watchlist/fundamentals?symbol=X — detail-panel fundamentals for one
// symbol (STEP 2). Auth-gated only — NOT watchlist-gated: the screen loads symbols
// outside the watchlist, and FMP fundamentals are shared reference data. A watchlist
// row, when present, maps display→provider symbol; otherwise the symbol is used as-is.
//
// Payload: market cap, enterprise value, total debt, cash & equivalents, P/E, P/S,
// next earnings date, and the last 5 quarters of revenue/gross profit/net income.
// Nothing else. No price series — the chart reuses /api/historical-prices.
//
// Server-side cache: 12h TTL keyed per symbol (quarterly data changes quarterly,
// not by the minute). The joined response is per-user and auth-gated → private,
// no-store so no CDN can leak it between users.

import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { fetchExternal } from '@/lib/externalFetch';
import { createCache } from '@/lib/successCache';
import { trackFMP } from '@/lib/apiUsage';
import { fetchPanelFundamentals, computePanelView } from '@/lib/watchlist/fundamentals';

export const dynamic = 'force-dynamic';

const FMP_BASE = 'https://financialmodelingprep.com';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const NO_STORE = { 'Cache-Control': 'private, no-store' };

// Module-memory 12h cache, keyed per (provider) symbol. Success-only: we never
// pin a total upstream outage (see cache-write guard below).
const panelCache = createCache(CACHE_TTL_MS);

// Injected JSON fetcher for the lib. Built on fetchExternal so EVERY failure is
// logged with a label — no silent swallowing. Returns parsed JSON or null.
function makeGetJson(symbol) {
  return async (path) => {
    const url = `${FMP_BASE}${path}${path.includes('?') ? '&' : '?'}apikey=${process.env.FMP_API_KEY}`;
    const endpoint = path.split('?')[0];
    const res = await fetchExternal(url, { label: `watchlist-fundamentals:${symbol}:${endpoint}` });
    return res.ok ? res.data : null;
  };
}

// A view has usable data if at least one core field resolved. Used to decide
// whether to cache (never pin an all-null outage for 12h) — a legitimately sparse
// symbol still passes as long as anything came back.
function hasUsableData(view) {
  return view.marketCap !== null
    || view.peRatio !== null
    || view.psRatio !== null
    || view.totalDebt !== null
    || view.cashAndEquivalents !== null
    || view.quarters.some(q => q.revenue !== null || q.netIncome !== null);
}

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });

  const symbolParam = (new URL(request.url).searchParams.get('symbol') || '').trim().toUpperCase();
  if (!symbolParam) {
    return Response.json({ error: 'Missing symbol' }, { status: 400, headers: NO_STORE });
  }
  // Strict enough to make the PostgREST .or() filter below injection-safe (no
  // commas/parens/quotes get through) while allowing real symbols (BRK.B, ticker
  // digits like 6479, FX like EURUSD).
  if (!/^[A-Z0-9.\-]{1,20}$/.test(symbolParam)) {
    return Response.json({ error: 'Invalid symbol' }, { status: 400, headers: NO_STORE });
  }

  if (!process.env.FMP_API_KEY) {
    console.error('[watchlist/fundamentals] FMP_API_KEY not configured');
    return Response.json({ error: 'FMP_API_KEY not configured' }, { status: 500, headers: NO_STORE });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500, headers: NO_STORE });

  // Resolve the provider symbol. Auth-only (no watchlist-membership gate): the screen
  // loads symbols outside the watchlist, and this is shared reference data. A watchlist
  // row, when present, maps display→provider symbol and honors the unresolved case;
  // otherwise the symbol is already a resolved provider ticker.
  const { data: rows, error } = await sb
    .from('watchlist_items')
    .select('provider_symbol, display_symbol, resolved, asset_class, exchange')
    .eq('user_id', userId)
    .or(`provider_symbol.eq.${symbolParam},display_symbol.eq.${symbolParam}`)
    .order('resolved', { ascending: false })
    .limit(1);

  if (error) {
    console.error(`[watchlist/fundamentals] symbol lookup failed for ${symbolParam}: ${error.message}`);
    return Response.json({ error: 'Failed to resolve symbol' }, { status: 500, headers: NO_STORE });
  }

  const row = rows?.[0];
  // Unresolved watchlist row (e.g. 6479): a clean no-data shape, not an error.
  if (row && (!row.resolved || !row.provider_symbol)) {
    return Response.json(
      { symbol: row.display_symbol || symbolParam, resolved: false, reason: 'no data on current plan' },
      { headers: NO_STORE },
    );
  }

  const provider = (row?.provider_symbol || symbolParam).toUpperCase();

  // 12h cache, keyed per symbol. A hit is logged (acceptance criterion).
  const cached = panelCache.get(provider);
  if (cached !== undefined) {
    console.log(`[watchlist/fundamentals] cache HIT ${provider} (age within 12h TTL)`);
    return Response.json({ ...cached, cached: true }, { headers: NO_STORE });
  }
  console.log(`[watchlist/fundamentals] cache MISS ${provider} — fetching from FMP`);

  try {
    const raw = await fetchPanelFundamentals(provider, makeGetJson(provider));
    const view = computePanelView(raw);
    trackFMP(5).catch(() => {}); // five light calls; telemetry only

    const payload = {
      symbol: provider,
      displaySymbol: row?.display_symbol ?? null,
      resolved: true,
      asOf: Date.now(),
      ...view,
    };

    // Success-only cache: don't pin a wholesale upstream outage for 12h. A sparse
    // (but real) symbol still caches; an all-null failure is logged and left uncached
    // so the next load retries.
    if (hasUsableData(view)) {
      panelCache.set(provider, payload);
    } else {
      console.error(`[watchlist/fundamentals] no usable data for ${provider} — not caching (upstream may be down)`);
    }

    return Response.json({ ...payload, cached: false }, { headers: NO_STORE });
  } catch (err) {
    console.error(`[watchlist/fundamentals] unexpected failure for ${provider}:`, err);
    return Response.json({ error: 'Failed to load fundamentals' }, { status: 500, headers: NO_STORE });
  }
}
