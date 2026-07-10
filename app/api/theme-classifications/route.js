import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getOrSeedUserThemes, activeThemeFingerprint } from '@/lib/userThemes';

// Returns the user's cached theme classifications for the CURRENT active theme set.
// Rows stamped with a different theme-set fingerprint (i.e. classified before the
// themes changed) are excluded — the ticker then reads as unclassified, which the
// "re-score to apply" UX already handles.
export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const themes = await getOrSeedUserThemes(sb, userId);
  const fingerprint = activeThemeFingerprint(themes);

  const { data, error } = await sb
    .from('theme_classifications')
    .select('ticker, verdicts')
    .eq('user_id', userId)
    .eq('thesis_version', fingerprint);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const classifications = (data ?? []).map(r => ({ ticker: r.ticker, verdicts: r.verdicts }));
  return Response.json({ classifications }, { headers: { 'Cache-Control': 'no-store' } });
}
