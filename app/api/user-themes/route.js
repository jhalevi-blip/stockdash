import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getOrSeedUserThemes } from '@/lib/userThemes';

// Returns the signed-in user's ACTIVE themes (priority order), lazy-seeding the
// four defaults on first touch. Dedicated endpoint rather than folding into
// user-settings/theme-classifications: those carry different shapes (worldview /
// verdicts), and the themes page needs to refresh this set independently after a
// worldview save + extraction. no-store: per-user, auth-gated data.
export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const themes = await getOrSeedUserThemes(sb, userId);
  return Response.json({ themes }, { headers: { 'Cache-Control': 'no-store' } });
}
