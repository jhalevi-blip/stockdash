import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { extractThemesForUser } from '@/lib/themeExtract';

// Extracts / reconciles a user's theme set from their saved worldview and writes
// it to user_themes. Auth-gated via Clerk, like user-settings. Gate 3: built and
// tested in isolation — NOT wired to the worldview save flow or any UI (Gate 4).
export const dynamic = 'force-dynamic';

const HOURLY_LIMIT = 5;

export async function POST() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  // Hybrid rate limit, mirroring stock-ai-summary: the middleware's in-memory
  // 60/min-per-IP limiter is the floor; this DB counter caps extractions at
  // 5/user/hour. Reuses the increment_ai_usage RPC (ai_usage table) with an
  // hour-scoped identity so the hourly bucket resets on its own and no new schema
  // is needed. Fails open on any Supabase error — a quota hiccup must not block a
  // legitimate extraction (the per-IP floor still applies).
  const now = new Date();
  const hourBucket = now.toISOString().slice(0, 13);      // YYYY-MM-DDTHH
  const identity = `theme-extract:user:${userId}:${hourBucket}`;
  const day = now.toISOString().slice(0, 10);             // YYYY-MM-DD (RPC's date arg)
  try {
    const { data: count, error } = await sb.rpc('increment_ai_usage', { p_identity: identity, p_day: day });
    if (error) {
      console.error('[theme-extract] rate-limit check failed, failing open:', error.message);
    } else if (typeof count === 'number' && count > HOURLY_LIMIT) {
      return Response.json(
        { error: 'Rate limit reached — max 5 extractions per hour.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }
  } catch (e) {
    console.error('[theme-extract] rate-limit check threw, failing open:', e);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ error: 'AI service unavailable' }, { status: 500 });

  try {
    const { active } = await extractThemesForUser(sb, userId, { apiKey });
    return Response.json({ themes: active }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    switch (e?.code) {
      case 'no_worldview':
        return Response.json({ error: e.message }, { status: 400 });
      case 'validation_failed':
        return Response.json({ error: 'generation_failed', message: e.message }, { status: 502 });
      case 'generation_failed':
        return Response.json({ error: 'generation_failed', message: e.message }, { status: 502 });
      case 'ai_unavailable':
        return Response.json({ error: 'AI service unavailable' }, { status: 500 });
      default:
        console.error('[theme-extract] unexpected error:', e);
        return Response.json({ error: e?.message ?? 'Internal error' }, { status: 500 });
    }
  }
}
