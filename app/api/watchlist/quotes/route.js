import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getQuotesForGroup } from '@/lib/watchlist/quotes';
import { getSessions } from '@/lib/watchlist/sessions';
import { trackFMP } from '@/lib/apiUsage';

// GET /api/watchlist/quotes — the signed-in user's watchlist, joined with live
// quotes (spec §4). The quote data is cached (bounded upstream calls); the joined
// payload below is per-user and is NEVER cached: private, no-store.
export const dynamic = 'force-dynamic';

// Section-level column set follows the role of its rows (spec: "the table shows and
// hides columns off this field"). Sections are role-homogeneous by construction, so
// we take the modal role of the section's items and default to 'candidate'.
function sectionRole(items) {
  const counts = {};
  for (const it of items) counts[it.role] = (counts[it.role] || 0) + 1;
  let best = 'candidate', n = -1;
  for (const [role, c] of Object.entries(counts)) if (c > n) { best = role; n = c; }
  return best;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return Response.json({ error: 'FMP_API_KEY not configured' }, { status: 500 });

  // Load sections + items fresh (per-user; not cacheable). Both errors surface.
  const [secRes, itemRes] = await Promise.all([
    sb.from('watchlist_sections').select('*').eq('user_id', userId).order('sort_order', { ascending: true }),
    sb.from('watchlist_items').select('*').eq('user_id', userId).order('sort_order', { ascending: true }),
  ]);
  if (secRes.error) {
    return Response.json({ error: `Failed to load sections: ${secRes.error.message}` }, { status: 500 });
  }
  if (itemRes.error) {
    return Response.json({ error: `Failed to load items: ${itemRes.error.message}` }, { status: 500 });
  }
  const sections = secRes.data ?? [];
  const items = itemRes.data ?? [];

  // Distinct resolved symbols, split by asset class → two groups (spec §4).
  const equitySymbols = [...new Set(
    items.filter(i => i.resolved && i.provider_symbol && i.asset_class === 'equity').map(i => i.provider_symbol),
  )];
  const fxSymbols = [...new Set(
    items.filter(i => i.resolved && i.provider_symbol && i.asset_class === 'fx').map(i => i.provider_symbol),
  )];

  const [equity, fx] = await Promise.all([
    getQuotesForGroup(equitySymbols, { fmpKey, label: 'watchlist-quotes-equity' }),
    getQuotesForGroup(fxSymbols, { fmpKey, label: 'watchlist-quotes-fx' }),
  ]);

  const upstreamCalls = equity.upstreamCalls + fx.upstreamCalls;
  // Fire-and-forget usage meter — telemetry only, same pattern as other FMP routes.
  if (upstreamCalls > 0) trackFMP(upstreamCalls).catch(() => {});

  const quoteFor = (it) => {
    if (!it.resolved || !it.provider_symbol) {
      return { status: 'unresolved', label: it.exchange ? `no data on current plan (${it.exchange})` : 'no data on current plan' };
    }
    const map = it.asset_class === 'fx' ? fx.quotes : equity.quotes;
    const q = map[it.provider_symbol];
    if (!q) return { status: 'error', error: 'no quote' };
    if (q.error) return { status: 'error', error: q.error };
    return { status: 'ok', ...q };
  };

  const toItem = (it) => ({
    id: it.id,
    displaySymbol: it.display_symbol,
    providerSymbol: it.provider_symbol,
    assetClass: it.asset_class,
    exchange: it.exchange,
    resolved: it.resolved,
    role: it.role,
    origin: it.origin,
    targetPrice: it.target_price,
    themeSlug: it.theme_slug,
    thesis: it.thesis,
    quote: quoteFor(it),
  });

  // Bucket items into their section; anything without a (known) section_id goes to
  // a synthetic "Ungrouped" so a row can never silently disappear.
  const byId = new Map(sections.map(s => [s.id, { id: s.id, name: s.name, sortOrder: s.sort_order, items: [] }]));
  const ungrouped = { id: null, name: 'Ungrouped', sortOrder: Number.MAX_SAFE_INTEGER, items: [] };
  for (const it of items) {
    const bucket = (it.section_id && byId.get(it.section_id)) || ungrouped;
    bucket.items.push(toItem(it));
  }

  const joined = [...byId.values()];
  if (ungrouped.items.length) joined.push(ungrouped);
  joined.sort((a, b) => a.sortOrder - b.sortOrder);
  for (const s of joined) s.role = sectionRole(s.items);

  return Response.json(
    { sections: joined, markets: getSessions(), generatedAt: Date.now() },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
