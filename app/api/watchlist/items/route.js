// NOTE: this POST body is snake_case (display_symbol, asset_class, section_id), while
// GET /api/watchlist/quotes serialises camelCase (displaySymbol, targetPrice) — a
// follow-up branch should reconcile the two before the add/remove UI is wired.
import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { resolveSymbol } from '@/lib/watchlist/resolveSymbol';

// POST /api/watchlist/items — add a symbol to an existing section.
// Clerk auth + service-role Supabase, scoped to the caller's own rows.
//
// Add semantics (spec: revive-over-insert):
//   • If a SOFT-DELETED row exists for this (user_id, display_symbol, asset_class),
//     revive it — clear deleted_at and keep its target_price / thesis / role /
//     provider_symbol — rather than inserting a duplicate. It re-files into the
//     section the caller chose (new section_id + append sort_order).
//   • If a LIVE row already exists → 409 (it's already in the watchlist).
//   • Otherwise resolve the symbol once (lib/watchlist/resolveSymbol) and insert.
//     A clean "no coverage on this plan" is NOT an error: the row is inserted
//     resolved=false / provider_symbol=null (greyed in the UI, same as 6479). A
//     resolution CALL failure (network/HTTP) DOES error (502) and inserts nothing,
//     so a transient failure is never buried as a false "no coverage".
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const ROLES = new Set(['candidate', 'theme', 'macro']);
const ASSET_CLASSES = new Set(['equity', 'fx']);

// Reused from the PATCH whitelist: target_price is a non-negative number or null.
function parseTargetPrice(v) {
  if (v === undefined) return { ok: true, val: null };
  if (v === null || v === '') return { ok: true, val: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return { ok: false, msg: 'target_price must be a non-negative number or null' };
  return { ok: true, val: n };
}

function parseThesis(v) {
  if (v === undefined || v === null) return { ok: true, val: null };
  if (typeof v !== 'string') return { ok: false, msg: 'thesis must be a string or null' };
  const trimmed = v.trim();
  if (trimmed.length > 2000) return { ok: false, msg: 'thesis must be at most 2000 characters' };
  return { ok: true, val: trimmed === '' ? null : trimmed };
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // ── Validate input ──────────────────────────────────────────────────────────
  const displaySymbol = typeof body.display_symbol === 'string' ? body.display_symbol.trim().toUpperCase() : '';
  if (!displaySymbol) return Response.json({ error: 'display_symbol is required' }, { status: 400 });

  const assetClass = body.asset_class;
  if (!ASSET_CLASSES.has(assetClass)) {
    return Response.json({ error: "asset_class must be 'equity' or 'fx'" }, { status: 400 });
  }

  const sectionId = body.section_id;
  if (!sectionId) return Response.json({ error: 'section_id is required' }, { status: 400 });

  const role = body.role === undefined ? 'candidate' : body.role;
  if (!ROLES.has(role)) {
    return Response.json({ error: "role must be 'candidate', 'theme' or 'macro'" }, { status: 400 });
  }

  const tp = parseTargetPrice(body.target_price);
  if (!tp.ok) return Response.json({ error: tp.msg }, { status: 400 });
  const th = parseThesis(body.thesis);
  if (!th.ok) return Response.json({ error: th.msg }, { status: 400 });
  const themeSlug = typeof body.theme_slug === 'string' && body.theme_slug.trim() ? body.theme_slug.trim() : null;

  // ── The section must exist and belong to the caller (sections are fixed here) ─
  const secRes = await sb
    .from('watchlist_sections')
    .select('id')
    .eq('id', sectionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (secRes.error) return Response.json({ error: secRes.error.message }, { status: 500 });
  if (!secRes.data) return Response.json({ error: 'Unknown section' }, { status: 400 });

  // ── Existing rows for this symbol, INCLUDING soft-deleted ones ────────────────
  // Case-insensitive (matches the partial unique index on lower(display_symbol)).
  // ilike is safe here: tickers are alphanumeric + '.'/'-', no % or _ wildcards.
  const existRes = await sb
    .from('watchlist_items')
    .select('*')
    .eq('user_id', userId)
    .eq('asset_class', assetClass)
    .ilike('display_symbol', displaySymbol)
    .order('created_at', { ascending: false });
  if (existRes.error) return Response.json({ error: existRes.error.message }, { status: 500 });

  const rows = existRes.data ?? [];
  if (rows.some(r => r.deleted_at == null)) {
    return Response.json({ error: `${displaySymbol} is already in your watchlist` }, { status: 409 });
  }

  // Append position within the target section (live rows only).
  const posRes = await sb
    .from('watchlist_items')
    .select('sort_order')
    .eq('user_id', userId)
    .eq('section_id', sectionId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (posRes.error) return Response.json({ error: posRes.error.message }, { status: 500 });
  const nextSort = (posRes.data?.[0]?.sort_order ?? -1) + 1;

  // ── Revive the most-recent soft-deleted row, keeping its curated fields ───────
  const deleted = rows[0]; // ordered created_at desc; a live row was ruled out above
  if (deleted) {
    const { data, error } = await sb
      .from('watchlist_items')
      .update({ deleted_at: null, section_id: sectionId, sort_order: nextSort })
      .eq('id', deleted.id)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ item: data, revived: true }, { status: 200, headers: NO_STORE });
  }

  // ── No prior row: resolve once, then insert ───────────────────────────────────
  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return Response.json({ error: 'FMP_API_KEY not configured' }, { status: 500 });

  const r = await resolveSymbol({ displaySymbol, assetClass, fmpKey });
  if (r.error) {
    // Resolution CALL failed (network/HTTP) — NOT the same as "no coverage".
    // Insert nothing so a transient failure is never persisted as a false unresolved.
    return Response.json({ error: `Symbol resolution failed, please retry: ${r.error}` }, { status: 502 });
  }

  const row = {
    user_id: userId,
    section_id: sectionId,
    display_symbol: displaySymbol,
    provider_symbol: r.providerSymbol, // null when unresolved — never guessed
    asset_class: assetClass,
    exchange: r.resolved ? r.exchange : null,
    resolved: r.resolved,
    role,
    origin: 'manual',
    target_price: tp.val,
    theme_slug: themeSlug,
    thesis: th.val,
    sort_order: nextSort,
  };

  const { data, error } = await sb.from('watchlist_items').insert(row).select('*').single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ item: data, revived: false }, { status: 201, headers: NO_STORE });
}
