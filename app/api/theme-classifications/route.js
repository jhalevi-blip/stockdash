import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { THESIS_VERSION } from '@/app/(v2)/themes/_lib/theses';

// Returns the user's cached theme classifications for the current thesis version.
export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const { data, error } = await sb
    .from('theme_classifications')
    .select('ticker, verdicts')
    .eq('user_id', userId)
    .eq('thesis_version', THESIS_VERSION);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const classifications = (data ?? []).map(r => ({ ticker: r.ticker, verdicts: r.verdicts }));
  return Response.json({ classifications });
}
