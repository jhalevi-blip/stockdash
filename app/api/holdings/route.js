import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const { userId } = await auth();
  console.log('[holdings GET] userId:', userId);
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

  console.log('[holdings GET] rows returned:', data?.length ?? 0, '| error:', error?.message ?? null);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(req) {
  const { userId } = await auth();
  console.log('[holdings POST] ===== START =====');
  console.log('[holdings POST] userId:', userId);

  if (!userId) {
    console.warn('[holdings POST] No userId — Clerk session missing or cookie rejected');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    console.error('[holdings POST] Supabase admin client is null — SUPABASE_SECRET_KEY length:', process.env.SUPABASE_SECRET_KEY?.length ?? 0);
    return Response.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  console.log('[holdings POST] Supabase client initialized OK');

  const body = await req.json();
  const incoming = body.holdings ?? [];
  console.log('[holdings POST] incoming holdings count:', incoming.length, JSON.stringify(incoming));

  // Delete all existing rows for this user
  const { error: delError, count: delCount } = await sb
    .from('holdings')
    .delete()
    .eq('user_id', userId);

  console.log('[holdings POST] delete — rows affected:', delCount, '| error:', delError?.message ?? null);

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
    console.log('[holdings POST] inserting rows:', JSON.stringify(rows));
    const { data, error: insError } = await sb.from('holdings').insert(rows).select();
    console.log('[holdings POST] insert — rows inserted:', data?.length ?? 0, '| error:', insError?.message ?? null);
    if (insError) {
      console.error('[holdings POST] insert failed:', insError);
      return Response.json({ error: insError.message }, { status: 500 });
    }
  }

  console.log('[holdings POST] ===== DONE =====');
  return Response.json({ ok: true });
}
