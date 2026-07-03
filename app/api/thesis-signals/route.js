import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Read-only endpoint backing the experimental "AI Thesis Signals" dashboard panel.
// Returns every thesis_signals row (the table is a small, curated universe).
// Written exclusively by /api/cron/thesis-signals; this route only reads.
export async function GET() {
  // Require sign-in — same gate as app/api/ai-summary/route.js.
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
