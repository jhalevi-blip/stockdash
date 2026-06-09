import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { trackFMP } from '@/lib/apiUsage';
import { fetchDailyCloses } from '@/lib/fmpHistory';
import {
  THESES, THESIS_VERSION, DEFAULT_WORLDVIEW, VERDICTS,
} from '@/app/(v2)/themes/_lib/theses';

// Discover Candidates: proposes ~10 liquid tickers across the cap spectrum that benefit from one
// thesis (excluding current holdings), each FMP-validated before display. Mirrors the
// Opus / forced-tool-use / error-handling pattern of theme-classify exactly.
export const dynamic = 'force-dynamic';

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

// Per-thesis verdict properties, built from THESES so the schema stays in sync.
const themeProps = {};
for (const t of THESES) {
  themeProps[t.id] = { type: 'string', enum: VERDICTS, description: `Verdict for the ${t.name} thesis` };
}

const candidatesTool = {
  name: 'propose_candidates',
  description: 'Propose liquid stocks across the market-cap spectrum that fit a macro thesis.',
  input_schema: {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          required: ['ticker', 'rationale', 'themes'],
          properties: {
            ticker:    { type: 'string', description: 'US-listed ticker symbol' },
            rationale: { type: 'string', description: 'One sentence, max ~20 words' },
            themes: {
              type: 'object',
              properties: themeProps,
              required: THESES.map(t => t.id),
            },
          },
        },
      },
    },
    required: ['candidates'],
  },
};

function buildSystem(thesis, worldview, exclude) {
  const excludeBlock = exclude.length
    ? `Exclude these tickers (already held): ${exclude.join(', ')}.`
    : 'There are no tickers to exclude.';

  return `You propose stock candidates for one fixed macro thesis in a worldview-driven portfolio dashboard.

Thesis — ${thesis.name}: ${thesis.view}

The user's worldview, which should tilt ambiguous calls: ${worldview}

Propose 10-12 liquid, publicly-traded tickers that would clearly BENEFIT from this thesis playing out, given the user's worldview. Spread them across the market-cap spectrum: include several mid-caps (roughly $2B-$50B) and one or two smaller but still liquid names alongside larger caps — explicitly avoid an all-mega-cap list. ${excludeBlock} Each candidate needs a one-line rationale in a concise, finance-literate voice — the same verdict style used elsewhere in the dashboard (max ~20 words, no hedging filler).

For each candidate, also assign a verdict for all four theses — ${THESES.map(t => t.name).join(', ')} — using only these values: ${VERDICTS.join(', ')}. Most candidates will not benefit from every thesis; Neutral and Mixed are expected and correct, so do not inflate everything to Benefits.`;
}

