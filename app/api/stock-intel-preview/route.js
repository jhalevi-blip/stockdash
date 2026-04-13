const SYMBOL = 'NVDA';
const CACHE_HEADER = { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' };

// Hardcoded fallback if Finnhub is unavailable
const PRICE_FALLBACK = { price: 106.73, chgPct: -2.15 };

async function fetchNvdaQuote(key) {
  const res = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${SYMBOL}&token=${key}`,
    { next: { revalidate: 86400 } }
  );
  const q = await res.json();
  const price = q.c > 0 ? q.c : q.pc;
  return { price, chgPct: q.dp ?? null };
}

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

async function fetchAiAnalysis(anthropicKey, price, target) {
  const lines = [
    `Stock: ${SYMBOL} (Nvidia Corporation)`,
    `Sector: Semiconductors / AI infrastructure`,
    price != null ? `Current Price: $${price.toFixed(2)}` : null,
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

  // Fetch price and analyst target in parallel
  let quote  = PRICE_FALLBACK;
  let target = { avg: null, high: null, low: null };

  try {
    [quote, target] = await Promise.all([
      fetchNvdaQuote(finnhubKey),
      fetchNvdaTarget(finnhubKey),
    ]);
  } catch (e) {
    console.error('[stock-intel-preview] Finnhub fetch failed:', e);
    // Continue with fallback values — still get AI analysis
  }

  // AI analysis (non-fatal if it fails)
  const ai = await fetchAiAnalysis(anthropicKey, quote.price, target).catch(() => null);

  return Response.json(
    { symbol: SYMBOL, price: quote.price, chgPct: quote.chgPct, analyst: target, ai },
    { headers: CACHE_HEADER }
  );
}
