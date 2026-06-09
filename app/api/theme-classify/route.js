import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  THESES, THESIS_VERSION, CALIBRATION, DEFAULT_WORLDVIEW, VERDICTS,
} from '@/app/(v2)/themes/_lib/theses';

// Scores one ticker against the four fixed theses. Calibration tickers are served
// from the static map (no model call); everything else goes through Claude with
// forced tool use. Follows the error/validation pattern of stock-ai-summary.
export const dynamic = 'force-dynamic';

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

// Per-thesis scoring guidance injected into the system prompt.
const GUIDANCE = {
  'debasement': "Beneficiaries: hard assets, pricing power, nominal-asset owners, energy/commodity producers, crypto exposure. The mechanism is SUPPRESSED real rates and financial repression — never apply 'high rates hurt X' logic. Victims: long-duration cash flows with no pricing power.",
  'strong-ai': "Beneficiaries: compute, power infrastructure, AI-native operators that consume their own efficiency gains. Victims: businesses whose product AI deflates or replaces.",
  'k-shaped': "The top decile spends through anything; the bottom half trades down or exits. In trade-down-able goods both ends win and the MIDDLE is the victim. In threshold goods (housing, new cars) the bottom buyer exits entirely, so the entry tier is the victim. Mid-premium brands sold to ordinary people are the classic victim.",
  'instability': "Beneficiaries: direct revenue from defense, security, cyber, energy security. Victims: China-sourced supply chains, conflict-exposed logistics. A company merely operating globally is Neutral, not Hurt.",
};

const thesisProp = {
  type: 'object',
  required: ['verdict', 'rationale'],
  properties: {
    verdict:   { type: 'string', enum: ['Benefits', 'Hurt', 'Neutral', 'Mixed'] },
    rationale: { type: 'string', description: 'One sentence, max ~20 words' },
  },
};

const classifyTool = {
  name: 'classify_against_theses',
  description: 'Score one stock against the four fixed macro theses.',
  input_schema: {
    type: 'object',
    properties: {
      'debasement':  thesisProp,
      'strong-ai':   thesisProp,
      'k-shaped':    thesisProp,
      'instability': thesisProp,
    },
    required: ['debasement', 'strong-ai', 'k-shaped', 'instability'],
  },
};

function buildSystem(worldview) {
  const thesisBlocks = THESES.map(t =>
    `${t.name}: ${t.view}\nScoring guidance: ${GUIDANCE[t.id]}`
  ).join('\n\n');

  const calibration = Object.entries(CALIBRATION).map(([tk, v]) =>
    `${tk}: ` + THESES.map(t => `${t.name} = ${v[t.id].verdict} (${v[t.id].rationale})`).join('; ')
  ).join('\n');

  return `You score one stock against four fixed macro theses for a worldview-driven portfolio dashboard.

${thesisBlocks}

The user's worldview, which should tilt ambiguous calls: ${worldview}

Calibrated examples from the portfolio owner — match their judgment style and logic:
${calibration}

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

  // ── Calibration fast-path: no Anthropic call ──────────────────────────────
  if (CALIBRATION[ticker]) {
    const verdicts = CALIBRATION[ticker];
    const { error } = await sb.from('theme_classifications').upsert(
      { user_id: userId, ticker, thesis_version: THESIS_VERSION, verdicts, computed_at: now },
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
        system: buildSystem(worldview),
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
  const allValid = THESES.every(t => verdicts[t.id] && VERDICTS.includes(verdicts[t.id].verdict));
  if (!allValid) {
    return Response.json({ error: 'generation_failed', message: 'Invalid verdict in output' }, { status: 500 });
  }

  const { error } = await sb.from('theme_classifications').upsert(
    { user_id: userId, ticker, thesis_version: THESIS_VERSION, verdicts, computed_at: now },
    { onConflict: 'user_id,ticker' },
  );
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ticker, verdicts, source: 'model' });
}
