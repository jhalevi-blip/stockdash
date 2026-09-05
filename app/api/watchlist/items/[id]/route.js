import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// PATCH /api/watchlist/items/[id] — inline edits from the watchlist table.
// Clerk auth + service-role Supabase, scoped to the caller's own rows. Only a
// whitelist of user-editable fields is accepted; unknown keys are ignored so this
// can never become an arbitrary column write.
export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const { id } = await params; // Next 16: params is async
  if (!id) return Response.json({ error: 'Missing item id' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Build the update from the whitelist only.
  const patch = {};

  if ('target_price' in body) {
    const v = body.target_price;
    if (v === null || v === '') {
      patch.target_price = null; // clear
    } else {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        return Response.json({ error: 'target_price must be a non-negative number or null' }, { status: 400 });
      }
      patch.target_price = n;
    }
  }

  if ('thesis' in body) {
    const v = body.thesis;
    if (v === null) {
      patch.thesis = null;
    } else if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed.length > 2000) {
        return Response.json({ error: 'thesis must be at most 2000 characters' }, { status: 400 });
      }
      patch.thesis = trimmed === '' ? null : trimmed;
    } else {
      return Response.json({ error: 'thesis must be a string or null' }, { status: 400 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: 'No editable fields provided (allowed: target_price, thesis)' }, { status: 400 });
  }

  // Scope the write to the caller's own row. .select() lets us tell "not found /
  // not yours" (0 rows) apart from a DB error.
  const { data, error } = await sb
    .from('watchlist_items')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null) // never edit a soft-deleted row
    .select('id, target_price, thesis, role')
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'Item not found' }, { status: 404 });

  return Response.json({ item: data }, { headers: { 'Cache-Control': 'no-store' } });
}

// DELETE /api/watchlist/items/[id] — soft-delete. Sets deleted_at; the row is NEVER
// hard-deleted, so re-adding the same symbol revives this row with its target_price,
// thesis, etc. intact (see POST /api/watchlist/items).
//
// price_alerts is left untouched on purpose: the alerts cron filters items on
// `deleted_at is null`, so a removed item stops being checked and its alert row goes
// inert. We keep the row rather than delete it because a later revive restores the
// old target_price — reactivating that same (item_id, direction) alert ledger, armed
// exactly as it was before removal.
export async function DELETE(request, { params }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const { id } = await params; // Next 16: params is async
  if (!id) return Response.json({ error: 'Missing item id' }, { status: 400 });

  // Scope to the caller's own, still-live row. .select() distinguishes "not found /
  // not yours / already removed" (0 rows) from a DB error. Idempotent-safe: a second
  // delete simply matches nothing and returns 404.
  const { data, error } = await sb
    .from('watchlist_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'Item not found' }, { status: 404 });

  return Response.json({ id: data.id, deleted: true }, { headers: { 'Cache-Control': 'no-store' } });
}
