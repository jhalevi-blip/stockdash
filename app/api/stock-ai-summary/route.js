export const dynamic = 'force-dynamic';

const BUY_CODES = new Set(['P', 'M', 'A', 'G']);

const generateStockSummaryTool = {
  name: 'generate_stock_summary',
  description: 'Generate a structured AI summary for a single stock, including a rating and key insight sections.',
  input_schema: {
    type: 'object',
    properties: {
      rating: {
        type: 'number',
        minimum: 1.0,
        maximum: 10.0,
        description: 'Overall stock rating on a 1-10 scale, half-point increments allowed (e.g., 6.5).',
      },
      rating_summary: {
        type: 'string',
        description: "One short sentence explaining the rating in the user's language.",
      },
      thesis: {
        type: 'string',
        description: "2-3 sentences covering current price vs analyst target, valuation context, and the key investment thesis. In the user's language.",
      },
      bull_case: {
        type: ['string', 'null'],
        description: "1-2 sentences on the strongest upside catalyst supported by the data. Null if there are no meaningful bullish signals.",
      },
      bear_case: {
        type: ['string', 'null'],
        description: "1-2 sentences on the most significant risk or downside. Null if there are no meaningful bearish signals.",
      },
      what_to_watch: {
        type: 'string',
        description: "1-2 sentences on the most important upcoming event or metric to monitor. Always provided.",
      },
      language: {
        type: 'string',
        description: "ISO language code used for the text content (e.g., 'en', 'nl', 'de', 'fr').",
      },
    },
    required: ['rating', 'rating_summary', 'thesis', 'what_to_watch', 'language'],
  },
};

const SYSTEM_PROMPT = `You are a stock analyst for StockDashes, powered by Claude.

You analyze individual stocks and call the generate_stock_summary tool with structured insights. You never respond with prose outside the tool call.

## Rating rubric (use consistently; avoid clustering)

- 9.0-10.0: Excellent — strong analyst consensus, meaningful upside, healthy valuation, positive earnings trend, bullish insider activity
- 7.0-8.5: Good — mostly positive signals with one or two minor concerns
- 5.0-6.5: Mixed — meaningful upside potential undercut by valuation concerns, mixed earnings, or neutral insider activity
- 3.0-4.5: Weak — limited upside, stretched valuation, or deteriorating fundamentals
- 1.0-2.5: Severe — significant downside risk, very stretched valuation, or consistently missing estimates

Use half-point increments (e.g., 6.5, 7.5) to avoid clustering at integer scores.

## Tone

- Specific with numbers from the data provided.
- Direct but friendly. Written for a casual retail investor, not a finance professional.
- Never invent numbers. Every specific claim must be derivable from the data.

## Adaptive sections

- Omit bull_case if there are no meaningful bullish signals (no analyst upside, no insider buys, no earnings beats).
- Omit bear_case if there are no meaningful bearish signals (no high short interest, no earnings misses, no stretched valuation).
- thesis and what_to_watch are always provided.

## Language

Write all text content in the language indicated by the user's browser locale. If the locale is unrecognized, default to English.`;

