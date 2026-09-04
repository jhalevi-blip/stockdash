// /api/watchlist/peers?symbol=X — resolve and persist the financials-panel peer set
// for a symbol.
//   GET    -> { symbol, peers, source: 'override'|'finnhub' }
//   PUT    { symbol, peers:[...] } -> save the full curated list (source 'override')
//   DELETE ?symbol=X -> drop the override (revert to Finnhub live)
//
// Default peers come from Finnhub /stock/peers; once a user edits, the full list is
// persisted in watchlist_peer_overrides (migration 019). Auth-gated only — NOT
// watchlist-gated: the screen edits peers for symbols outside the watchlist. Overrides
// stay keyed by (user_id, symbol), so nothing leaks between users. A watchlist row,
// when present, maps display→provider symbol; otherwise the symbol is used as-is.

import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const SYM = /^[A-Z0-9.\-]{1,20}$/;
const MAX_PEERS = 8;

// Resolve a symbol to its provider symbol. Uses the caller's watchlist row for the
// display→provider mapping when present; otherwise falls back to the symbol itself
// (screen names are already resolved provider tickers).
async function resolveProviderSymbol(sb, userId, symbolParam) {
  const { data, error } = await sb
    .from('watchlist_items')
    .select('provider_symbol, display_symbol, resolved')
    .eq('user_id', userId)
    .or(`provider_symbol.eq.${symbolParam},display_symbol.eq.${symbolParam}`)
    .order('resolved', { ascending: false })
    .limit(1);
  if (error) return { error };
  const row = data?.[0];
  return { provider: (row?.provider_symbol || row?.display_symbol || symbolParam).toUpperCase() };
}

// Validate, upper-case, de-dup, drop the base, cap at MAX_PEERS.
function cleanPeers(arr, base) {
  const seen = new Set();
  const out = [];
  for (const t of (Array.isArray(arr) ? arr : [])) {
    const s = String(t ?? '').trim().toUpperCase();
    if (SYM.test(s) && s !== base && !seen.has(s)) { seen.add(s); out.push(s); }
    if (out.length >= MAX_PEERS) break;
  }
  return out;
}

async function finnhubPeers(base) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];
  try {
    const r = await fetch(`https://finnhub.io/api/v1/stock/peers?symbol=${base}&token=${key}`, { next: { revalidate: 86400 } });
    return cleanPeers(await r.json(), base);
  } catch { return []; }
}

async function resolveBase(sb, userId, symbolParam) {
  if (!SYM.test(symbolParam)) return { resp: Response.json({ error: 'Invalid symbol' }, { status: 400, headers: NO_STORE }) };
  const resolved = await resolveProviderSymbol(sb, userId, symbolParam);
  if (resolved.error) return { resp: Response.json({ error: 'Failed to resolve symbol' }, { status: 500, headers: NO_STORE }) };
  return { base: resolved.provider };
}

export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500, headers: NO_STORE });

  const symbolParam = (new URL(request.url).searchParams.get('symbol') || '').trim().toUpperCase();
  const owned = await resolveBase(sb, userId, symbolParam);
  if (owned.resp) return owned.resp;
  const { base } = owned;

  const { data: ovr, error: ovrErr } = await sb
    .from('watchlist_peer_overrides').select('peers').eq('user_id', userId).eq('symbol', base).limit(1);
  if (ovrErr) {
    console.error(`[watchlist/peers] override read failed for ${base}: ${ovrErr.message}`);
    return Response.json({ error: 'Failed to read peers' }, { status: 500, headers: NO_STORE });
  }
  if (ovr?.[0]) return Response.json({ symbol: base, peers: ovr[0].peers || [], source: 'override' }, { headers: NO_STORE });

  return Response.json({ symbol: base, peers: await finnhubPeers(base), source: 'finnhub' }, { headers: NO_STORE });
}

export async function PUT(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500, headers: NO_STORE });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE }); }
  const symbolParam = String(body?.symbol ?? '').trim().toUpperCase();
  const owned = await resolveBase(sb, userId, symbolParam);
  if (owned.resp) return owned.resp;
  const { base } = owned;

  const peers = cleanPeers(body?.peers, base);
  const { error } = await sb.from('watchlist_peer_overrides')
    .upsert({ user_id: userId, symbol: base, peers, updated_at: new Date().toISOString() }, { onConflict: 'user_id,symbol' });
  if (error) {
    console.error(`[watchlist/peers] save failed for ${base}: ${error.message}`);
    return Response.json({ error: 'Failed to save peers' }, { status: 500, headers: NO_STORE });
  }
  return Response.json({ ok: true, symbol: base, peers, source: 'override' }, { headers: NO_STORE });
}

export async function DELETE(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500, headers: NO_STORE });

  const symbolParam = (new URL(request.url).searchParams.get('symbol') || '').trim().toUpperCase();
  const owned = await resolveBase(sb, userId, symbolParam);
  if (owned.resp) return owned.resp;

  const { error } = await sb.from('watchlist_peer_overrides').delete().eq('user_id', userId).eq('symbol', owned.base);
  if (error) {
    console.error(`[watchlist/peers] reset failed for ${owned.base}: ${error.message}`);
    return Response.json({ error: 'Failed to reset peers' }, { status: 500, headers: NO_STORE });
  }
  return Response.json({ ok: true, symbol: owned.base }, { headers: NO_STORE });
}
