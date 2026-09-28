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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry the read ONCE, only for transient failures: network/timeout, a 5xx from
// the data API, or the cold-start clock-skew "JWT issued at future". Never retry
// auth/permission errors or PGRST116 (row-not-found). Reads only.
function isTransientReadError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message ?? err).toLowerCase();
  // clock skew at cold start (e.g. a host clock running slightly ahead) — retryable
  if (msg.includes('issued at future')) return true;
  // network failure / timeout thrown by the fetch layer
  if (err.name === 'AbortError' || err.name === 'TypeError') return true;
  if (/fetch failed|network|timeout|econnreset|socket hang|und_err/.test(msg)) return true;
  // 5xx from the data API / gateway (string codes like PGRST116 → NaN, ignored)
  const status = Number(err.status ?? err.statusCode);
  if (status >= 500 && status <= 599) return true;
  return false;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ signedIn: false, holdings: [] }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const runRead = () => sb
    .from('portfolios')
    .select('holdings, settings')
    .eq('user_id', userId)
    .single();

  let res: Awaited<ReturnType<typeof runRead>>;
  try {
    res = await runRead();
  } catch (e) {
    res = { data: null, error: e } as any;
  }
  if (res.error && res.error.code !== 'PGRST116' && isTransientReadError(res.error)) {
    console.warn('[portfolio] transient read error — retrying once after 300ms:', res.error?.message);
    await sleep(300);
    try {
      res = await runRead();
    } catch (e) {
      res = { data: null, error: e } as any;
    }
  }
  const { data, error } = res;

  // PGRST116 = row not found — first time user, return empty
  if (error && error.code !== 'PGRST116') {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const raw: any[] = Array.isArray(data?.holdings) ? data.holdings : [];
  const cashEntry  = raw.find((h: any) => h?.t === '__CASH__') ?? null;
  const holdings   = raw.filter((h: any) => h?.t !== '__CASH__');
  const cash = cashEntry ? { amount: cashEntry.amount, currency: cashEntry.currency ?? 'USD' } : null;

  return Response.json({ signedIn: true, holdings, cash, settings: data?.settings ?? {} }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
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

  return Response.json({ ok: true }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
