export const dynamic = 'force-dynamic';

const BUY_CODES = new Set(['P', 'M', 'A', 'G']);

// Shared schema for a single DCF scenario (reused for conservative / consensus / bull)
const scenarioPropDef = {
  type: 'object',
  properties: {
    wacc: {
      type: 'number',
      minimum: 4,
      maximum: 18,
      description: 'Weighted average cost of capital % (e.g. 9 for high-beta growth, 7 for stable large-cap).',
    },
    terminalGrowth: {
      type: 'number',
      minimum: 1,
      maximum: 5,
      description: 'Long-run terminal growth rate % (GDP-anchored; rarely above 4 outside high-growth niches).',
    },
    revenueCagr: {
      type: 'number',
      minimum: 0,
      maximum: 60,
      description: '5-year revenue CAGR % projection, fading from current trajectory toward normalised growth.',
    },
    terminalMargin: {
      type: 'number',
      minimum: 5,
      maximum: 80,
      description: 'Terminal-year operating margin % — where the business lands at scale.',
    },
    rationale: {
      type: 'string',
      description: "1–2 sentences explaining this scenario's worldview and key numerical picks.",
    },
  },
  required: ['wacc', 'terminalGrowth', 'revenueCagr', 'terminalMargin', 'rationale'],
};

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
      oneLiner: {
        type: 'string',
        description: "One punchy sentence (max 18 words) summarizing the 3-year investment case. In the user's language.",
      },
      bull: {
        type: 'array',
        items: { type: 'string' },
        description: "3-4 specific bullish catalysts for the 3-year horizon. Each item 1-2 sentences, grounded in the data provided.",
      },
      bear: {
        type: 'array',
        items: { type: 'string' },
        description: "3-4 bearish risks or headwinds for the 3-year horizon. Each item 1-2 sentences, grounded in the data provided.",
      },
      risks: {
        type: 'array',
        items: { type: 'string' },
        description: "3-4 key tail risks that could invalidate the thesis (regulatory, macro, competitive, execution). Each item 1-2 sentences.",
      },
      threeYearTarget: {
        type: 'object',
        properties: {
          bear: { type: 'number', description: 'Bear-case 3-year price target (USD).' },
          base: { type: 'number', description: 'Base-case 3-year price target (USD).' },
          bull: { type: 'number', description: 'Bull-case 3-year price target (USD).' },
        },
        required: ['bear', 'base', 'bull'],
        description: "3-year price targets in USD. Base should imply meaningful upside/downside vs current price. All three must be positive numbers.",
      },
      fitsPortfolio: {
        type: ['string', 'null'],
        description: "How this stock fits the user's existing portfolio (concentration, diversification, correlation to existing positions). Null if no holdings context was provided.",
      },
      dcfScenarios: {
        type: 'object',
        description: 'Three self-consistent DCF scenario presets — Conservative, Consensus, Bull. Each is a coherent worldview, not just a CAGR knob. All values must stay within slider bounds.',
        properties: {
          conservative: scenarioPropDef,
          consensus:    scenarioPropDef,
          bull:         scenarioPropDef,
        },
        required: ['conservative', 'consensus', 'bull'],
      },
      language: {
        type: 'string',
        description: "ISO language code used for the text content (e.g., 'en', 'nl', 'de', 'fr').",
      },
    },
    required: ['rating', 'rating_summary', 'thesis', 'what_to_watch', 'oneLiner', 'bull', 'bear', 'risks', 'threeYearTarget', 'dcfScenarios', 'language'],
  },
};

