// Run this SQL in your Supabase dashboard before deploying:
//
// create table portfolios (
//   user_id    text        primary key,
//   holdings   jsonb       not null default '[]'::jsonb,
//   updated_at timestamptz not null default now()
// );

import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';

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

  return Response.json({ signedIn: true, holdings: data?.holdings ?? [] });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const { holdings } = await req.json();

  const { error } = await sb
    .from('portfolios')
    .upsert({ user_id: userId, holdings, updated_at: new Date().toISOString() });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
