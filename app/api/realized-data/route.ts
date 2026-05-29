import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// user-specific data — must not be edge-cached
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ signedIn: false, transactions: null }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const { data, error } = await sb
    .from('portfolio_transactions')
    .select('data')
    .eq('user_id', userId)
    .single();

  // PGRST116 = row not found — first time user, no data yet
  if (error && error.code !== 'PGRST116') {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ signedIn: true, transactions: data?.data ?? null }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const { transactions } = await req.json();
  if (!transactions) return Response.json({ error: 'Missing transactions' }, { status: 400 });

  // Strip debug traces before persisting
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(transactions)) {
    if (!key.startsWith('_debug')) cleaned[key] = value;
  }

  const { error } = await sb
    .from('portfolio_transactions')
    .upsert({ user_id: userId, data: cleaned, updated_at: new Date().toISOString() });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
