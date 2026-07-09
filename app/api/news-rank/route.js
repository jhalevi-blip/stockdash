import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { THESES, THESIS_VERSION, DEFAULT_WORLDVIEW } from '@/app/(v2)/themes/_lib/theses';

// Ranks a batch of news articles by importance to ONE signed-in investor, given
// their worldview, the four fixed theses, and how their holdings map to them.
// Result is cached per-user in `news_rankings` with a 60-minute TTL (no per-call
// quota — the TTL bounds spend). No market-data calls, so nothing is tracked to
// Finnhub. Modeled on theme-classify (worldview + Supabase) and stock-quick-action
// (article formatting).
export const dynamic = 'force-dynamic';

const MAX_ARTICLES  = 100;
const SUMMARY_CHARS  = 200;
const WHY_CHARS      = 120;
const CACHE_TTL_MS   = 60 * 60 * 1000; // 60 min

function buildSystem(worldview, verdictLines) {
  const thesisBlocks = THESES.map(t => `- ${t.name} (${t.id}): ${t.view}`).join('\n');
  return `You rank financial news articles by how much they matter to ONE specific investor, judged against their macro worldview, a fixed set of theses, and how their holdings map to those theses.

The investor's worldview: ${worldview}

The four theses they invest around:
${thesisBlocks}

How the investor's holdings map to these theses (verdict per thesis — Benefits / Hurt / Neutral / Mixed):
${verdictLines || '(no per-holding classifications available)'}

Score each article 1-10 by importance to THIS investor. USE THE FULL 1-10 RANGE — scores must differentiate. If every article gets a similar score the ranking has failed its purpose; do not cluster everything around 5-6.

Anchor the scale:
- 9-10 = thesis-critical: could change an investment decision on a direct holding (major earnings surprise, guidance change, M&A, structural news for a core theme).
- 7-8 = materially relevant to a holding or one of the active theses.
- 4-6 = moderately relevant, worth awareness but not decision-moving.
- 1-3 = noise: aggregator listicles ("N stocks to buy now"), generic market commentary, and articles where the ticker is only incidentally mentioned. These score 1-3 REGARDLESS of ticker match.

Calibrate the distribution: at most ~20% of articles should score 8 or above. Weight articles about their holdings and their active theses far above generic market chatter, and reward articles that confirm, threaten, or inflect one of the theses — but a mere ticker match is not enough for a high score; the article must carry real, thesis-relevant substance.

Output STRICT JSON ONLY — no prose, no markdown, no code fences:
{"rankings":[{"id":"<article id>","score":<integer 1-10>,"why":"<one line, max ${WHY_CHARS} chars>"}]}
Include every article id from the user message exactly once. "why" must justify the score in terms of the investor's thesis or holdings.`;
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // ── Validate the article batch ────────────────────────────────────────────
  const rawArticles = Array.isArray(body?.articles) ? body.articles : null;
  if (!rawArticles || rawArticles.length === 0) {
    return Response.json({ error: 'articles must be a non-empty array' }, { status: 400 });
  }
  if (rawArticles.length > MAX_ARTICLES) {
    return Response.json({ error: `too many articles (max ${MAX_ARTICLES})` }, { status: 400 });
  }

  const articles = rawArticles
    .map(a => ({
      id:       a?.id != null ? String(a.id) : null,
      ticker:   typeof a?.ticker === 'string' ? a.ticker.toUpperCase().slice(0, 10) : '',
      headline: typeof a?.headline === 'string' ? a.headline.trim().slice(0, 300) : '',
      summary:  typeof a?.summary === 'string' ? a.summary.trim().slice(0, SUMMARY_CHARS) : '',
      source:   typeof a?.source === 'string' ? a.source.trim().slice(0, 60) : '',
    }))
    .filter(a => a.id && a.headline);

  if (!articles.length) {
    return Response.json({ error: 'no valid articles in payload' }, { status: 400 });
  }

  const force = body?.force === true;

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  // ── Cache read: fresh (<60 min) row wins unless force:true ─────────────────
  if (!force) {
    try {
      const { data: existing } = await sb
        .from('news_rankings')
        .select('ranking, created_at')
        .eq('user_id', userId)
        .single();
      if (existing?.created_at &&
          (Date.now() - new Date(existing.created_at).getTime()) < CACHE_TTL_MS) {
        return Response.json({
          rankings: Array.isArray(existing.ranking) ? existing.ranking : [],
          cached: true,
          rankedAt: existing.created_at,
        });
      }
    } catch { /* no cached row (PGRST116) or transient read error — fall through */ }
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'AI service unavailable' }, { status: 500 });

  // ── Server-side context (degrade gracefully) ──────────────────────────────
  let worldview = DEFAULT_WORLDVIEW;
  try {
    const { data } = await sb.from('user_settings').select('worldview').eq('user_id', userId).single();
    if (data?.worldview) worldview = data.worldview;
  } catch { /* fall back to DEFAULT_WORLDVIEW */ }

  const verdictsByTicker = {};
  try {
    const { data } = await sb
      .from('theme_classifications')
      .select('ticker, verdicts')
      .eq('user_id', userId)
      .eq('thesis_version', THESIS_VERSION);
    if (Array.isArray(data)) data.forEach(r => { verdictsByTicker[r.ticker] = r.verdicts; });
  } catch { /* verdicts optional */ }

  // Only include verdict lines for tickers that appear in this batch.
  const verdictLines = [...new Set(articles.map(a => a.ticker))]
    .filter(t => t && verdictsByTicker[t])
    .map(t => {
      const v = verdictsByTicker[t];
      const parts = THESES.map(th => `${th.name}=${v?.[th.id]?.verdict ?? '—'}`).join(', ');
      return `${t}: ${parts}`;
    })
    .join('\n');

  const userMessage = articles
    .map(a => `[${a.id}] ${a.ticker} — ${a.headline}${a.summary ? ` — ${a.summary}` : ''}${a.source ? ` — ${a.source}` : ''}`)
    .join('\n');

  // ── Single batched AI call ────────────────────────────────────────────────
  let res, raw;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 3000,
        system: buildSystem(worldview, verdictLines),
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    raw = await res.json();
  } catch {
    return Response.json({ error: 'generation_failed', message: 'Network error reaching AI service' }, { status: 500 });
  }

  if (!res.ok) {
    return Response.json({ error: 'generation_failed', message: raw?.error?.message ?? 'API error' }, { status: 500 });
  }

  // ── Defensive parse — malformed output is a hard 502, never half-parsed ────
  const text = raw?.content?.find(b => b.type === 'text')?.text ?? '';
  let parsed;
  try {
    let txt = text.trim();
    // Tolerate accidental ```json fences despite the strict-JSON instruction.
    if (txt.startsWith('```')) txt = txt.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    parsed = JSON.parse(txt);
  } catch {
    return Response.json({ error: 'bad_ai_output', message: 'AI returned malformed JSON' }, { status: 502 });
  }

  if (!parsed || !Array.isArray(parsed.rankings)) {
    return Response.json({ error: 'bad_ai_output', message: 'AI output missing rankings array' }, { status: 502 });
  }

  const rankings = parsed.rankings
    .filter(r => r && r.id != null && Number.isFinite(Number(r.score)))
    .map(r => ({
      id: String(r.id),
      score: Math.max(1, Math.min(10, Math.round(Number(r.score)))),
      why: typeof r.why === 'string' ? r.why.slice(0, WHY_CHARS) : '',
    }));

  if (!rankings.length) {
    return Response.json({ error: 'bad_ai_output', message: 'AI output contained no valid rankings' }, { status: 502 });
  }

  // ── Cache write (best-effort — never discard a paid-for ranking) ──────────
  const rankedAt = new Date().toISOString();
  try {
    await sb.from('news_rankings').upsert(
      { user_id: userId, ranking: rankings, article_ids: articles.map(a => a.id), created_at: rankedAt },
      { onConflict: 'user_id' },
    );
  } catch { /* cache write failed — still return the fresh ranking below */ }

  return Response.json({ rankings, cached: false, rankedAt });
}
