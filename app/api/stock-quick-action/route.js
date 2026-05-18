export const dynamic = 'force-dynamic';

const SYSTEM = `You are a stock analyst for StockDashes. The user clicked a quick-action chip while viewing a stock research page. Answer in 2–4 sentences. Focus on a 3-year investing horizon — NOT day-trading advice. Be specific where data is provided; otherwise reason from first principles. Never invent specific numbers not included in the prompt.`;

export async function POST(request) {
  const body = await request.json();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'AI service unavailable' }, { status: 500 });

  const { ticker, prompt, price } = body;
  if (!ticker || !prompt) return Response.json({ error: 'Missing ticker or prompt' }, { status: 400 });

  const userMessage = [
    `Stock: ${ticker}`,
    price != null ? `Current price: $${Number(price).toFixed(2)}` : null,
    `Question: ${prompt}`,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-0',
        max_tokens: 400,
        system:     SYSTEM,
        messages:   [{ role: 'user', content: userMessage }],
      }),
    });
    const raw = await res.json();
    if (!res.ok) {
      return Response.json(
        { error: 'generation_failed', message: raw.error?.message ?? 'API error' },
        { status: 500 }
      );
    }
    const text = raw.content?.find(b => b.type === 'text')?.text ?? '';
    return Response.json({ response: text });
  } catch {
    return Response.json({ error: 'network' }, { status: 500 });
  }
}
