export const dynamic = 'force-dynamic';

const SYSTEM_BASE = `You are a stock analyst for StockDashes. The user clicked a quick-action chip while viewing a stock research page. Answer in 2–4 sentences. Focus on a 3-year investing horizon — NOT day-trading advice. Be specific where data is provided; otherwise reason from first principles. Never invent specific numbers not included in the prompt.`;

const SYSTEM_WITH_PORTFOLIO = `${SYSTEM_BASE}

The user's current portfolio is included in the prompt. Ground your answer in it: reference the user's actual position in the stock being viewed (or state plainly that they do not currently hold it), how concentrated that position is relative to the rest of the book, and any overlap or shared thesis with their other holdings. Current prices and portfolio weights for these positions are NOT provided, so reason qualitatively and never invent those numbers.`;

const SYSTEM_NO_PORTFOLIO = `${SYSTEM_BASE}

The user has no saved portfolio, so do not assume any specific holdings — answer generically.`;

export async function POST(request) {
  const body = await request.json();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'AI service unavailable' }, { status: 500 });

  const { ticker, prompt, price } = body;
  if (!ticker || !prompt) return Response.json({ error: 'Missing ticker or prompt' }, { status: 400 });

  // Optional portfolio context — validate defensively: array only, cap at 50,
  // coerce numbers, drop malformed rows.
  const holdings = (Array.isArray(body.holdings) ? body.holdings : [])
    .slice(0, 50)
    .map(h => {
      const t       = typeof h?.ticker === 'string' ? h.ticker.trim().toUpperCase() : null;
      const shares  = Number(h?.shares);
      const avgCost = Number(h?.avgCost);
      if (!t || !Number.isFinite(shares)) return null;
      return { ticker: t, shares, avgCost: Number.isFinite(avgCost) ? avgCost : null };
    })
    .filter(Boolean);

  const cashAmount = Number(body.cash?.amount);
  const cash = Number.isFinite(cashAmount) && cashAmount > 0
    ? { amount: cashAmount, currency: typeof body.cash?.currency === 'string' ? body.cash.currency : 'USD' }
    : null;

  const hasPortfolio = holdings.length > 0;

  const lines = [
    `Stock: ${ticker}`,
    price != null ? `Current price: $${Number(price).toFixed(2)}` : null,
    `Question: ${prompt}`,
  ].filter(Boolean);

  if (hasPortfolio) {
    lines.push('', "User's current portfolio:");
    for (const h of holdings) {
      const avg = h.avgCost != null ? ` (avg cost $${h.avgCost.toFixed(2)})` : '';
      lines.push(`- ${h.ticker}: ${h.shares} shares${avg}`);
    }
    if (cash) lines.push(`- Cash: ${cash.currency} ${cash.amount.toFixed(2)}`);
    lines.push('(Current prices and portfolio weights for these positions are not provided.)');
  }

  const userMessage = lines.join('\n');

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
        system:     hasPortfolio ? SYSTEM_WITH_PORTFOLIO : SYSTEM_NO_PORTFOLIO,
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