const SYSTEM_PROMPT = `You are a stock analyst for StockDashes, powered by Claude.

You analyze individual stocks and call the generate_stock_summary tool with structured insights. You never respond with prose outside the tool call.

## Investment horizon

IMPORTANT: All analysis, targets, bull/bear cases, and thesis must reflect a 3-YEAR INVESTING HORIZON. This is NOT day-trading advice. Do not mention short-term price moves, earnings beats/misses as trading signals, or intraday catalysts. Focus on where the business will be in 3 years.

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

## 3-year price targets

Set threeYearTarget.base at the level you genuinely expect the stock to reach in 3 years given current trajectory. Set bear 20-35% below base, bull 25-45% above base. All must be positive numbers.

## Portfolio fit (fitsPortfolio)

If the user's portfolio holdings are provided in the context, populate fitsPortfolio with 2-3 sentences on how this stock fits (or clashes with) the portfolio: concentration risk, sector overlap, diversification benefit, or correlation to existing positions. If no holdings context is provided, return null.

## DCF scenarios

Return THREE coherent DCF scenarios — Conservative, Consensus, Bull — each with all four assumptions tuned together. Each scenario is a self-consistent worldview, not just a CAGR knob.

- **Conservative**: cautious base case. Lower CAGR fading aggressively, higher WACC (risk premium), terminal margin near or below current. Reflects skepticism on TAM, competition, or execution.
- **Consensus**: matches Wall Street analyst consensus and management guidance midpoint. CAGR ~= analyst median 3yr growth estimate (if cited in your context), WACC reflects sector beta, terminal margin at industry-mature level.
- **Bull**: management's stated guidance midpoint or upside case. Higher CAGR matching CEO/CFO commentary (e.g. "Lisa Su has guided AMD AI to 35%+ CAGR through 2027"), lower WACC reflecting execution confidence, terminal margin reflecting scale benefits + operating leverage.

Each scenario must be internally coherent — a bull case isn't just higher CAGR, it's also better margins at scale and possibly lower WACC reflecting risk reduction. A conservative case may have lower margins reflecting competitive pressure.

Examples (illustrative, not prescriptive):
- NVDA conservative: WACC 11, growth 3, CAGR 18, margin 55. "Hyperscaler capex normalizes faster than bulls expect; custom silicon erodes CUDA pricing power by year 3."
- NVDA consensus: WACC 9, growth 3.5, CAGR 35, margin 65. "Matches Street median; assumes AI capex grows through 2028."
- NVDA bull: WACC 8, growth 4, CAGR 50, margin 70. "CUDA moat holds; sovereign AI + enterprise expansion is multi-trillion TAM."

Each rationale: 1–2 sentences explaining the worldview AND key numerical picks. Reference real numbers from the context where available (last annual revenue YoY, current op margin, etc.).

All values must stay within slider bounds: WACC 4–18, terminal growth 1–5, revenue CAGR 0–60, terminal margin 5–80.

When "Last Annual Revenue (best available)" is provided, anchor the Consensus scenario's CAGR to the actual YoY growth rate, with Conservative below and Bull above.

## Adaptive sections

- Omit bull_case if there are no meaningful bullish signals (no analyst upside, no insider buys, no earnings beats).
- Omit bear_case if there are no meaningful bearish signals (no high short interest, no earnings misses, no stretched valuation).
- thesis and what_to_watch are always provided.
- bull, bear, risks arrays: always provide 3-4 items each, even if data is limited (use reasonable inference from sector and valuation).

## Language

Write all text content in the language indicated by the user's browser locale. If the locale is unrecognized, default to English.`;

function buildUserMessage(body) {
  const {
    ticker, price, userLang,
    analystD, valD, finD, earningsHist,
    insiders, siD, peersList, row,
    holdings,           // optional: user's portfolio holdings for fitsPortfolio
    lastAnnualRevenue,  // resolved revenue (waterfall: EDGAR annual → TTM)
    priorAnnualRevenue, // prior-year revenue for YoY CAGR context
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

  // Resolved revenue — waterfall (EDGAR annual → TTM); more reliable for DCF anchoring
  if (lastAnnualRevenue) {
    const revStr = (lastAnnualRevenue / 1e9).toFixed(2);
    if (priorAnnualRevenue) {
      const yoy = ((lastAnnualRevenue / priorAnnualRevenue - 1) * 100).toFixed(0);
      lines.push(`Last Annual Revenue (best available): $${revStr}B (YoY ${Number(yoy) >= 0 ? '+' : ''}${yoy}%)`);
      lines.push(`Prior Annual Revenue: $${(priorAnnualRevenue / 1e9).toFixed(2)}B`);
    } else {
      lines.push(`Last Annual Revenue (best available): $${revStr}B`);
    }
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

  // User portfolio holdings (for fitsPortfolio)
  if (Array.isArray(holdings) && holdings.length) {
    const hLines = holdings
      .slice(0, 10)
      .map(h => `  ${h.ticker}: ${h.shares} shares @ $${h.avgCost?.toFixed(2) ?? '—'}, MV $${h.marketValue?.toFixed(0) ?? '—'}`)
      .join('\n');
    lines.push(`User Portfolio Holdings:\n${hLines}`);
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
        model: 'claude-opus-4-8',
        max_tokens: 2000,
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
