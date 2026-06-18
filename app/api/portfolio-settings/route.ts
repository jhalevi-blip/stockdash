import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';

// user-specific data — must not be edge-cached
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Settings-only write to the portfolios table. The payload deliberately omits
// `holdings`, so an existing row's holdings are left untouched by the upsert.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const body = await req.json();
  const src = body && typeof body === 'object' ? body : {};

  // Whitelist + type-validate. user_id is never read from the body — it comes
  // from the session above. Unknown keys and wrong-typed values are dropped.
  const cleaned: Record<string, unknown> = {};
  if (typeof src.startDate === 'string') cleaned.startDate = src.startDate;
  if (typeof src.startingCash === 'number' && Number.isFinite(src.startingCash)) {
    cleaned.startingCash = src.startingCash;
  }
  if (src.cashCurrency === 'EUR' || src.cashCurrency === 'USD') {
    cleaned.cashCurrency = src.cashCurrency;
  }

  const { error } = await sb
    .from('portfolios')
    .upsert(
      { user_id: userId, settings: cleaned, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
