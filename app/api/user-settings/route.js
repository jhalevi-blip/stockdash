import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// Per-user worldview sentence for /themes. Clerk auth + service-role Supabase,
// mirroring the portfolios route pattern. RLS-protected (service-role bypasses).
export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const { data, error } = await sb
    .from('user_settings')
    .select('worldview')
    .eq('user_id', userId)
    .single();

  // PGRST116 = row not found — first-time user, no worldview saved yet
  if (error && error.code !== 'PGRST116') {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ worldview: data?.worldview ?? null });
}

export async function PUT(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const body = await request.json();
  const worldview = typeof body.worldview === 'string' ? body.worldview.trim() : '';
  if (!worldview || worldview.length > 300) {
    return Response.json({ error: 'worldview must be a non-empty string of at most 300 characters' }, { status: 400 });
  }

  const { error } = await sb
    .from('user_settings')
    .upsert({ user_id: userId, worldview, updated_at: new Date().toISOString() });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ worldview });
}
