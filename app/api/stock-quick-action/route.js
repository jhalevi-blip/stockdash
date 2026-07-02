import { auth } from '@clerk/nextjs/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { trackFinnhub } from '@/lib/apiUsage';

export const dynamic = 'force-dynamic';

// The "Why is this moving today?" chip is special-cased: for it (and only it)
// we fetch recent company news server-side and ground the answer in real
// headlines + the day's move. See the news fetch + WHY_MOVING_INSTRUCTION below.
const WHY_MOVING_CHIP = 'Why is this moving today?';

const WHY_MOVING_INSTRUCTION = `For this question, explain today's price move using the recent headlines and the size of the move provided in the prompt. If no headline plausibly explains a move of that magnitude, say the move looks like broader sector/market movement or normal volatility with no single clear catalyst. NEVER invent a catalyst that is not supported by the headlines.`;

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

  // Day's % change — only sent by the client for the "Why is this moving today?"
  // chip. Number or undefined.
  const chgPctNum = Number(body.chgPct);
  const chgPct = Number.isFinite(chgPctNum) ? chgPctNum : null;

  const isWhyMoving = prompt === WHY_MOVING_CHIP;

  // Portfolio source of truth: signed-in users load holdings server-side from
  // Supabase (never trust the client body); anonymous users fall back to the
  // localStorage-derived holdings/cash in the request body, as before.
  let holdingsInput = body.holdings;
  let cashInput     = body.cash;

  const { userId } = await auth();

  // Server-enforced daily quota before the (expensive) Anthropic + news calls.
  // Mirrors app/api/stock-ai-summary/route.js:326-351 — anon by IP (2/day),
  // signed-in by userId (5/day). Fail open on any Supabase error.
  const identity = userId
    ? `user:${userId}`
    : `ip:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'}`;
  const dailyLimit = userId ? 5 : 2;
  const day = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

  const sbQuota = getSupabaseAdmin();
  if (sbQuota) {
    try {
      const { data: count, error } = await sbQuota.rpc('increment_ai_usage', { p_identity: identity, p_day: day });
      if (error) {
        console.error('[stock-quick-action] quota check failed, failing open:', error.message);
      } else if (typeof count === 'number' && count > dailyLimit) {
        return Response.json({ error: 'Daily limit reached' }, { status: 429 });
      }
    } catch (e) {
      console.error('[stock-quick-action] quota check threw, failing open:', e);
    }
  } else {
    console.error('[stock-quick-action] Supabase unavailable, failing open on quota');
  }

  if (userId) {
    const sb = getSupabaseAdmin();
    if (sb) {
      // Mirror app/api/correlation/route.js: load the user's portfolio row.
      const { data: portfolioData } = await sb
        .from('portfolios')
        .select('holdings')
        .eq('user_id', userId)
        .single();
      // Stored shape (see app/api/portfolio/route.ts): equity rows are
      // { t: ticker, s: shares, c: avg cost/share }, plus a sentinel
      // { t: '__CASH__', amount, currency } row. Map equities into the
      // { ticker, shares, avgCost } shape the validator below expects.
      const raw = Array.isArray(portfolioData?.holdings) ? portfolioData.holdings : [];
      holdingsInput = raw
        .filter(h => h?.t && h.t !== '__CASH__')
        .map(h => ({ ticker: h.t, shares: h.s, avgCost: h.c }));
      const cashRow = raw.find(h => h?.t === '__CASH__');
      cashInput = cashRow ? { amount: cashRow.amount, currency: cashRow.currency } : null;
    }
  }

  // Optional portfolio context — validate defensively: array only, cap at 50,
  // coerce numbers, drop malformed rows.
  const holdings = (Array.isArray(holdingsInput) ? holdingsInput : [])
    .slice(0, 50)
    .map(h => {
      const t       = typeof h?.ticker === 'string' ? h.ticker.trim().toUpperCase() : null;
      const shares  = Number(h?.shares);
      const avgCost = Number(h?.avgCost);
      if (!t || !Number.isFinite(shares)) return null;
      return { ticker: t, shares, avgCost: Number.isFinite(avgCost) ? avgCost : null };
    })
    .filter(Boolean);

  const cashAmount = Number(cashInput?.amount);
  const cash = Number.isFinite(cashAmount) && cashAmount > 0
    ? { amount: cashAmount, currency: typeof cashInput?.currency === 'string' ? cashInput.currency : 'USD' }
    : null;

  const hasPortfolio = holdings.length > 0;

  // For the "Why is this moving today?" chip only, fetch recent company news
  // server-side (mirrors app/api/news/route.js) so the model can ground its
  // answer in real headlines. Any failure or missing key → empty news block.
  let newsLines = [];
  if (isWhyMoving) {
    const finnhubKey = process.env.FINNHUB_API_KEY;
    if (finnhubKey) {
      try {
        trackFinnhub(1); // 1 company-news call
        const today = new Date();
        const from = new Date(today - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const to = today.toISOString().split('T')[0];
        const newsRes = await fetch(
          `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${finnhubKey}`,
          { next: { revalidate: 900 } }
        );
        const articles = await newsRes.json();
        if (Array.isArray(articles)) {
          newsLines = articles
            .slice()
            .sort((a, b) => (b?.datetime ?? 0) - (a?.datetime ?? 0))
            .slice(0, 5)
            .map(a => {
              const headline = (a?.headline ?? '').trim();
              if (!headline) return null;
              const summary = (a?.summary ?? '').trim().slice(0, 200);
              const date = a?.datetime ? new Date(a.datetime * 1000).toISOString().split('T')[0] : '';
              const source = (a?.source ?? '').trim();
              return `- ${headline}${summary ? ` — ${summary}` : ''}${date ? ` — ${date}` : ''}${source ? ` — ${source}` : ''}`;
            })
            .filter(Boolean);
        }
      } catch {
        newsLines = [];
      }
    }
  }

  const lines = [
    `Stock: ${ticker}`,
    price != null ? `Current price: $${Number(price).toFixed(2)}` : null,
    `Question: ${prompt}`,
  ].filter(Boolean);

  if (isWhyMoving) {
    if (chgPct != null) lines.push(`Today's move: ${chgPct}%`);
    if (newsLines.length) {
      lines.push('', 'Recent headlines (last 7 days):', ...newsLines);
    } else {
      lines.push('No recent headlines available.');
    }
  }

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

  // Base system prompt depends on portfolio context; for the "Why is this
  // moving today?" chip, append the news-grounding instruction.
  const baseSystem = hasPortfolio ? SYSTEM_WITH_PORTFOLIO : SYSTEM_NO_PORTFOLIO;
  const system = isWhyMoving ? `${baseSystem}\n\n${WHY_MOVING_INSTRUCTION}` : baseSystem;

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
        system,
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
