import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getOrSeedUserThemes, activeThemeFingerprint, isPristineDefaultSet } from '@/lib/userThemes';
import { CALIBRATION, DEFAULT_WORLDVIEW, VERDICTS } from '@/app/(v2)/themes/_lib/theses';

// Scores one ticker against the user's macro themes (user_themes). Scoring guidance
// comes from each theme's own `guidance` column. The portfolio-owner calibration map
// applies ONLY when the user still has the untouched four defaults; once themes are
// edited/extracted it is omitted. Forced tool use, error pattern from stock-ai-summary.
export const dynamic = 'force-dynamic';

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

// Generic per-theme verdict shape; the tool's property set is built per request.
const thesisProp = {
  type: 'object',
  required: ['verdict', 'rationale'],
  properties: {
    verdict:   { type: 'string', enum: ['Benefits', 'Hurt', 'Neutral', 'Mixed'] },
    rationale: { type: 'string', description: 'One sentence, max ~20 words' },
  },
};

function buildClassifyTool(themes) {
  const properties = {};
  for (const t of themes) properties[t.theme_id] = thesisProp;
  return {
    name: 'classify_against_theses',
    description: "Score one stock against the user's macro themes.",
    input_schema: {
      type: 'object',
      properties,
      required: themes.map(t => t.theme_id),
    },
  };
}

function buildSystem(worldview, themes, includeCalibration) {
  const thesisBlocks = themes.map(t =>
    `${t.name}: ${t.description}\nScoring guidance: ${t.guidance}`
  ).join('\n\n');

  let calibrationBlock = '';
  if (includeCalibration) {
    // Safe: includeCalibration is true only for the pristine default set, whose
    // theme_ids are exactly the CALIBRATION keys.
    const calibration = Object.entries(CALIBRATION).map(([tk, v]) =>
      `${tk}: ` + themes.map(t => `${t.name} = ${v[t.theme_id].verdict} (${v[t.theme_id].rationale})`).join('; ')
    ).join('\n');
    calibrationBlock = `\n\nCalibrated examples from the portfolio owner — match their judgment style and logic:\n${calibration}`;
  }

  return `You score one stock against the user's macro themes for a worldview-driven portfolio dashboard.

${thesisBlocks}

The user's worldview, which should tilt ambiguous calls: ${worldview}${calibrationBlock}

Use 'Mixed' only when there are two real opposing forces; use 'Neutral' when exposure is simply not dominant.`;
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const ticker = typeof body.ticker === 'string' ? body.ticker.toUpperCase() : '';
  if (!TICKER_RE.test(ticker)) return Response.json({ error: 'Invalid ticker' }, { status: 400 });

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const now = new Date().toISOString();

  // Per-user active themes (lazy-seeds the four defaults for untouched users).
  const themes = await getOrSeedUserThemes(sb, userId);
  const fingerprint = activeThemeFingerprint(themes);
  const pristine = isPristineDefaultSet(themes);

  // ── Calibration fast-path: no Anthropic call ──────────────────────────────
  // Only valid while the user still has the untouched defaults (calibration verdicts
  // are keyed by the default theme ids).
  if (pristine && CALIBRATION[ticker]) {
    const verdicts = CALIBRATION[ticker];
    const { error } = await sb.from('theme_classifications').upsert(
      { user_id: userId, ticker, thesis_version: fingerprint, verdicts, computed_at: now },
      { onConflict: 'user_id,ticker' },
    );
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ticker, verdicts, source: 'calibration' });
  }

  // ── Model path ────────────────────────────────────────────────────────────
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'AI service unavailable' }, { status: 500 });

  // Fetch the user's worldview to tilt ambiguous calls (fallback to default).
  let worldview = DEFAULT_WORLDVIEW;
  try {
    const { data } = await sb.from('user_settings').select('worldview').eq('user_id', userId).single();
    if (data?.worldview) worldview = data.worldview;
  } catch {}

  const classifyTool = buildClassifyTool(themes);

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
        max_tokens: 1200,
        system: buildSystem(worldview, themes, pristine),
        tools: [classifyTool],
        tool_choice: { type: 'tool', name: 'classify_against_theses' },
        messages: [{ role: 'user', content: `Score the stock with ticker ${ticker}.` }],
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

  const verdicts = toolUse.input;
  const allValid = themes.every(t => verdicts[t.theme_id] && VERDICTS.includes(verdicts[t.theme_id].verdict));
  if (!allValid) {
    return Response.json({ error: 'generation_failed', message: 'Invalid verdict in output' }, { status: 500 });
  }

  const { error } = await sb.from('theme_classifications').upsert(
    { user_id: userId, ticker, thesis_version: fingerprint, verdicts, computed_at: now },
    { onConflict: 'user_id,ticker' },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ticker, verdicts, source: 'model' });
}
