import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Read-only endpoint backing the experimental "AI Thesis Signals" dashboard panel.
// Returns every thesis_signals row (the table is a small, curated universe).
// Written exclusively by /api/cron/thesis-signals; this route only reads.
//
// Intentionally UNAUTHENTICATED: every row is derived from public SEC filings for a
// fixed, hardcoded ticker universe — nothing here is user-specific or private. The
// panel renders on the dashboard for signed-out visitors too, so gating this behind
// Clerk would 401 anonymous viewers for no security benefit. Reads still require the
// service-role client because the table has RLS enabled with no public policies.
export async function GET() {
  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Database unavailable' }, { status: 500 });

  const { data, error } = await sb
    .from('thesis_signals')
    .select('signal_key, ticker, status, value_numeric, value_text, source_url, filing_date, checked_at')
    .order('signal_key', { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(
    { signals: data ?? [] },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
