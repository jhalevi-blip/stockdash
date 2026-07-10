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

  // no-store: this is per-user, auth-gated data. Prevents any shared/CDN cache
  // (e.g. the next.config header rules) from serving one user's worldview to
  // another, or serving a stale value after a save. Matches theme-classifications.
  return Response.json(
    { worldview: data?.worldview ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
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
    .upsert(
      { user_id: userId, worldview, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // The worldview feeds the theme candidate + classification prompts, but both
  // are cached per-user with no worldview component in the cache key. Drop the
  // user's cached rows so the next generation re-reads the new worldview.
  // Best-effort: a failed invalidation is logged, not fatal — the save the user
  // just made has already succeeded and must still be reported as such.
  const [candDel, classDel] = await Promise.all([
    sb.from('theme_candidates').delete().eq('user_id', userId),
    sb.from('theme_classifications').delete().eq('user_id', userId),
  ]);
  if (candDel.error) console.error('[user-settings] theme_candidates invalidation failed:', candDel.error.message);
  if (classDel.error) console.error('[user-settings] theme_classifications invalidation failed:', classDel.error.message);

  return Response.json({ worldview });
}