function buildWorldviewSystem(theses, worldview, exclude) {
  const excludeBlock = exclude.length
    ? `Exclude these tickers (already held): ${exclude.join(', ')}.`
    : 'There are no tickers to exclude.';

  const thesisBlock = theses.map(t => `${t.name}: ${t.view}`).join('\n');

  return `You propose stock candidates that fit an entire worldview in a worldview-driven portfolio dashboard.

The four fixed macro theses:
${thesisBlock}

The user's worldview, which ties these theses together: ${worldview}

Propose 10-12 liquid, publicly-traded tickers that are net beneficiaries of the worldview as a whole — each should benefit from two or more of the theses above and not be materially hurt by the others. Rank them by overall fit (best fit first). Spread them across the market-cap spectrum: include several mid-caps (roughly $2B-$50B) and one or two smaller but still liquid names alongside larger caps — explicitly avoid an all-mega-cap list. ${excludeBlock} Each candidate needs a one-line rationale in a concise, finance-literate voice — the same verdict style used elsewhere in the dashboard (max ~20 words, no hedging filler) — noting which theses it rides.

For each candidate, also assign a verdict for all four theses — ${theses.map(t => t.name).join(', ')} — using only these values: ${VERDICTS.join(', ')}. Most candidates will not benefit from every thesis; Neutral and Mixed are expected and correct, so do not inflate everything to Benefits.`;
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const thesisKey = typeof body.thesisKey === 'string' ? body.thesisKey : '';
  const regenerate = body.regenerate === true;
  const exclude = Array.isArray(body.exclude)
    ? body.exclude
        .filter(t => typeof t === 'string')
        .map(t => t.toUpperCase())
        .filter(t => TICKER_RE.test(t))
    : [];

  const isWorldview = thesisKey === '_worldview';
  const thesis = THESES.find(t => t.id === thesisKey);
  if (!isWorldview && !thesis) return Response.json({ error: 'Invalid thesisKey' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const now = new Date().toISOString();
  const excludeSet = new Set(exclude);

  // ── Cache-first ────────────────────────────────────────────────────────────
  if (!regenerate) {
    try {
      const { data } = await sb
        .from('theme_candidates')
        .select('candidates')
        .eq('user_id', userId)
        .eq('thesis_key', thesisKey)
        .eq('thesis_version', THESIS_VERSION)
        .single();
      if (data?.candidates) {
        return Response.json({ thesisKey, candidates: data.candidates, source: 'cache' });
      }
    } catch {}
  }

  // ── Model path ──────────────────────────────────────────────────────────────
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'AI service unavailable' }, { status: 500 });

  // Fetch the user's worldview to tilt ambiguous calls (fallback to default).
  let worldview = DEFAULT_WORLDVIEW;
  try {
    const { data } = await sb.from('user_settings').select('worldview').eq('user_id', userId).single();
    if (data?.worldview) worldview = data.worldview;
  } catch {}

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
        max_tokens: 2000,
        system: isWorldview
          ? buildWorldviewSystem(THESES, worldview, exclude)
          : buildSystem(thesis, worldview, exclude),
        tools: [candidatesTool],
        tool_choice: { type: 'tool', name: 'propose_candidates' },
        messages: [{ role: 'user', content: isWorldview
          ? 'Propose candidates across the full worldview.'
          : `Propose candidates for the ${thesis.name} thesis.` }],
      }),
    });
    raw = await res.json();
  } catch {
    return Response.json({ error: 'generation_failed', message: 'Network error reaching AI service' }, { status: 500 });
  }

  if (!res.ok) {
    return Response.json({ error: 'generation_failed', message: raw.error?.message ?? 'API error' }, { status: 500 });
  }

  const toolUse = raw.content?.find(b => b.type === 'tool_use');
  if (!toolUse?.input) {
    return Response.json({ error: 'generation_failed', message: 'No structured output from AI' }, { status: 500 });
  }

  const proposed = toolUse.input.candidates;
  if (!Array.isArray(proposed) || proposed.length === 0) {
    return Response.json({ error: 'generation_failed', message: 'No candidates in output' }, { status: 500 });
  }

  // Normalize: uppercase, validate shape, dedupe, drop excluded holdings defensively.
  const seen = new Set();
  const cleaned = [];
  for (const c of proposed) {
    if (!c || typeof c.ticker !== 'string' || typeof c.rationale !== 'string') continue;
    const ticker = c.ticker.toUpperCase();
    if (!TICKER_RE.test(ticker) || excludeSet.has(ticker) || seen.has(ticker)) continue;
    seen.add(ticker);
    // Build a complete, valid verdict object — default to Neutral for anything missing/invalid.
    const themes = {};
    for (const t of THESES) {
      themes[t.id] = VERDICTS.includes(c.themes?.[t.id]) ? c.themes[t.id] : 'Neutral';
    }
    cleaned.push({ ticker, rationale: c.rationale, themes });
  }

  if (cleaned.length === 0) {
    return Response.json({ error: 'generation_failed', message: 'No valid candidates after filtering' }, { status: 500 });
  }

  // ── FMP validation + enrichment (profile) ────────────────────────────────────
  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return Response.json({ error: 'FMP_API_KEY not configured' }, { status: 500 });

  trackFMP(cleaned.length).catch(() => {});

  const enriched = await Promise.all(
    cleaned.map(async c => {
      try {
        const url = `https://financialmodelingprep.com/stable/profile?symbol=${c.ticker}&apikey=${fmpKey}`;
        const r = await fetch(url, { next: { revalidate: 86400 } });
        if (!r.ok) return null;
        const json = await r.json();
        const d = Array.isArray(json) ? json[0] : json;
        const sector = d?.sector;
        if (!sector) return null; // doesn't exist / unusable — drop silently
        return {
          ticker:      c.ticker,
          companyName: d?.companyName ?? null,
          sector,
          marketCap:   d?.marketCap ?? null, // keep candidate even if missing
          rationale:   c.rationale,
          themes:      c.themes,
        };
      } catch {
        return null;
      }
    })
  );

  const survivors = enriched.filter(Boolean);
  if (survivors.length === 0) {
    return Response.json({ error: 'generation_failed', message: 'No candidates survived FMP validation' }, { status: 500 });
  }

  // ── 12-month return (fetchDailyCloses tracks its own FMP usage) ───────────────
  const { seriesBySymbol } = await fetchDailyCloses(survivors.map(s => s.ticker), 1);

  const candidates = survivors.map(s => {
    const prices = seriesBySymbol[s.ticker];
    let return12m = null;
    if (Array.isArray(prices) && prices.length >= 2) {
      const first = prices[0].close;
      const last = prices[prices.length - 1].close;
      if (first) return12m = (last - first) / first;
    }
    return { ...s, return12m };
  });

  // ── Persist + return ──────────────────────────────────────────────────────────
  const { error } = await sb.from('theme_candidates').upsert(
    { user_id: userId, thesis_key: thesisKey, thesis_version: THESIS_VERSION, candidates, computed_at: now },
    { onConflict: 'user_id,thesis_key,thesis_version' },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ thesisKey, candidates, source: 'model' });
}
