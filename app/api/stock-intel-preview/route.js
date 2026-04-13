const SYMBOL = 'NVDA';
const CACHE_HEADER = { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' };

// Price comes from /api/most-traded on the client — only used here for AI prompt context
const PRICE_FOR_PROMPT = 106.73;

async function fetchNvdaTarget(key) {
  const res = await fetch(
    `https://finnhub.io/api/v1/stock/price-target?symbol=${SYMBOL}&token=${key}`,
    { next: { revalidate: 86400 } }
  );
  const t = await res.json();
  return {
    avg:  t.targetMean  ?? null,
    high: t.targetHigh  ?? null,
    low:  t.targetLow   ?? null,
  };
}

async function fetchAiAnalysis(anthropicKey, target) {
  const price = PRICE_FOR_PROMPT;
  const lines = [
    `Stock: ${SYMBOL} (Nvidia Corporation)`,
    `Sector: Semiconductors / AI infrastructure`,
    `Current Price: $${price.toFixed(2)}`,
    target.avg  != null ? `Analyst avg target: $${target.avg.toFixed(2)}` : null,
    target.high != null ? `Target high: $${target.high.toFixed(2)}` : null,
    target.low  != null ? `Target low:  $${target.low.toFixed(2)}`  : null,
  ].filter(Boolean).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      messages: [{
        role: 'user',
        content: `You are a financial analyst. Based on this data:

${lines}

Respond with JSON only (no markdown, no commentary). Each case must be exactly one concise sentence under 12 words:
{"bullCases":["sentence","sentence"],"bearCases":["sentence","sentence"],"summary":"One sentence investor thesis."}`,
      }],
    }),
  });

  if (!res.ok) return null;
  const raw = await res.json();
  const text = raw.content?.[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

export async function GET() {
  const finnhubKey   = process.env.FINNHUB_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!finnhubKey || !anthropicKey) {
    return Response.json({ error: 'Missing API keys' }, { status: 500 });
  }

  // Analyst target only — price comes from /api/most-traded on the client
  let target = { avg: null, high: null, low: null };
  try {
    target = await fetchNvdaTarget(finnhubKey);
  } catch (e) {
    console.error('[stock-intel-preview] Finnhub target fetch failed:', e);
  }

  // AI analysis (non-fatal if it fails)
  const ai = await fetchAiAnalysis(anthropicKey, target).catch(() => null);

  return Response.json(
    { symbol: SYMBOL, analyst: target, ai },
    { headers: CACHE_HEADER }
  );
}
