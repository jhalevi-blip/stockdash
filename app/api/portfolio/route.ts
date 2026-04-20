// Run this SQL in your Supabase dashboard before deploying:
//
// create table portfolios (
//   user_id    text        primary key,
//   holdings   jsonb       not null default '[]'::jsonb,
//   updated_at timestamptz not null default now()
// );

import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// user-specific data — must not be edge-cached
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ signedIn: false, holdings: [] });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const { data, error } = await sb
    .from('portfolios')
    .select('holdings')
    .eq('user_id', userId)
    .single();

  // PGRST116 = row not found — first time user, return empty
  if (error && error.code !== 'PGRST116') {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const raw: any[] = Array.isArray(data?.holdings) ? data.holdings : [];
  const cashEntry  = raw.find((h: any) => h?.t === '__CASH__') ?? null;
  const holdings   = raw.filter((h: any) => h?.t !== '__CASH__');
  const cash = cashEntry ? { amount: cashEntry.amount, currency: cashEntry.currency ?? 'USD' } : null;

  return Response.json({ signedIn: true, holdings, cash });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const { holdings, cash } = await req.json();
  const toStore = Array.isArray(holdings) ? [...holdings] : [];
  if (cash?.amount > 0) {
    toStore.push({ t: '__CASH__', amount: cash.amount, currency: cash.currency ?? 'USD' });
  }

  const { error } = await sb
    .from('portfolios')
    .upsert({ user_id: userId, holdings: toStore, updated_at: new Date().toISOString() });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