function buildUserMessage(body) {
  const {
    ticker, price, userLang,
    analystD, valD, finD, earningsHist,
    insiders, siD, peersList, row,
  } = body;

  const fmt2 = n => (n == null ? '—' : Number(n).toFixed(2));
  const fmt1 = n => (n == null ? '—' : Number(n).toFixed(1));

  const lines = [`Stock: ${ticker}`];

  if (price != null) {
    lines.push(`Current Price: $${fmt2(price)}`);
  }

  // Analyst
  if (analystD) {
    const upside = price && analystD.lastQuarterTarget
      ? ((analystD.lastQuarterTarget - price) / price * 100).toFixed(1)
      : null;
    const upsideStr = upside != null ? ` (${Number(upside) >= 0 ? '+' : ''}${upside}% upside)` : '';
    lines.push(`Analyst Consensus Target: $${fmt2(analystD.lastQuarterTarget)}${upsideStr}`);
    if (analystD.lastQuarterCount) {
      lines.push(`Analyst Count: ${analystD.lastQuarterCount} (source: ${analystD.source ?? 'unknown'})`);
    }
    if (analystD.targetLow != null && analystD.targetHigh != null) {
      lines.push(`Target Range: $${fmt2(analystD.targetLow)} – $${fmt2(analystD.targetHigh)}`);
    }
  }

  // Valuation
  if (valD) {
    const vParts = [];
    if (valD.peRatio    != null) vParts.push(`P/E (TTM) ${fmt1(valD.peRatio)}x`);
    if (valD.forwardPE  != null) vParts.push(`Fwd P/E ${fmt1(valD.forwardPE)}x`);
    if (valD.evEbitda   != null) vParts.push(`EV/EBITDA ${fmt1(valD.evEbitda)}x`);
    if (valD.grossMargin != null) vParts.push(`Gross Margin ${fmt1(valD.grossMargin)}%`);
    if (valD.netMargin  != null) vParts.push(`Net Margin ${fmt1(valD.netMargin)}%`);
    if (vParts.length) lines.push(`Valuation: ${vParts.join(', ')}`);
  }

  // Financials (latest year)
  if (finD && !finD.error) {
    const revLast = finD.revenue?.at(-1);
    const niLast  = finD.netIncome?.at(-1);
    if (revLast) lines.push(`Revenue (${revLast.year}): $${(revLast.value / 1e9).toFixed(2)}B`);
    if (niLast)  lines.push(`Net Income (${niLast.year}): $${(niLast.value / 1e9).toFixed(2)}B`);
  }

  // Earnings history
  if (Array.isArray(earningsHist) && earningsHist.length) {
    const recent = earningsHist.slice(-4);
    const beats  = recent.filter(e => e.actual != null && e.estimate != null && e.actual >= e.estimate).length;
    const misses = recent.filter(e => e.actual != null && e.estimate != null && e.actual < e.estimate).length;
    lines.push(`Earnings (last ${recent.length} quarters): ${beats} beat${beats !== 1 ? 's' : ''}, ${misses} miss${misses !== 1 ? 'es' : ''}`);
    const last = earningsHist.at(-1);
    if (last?.actual != null && last?.estimate != null) {
      const surp = ((last.actual - last.estimate) / Math.abs(last.estimate) * 100).toFixed(1);
      lines.push(`Most recent quarter (${last.displayQuarter ?? last.period ?? ''}): actual $${fmt2(last.actual)}, estimate $${fmt2(last.estimate)}, surprise ${Number(surp) >= 0 ? '+' : ''}${surp}%`);
    }
  }

  // Insiders
  if (Array.isArray(insiders) && insiders.length) {
    const recent = insiders.slice(0, 4);
    const buys   = recent.filter(i => BUY_CODES.has(i.transactionCode)).length;
    const sells  = recent.length - buys;
    lines.push(`Insider Activity (last ${recent.length}): ${buys} buy${buys !== 1 ? 's' : ''}, ${sells} sale${sells !== 1 ? 's' : ''}`);
  }

  // Short interest
  if (siD) {
    if (siD.shortPercentOfFloat != null) {
      lines.push(`Short % of Float: ${(siD.shortPercentOfFloat * 100).toFixed(2)}%`);
    }
    if (siD.siChange != null) {
      lines.push(`Short Interest MoM Change: ${siD.siChange > 0 ? '+' : ''}${fmt1(siD.siChange)}%`);
    }
  }

  // Peers (brief)
  if (Array.isArray(peersList) && peersList.length) {
    const peerSummary = peersList
      .filter(p => !p.isBase)
      .slice(0, 3)
      .map(p => `${p.ticker} (P/E ${p.peRatio != null ? fmt1(p.peRatio) : '—'})`)
      .join(', ');
    if (peerSummary) lines.push(`Comparable peers: ${peerSummary}`);
  }

  // User position
  if (row) {
    const avgCost = row.costVal != null && row.s > 0 ? row.costVal / row.s : null;
    lines.push(`User Position: ${row.s} shares, avg cost $${avgCost != null ? fmt2(avgCost) : '—'}, P&L ${row.pnlAmt != null ? (row.pnlAmt >= 0 ? '+$' : '-$') + Math.abs(row.pnlAmt).toFixed(0) : '—'}${row.pnlPct != null ? ` (${row.pnlPct >= 0 ? '+' : ''}${fmt1(row.pnlPct)}%)` : ''}`);
  }

  lines.push(`\nUser's browser locale: ${userLang || 'en'}`);

  return lines.join('\n');
}

export async function POST(request) {
  const body = await request.json();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'AI service unavailable' }, { status: 500 });

  const { ticker } = body;
  if (!ticker) return Response.json({ error: 'Missing ticker' }, { status: 400 });

  const userMessage = buildUserMessage(body);

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
        model: 'claude-opus-4-7',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        tools: [generateStockSummaryTool],
        tool_choice: { type: 'tool', name: 'generate_stock_summary' },
        messages: [{ role: 'user', content: userMessage }],
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

  return Response.json(toolUse.input);
}
