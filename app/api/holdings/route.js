import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// user-specific data — must not be edge-cached
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) {
    console.error('[holdings GET] Supabase admin client not initialized — check SUPABASE_SECRET_KEY');
    return Response.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { data, error } = await sb
    .from('holdings')
    .select('ticker, shares, avg_cost')
    .eq('user_id', userId)
    .order('created_at');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? [], {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(req) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    console.error('[holdings POST] Supabase admin client is null — SUPABASE_SECRET_KEY length:', process.env.SUPABASE_SECRET_KEY?.length ?? 0);
    return Response.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await req.json();
  const incoming = body.holdings ?? [];

  // Delete all existing rows for this user
  const { error: delError } = await sb
    .from('holdings')
    .delete()
    .eq('user_id', userId);

  if (delError) {
    console.error('[holdings POST] delete failed:', delError);
    return Response.json({ error: delError.message }, { status: 500 });
  }

  if (incoming.length) {
    const rows = incoming.map(h => ({
      user_id:  userId,
      ticker:   h.t,
      shares:   h.s,
      avg_cost: h.c,
    }));
    const { data, error: insError } = await sb.from('holdings').insert(rows).select();
    if (insError) {
      console.error('[holdings POST] insert failed:', insError);
      return Response.json({ error: insError.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
