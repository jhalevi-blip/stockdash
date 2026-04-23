export const dynamic = 'force-dynamic';

// ── Portfolio AI Summary: tool definition ─────────────────────────────────────
const generatePortfolioSummaryTool = {
  name: 'generate_portfolio_summary',
  description: 'Generate a structured portfolio summary with a rating and adaptive sections for a retail investor.',
  input_schema: {
    type: 'object',
    properties: {
      rating: {
        type: 'number',
        minimum: 1.0,
        maximum: 10.0,
        description: 'Overall portfolio rating on a 1-10 scale, half-point increments allowed (e.g., 6.5).',
      },
      rating_summary: {
        type: 'string',
        description: "One short sentence explaining the rating in the user's language.",
      },
      overview: {
        type: 'string',
        description: "1-2 sentences on overall portfolio health and returns, in the user's language. Include specific numbers.",
      },
      whats_working: {
        type: ['string', 'null'],
        description: '1-2 sentences on top performers with specific tickers and returns. Null if no position is above +10%.',
      },
      whats_dragging: {
        type: ['string', 'null'],
        description: '1-2 sentences on significant underperformers with specific tickers and returns. Null if no position is below -10%.',
      },
      biggest_risk: {
        type: ['string', 'null'],
        description: '1-2 sentences on the most important portfolio risk with specific data. Null if no major red flags.',
      },
      suggested_action: {
        type: 'string',
        description: "1-2 sentences of suggestive action ('Consider...' not 'Do...'). Always ends with the disclaimer translated into the user's language.",
      },
      language: {
        type: 'string',
        description: "ISO language code used for the text content (e.g., 'en', 'nl', 'de', 'fr').",
      },
    },
    required: ['rating', 'rating_summary', 'overview', 'suggested_action', 'language'],
  },
};

// ── Portfolio AI Summary: system prompt ───────────────────────────────────────
const PORTFOLIO_SYSTEM_PROMPT = `You are a portfolio analyst for StockDashes, powered by Claude.

You analyze retail investor stock portfolios and call the generate_portfolio_summary tool with structured insights. You never respond with prose outside the tool call.

## Rating rubric (use consistently; avoid clustering at 7)

- 9.0-10.0: Excellent — no position above 15%, strong diversification across sectors, positive returns, no position below -15%
- 7.0-8.5: Good — minor issues only (one concentration point OR one large underperformer, not both)
- 5.0-6.5: Mixed — positive aspects undermined by meaningful concentration or multiple underperformers
- 3.0-4.5: Weak — extreme concentration, multiple large underperformers, or poor sector balance
- 1.0-2.5: Severe — highly concentrated, most positions underperforming, fragile portfolio

Use half-point increments (e.g., 6.5, 7.5) to avoid clustering at integer scores.

## Tone

- Suggestive, never prescriptive. Say "Consider trimming..." not "Trim...".
- Specific with numbers. Include actual percentages and position weights from the data.
- Direct but friendly. Written for a casual retail investor, not a finance professional.
- No jargon without brief context.

## Adaptive sections

- If the portfolio has no position above +10%, omit the whats_working field.
- If the portfolio has no position below -10%, omit the whats_dragging field.
- If the portfolio has no meaningful concentration, sector imbalance, or other red flag, omit the biggest_risk field.
- overview and suggested_action are always provided.

## Language

Write all text content in the language indicated by the user's browser locale. If the locale is unrecognized, default to English. The disclaimer sentence ("For informational purposes only, not financial advice.") must be translated naturally into the output language.

## Numerical accuracy

Every number you mention must be derivable from the data provided. Never invent numbers. If you cannot support a claim with the data, do not make the claim.`;

export async function POST(request) {
  const body = await request.json();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'AI service unavailable' }, { status: 500 });

  // Investment summary type
  if (body.type === 'investment-summary') {
    const {
      symbol, price, chgPct, bullCases, bearCases,
      analystTarget, analystUpside,
      peRatio, evEbitda, grossMargin,
      insiderBuys, insiderSells,
      earningBeats, earningMisses, earningTotal,
      posShares, posAvgCost, posPnlAmt, posPnlPct,
    } = body;
    if (!symbol) return Response.json({ error: 'Missing symbol' }, { status: 400 });

    const lines = [`Stock: ${symbol}`];
    if (price != null) {
      lines.push(`Current Price: $${price.toFixed(2)}${chgPct != null ? ` (${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}% today)` : ''}`);
    }
    if (analystTarget != null) {
      const upsideStr = analystUpside != null ? ` (${analystUpside >= 0 ? '+' : ''}${analystUpside.toFixed(1)}% upside)` : '';
      lines.push(`Analyst Consensus Target: $${analystTarget.toFixed(2)}${upsideStr}`);
    }
    const valParts = [];
    if (peRatio     != null) valParts.push(`P/E ${peRatio.toFixed(1)}x`);
    if (evEbitda    != null) valParts.push(`EV/EBITDA ${evEbitda.toFixed(1)}x`);
    if (grossMargin != null) valParts.push(`Gross Margin ${grossMargin.toFixed(1)}%`);
    if (valParts.length) lines.push(`Valuation: ${valParts.join(', ')}`);
    if (bullCases?.length) lines.push(`Bull Case: ${bullCases.join('; ')}`);
    if (bearCases?.length) lines.push(`Bear Case: ${bearCases.join('; ')}`);
    if (insiderBuys != null || insiderSells != null) {
      lines.push(`Recent Insider Activity: ${insiderBuys ?? 0} buys, ${insiderSells ?? 0} sells (last 4 transactions)`);
    }
    if (earningTotal != null) {
      lines.push(`Last ${earningTotal} Quarters: ${earningBeats ?? 0} EPS beats, ${earningMisses ?? 0} misses`);
    }
    if (posShares != null) {
      const pnlSign = (posPnlAmt ?? 0) >= 0 ? '+$' : '-$';
      const pnlPctStr = posPnlPct != null ? ` (${posPnlPct >= 0 ? '+' : ''}${posPnlPct.toFixed(1)}%)` : '';
      lines.push(`User Position: ${posShares} shares at avg cost $${posAvgCost?.toFixed(2) ?? '—'}, P&L ${pnlSign}${Math.abs(posPnlAmt ?? 0).toFixed(0)}${pnlPctStr}`);
    }

    const langInstruction = body.userLang ? `\nRespond in this language: ${body.userLang}. If you don't recognize it, default to English.` : '';
    const prompt = `Give a 4-6 sentence investment summary for ${symbol} based on this data. Include: overall thesis, biggest risk, what to watch next. Consider the user's current position. Be direct and specific, not generic.${langInstruction}\n\n${lines.join('\n')}`;

    let res, raw;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-0',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      raw = await res.json();
    } catch (e) {
      return Response.json({ error: 'Network error reaching AI service' }, { status: 500 });
    }
    if (!res.ok) return Response.json({ error: raw.error?.message ?? 'API error' }, { status: 500 });
    const text = raw.content?.[0]?.text ?? '';
    return Response.json({ summary: text.trim() });
  }

  // Portfolio summary type — structured tool-use output via Claude Opus 4.7
  if (body.type === 'portfolio-summary') {
    const { holdings, portfolioStats, userLang } = body;
    if (!Array.isArray(holdings) || !holdings.length) {
      return Response.json({ error: 'Missing holdings' }, { status: 400 });
    }

    // Insufficient positions — no API call made, no cost incurred
    if (holdings.length < 3) {
      return Response.json({
        error: 'insufficient_positions',
        message: 'Add at least 3 positions for a meaningful AI analysis.',
      }, { status: 200 });
    }

    const fmt2 = n => (n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const fmt1 = n => (n == null ? '—' : Number(n).toFixed(1));

    const holdingLines = holdings.map(h =>
      `- ${h.ticker}: ${h.shares} shares, avg cost $${fmt2(h.avgCost)}, current price $${fmt2(h.currentPrice)}, P&L: ${fmt1(h.pnlPct)}%, market value $${fmt2(h.marketValue)}`
    ).join('\n');

    const userMessage = `Here is the user's stock portfolio:

Holdings:
${holdingLines}

Portfolio totals:
- Total market value: $${fmt2(portfolioStats.totalValue)}
- Total P&L: $${fmt2(portfolioStats.totalPnl)} (${fmt1(portfolioStats.totalPnlPct)}%)
- Cash position: $${fmt2(portfolioStats.cash)}

User's browser locale: ${userLang || 'en'}`;

    let res, raw;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-opus-4-7',
          max_tokens: 1000,
          system: PORTFOLIO_SYSTEM_PROMPT,
          tools: [generatePortfolioSummaryTool],
          tool_choice: { type: 'tool', name: 'generate_portfolio_summary' },
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
      raw = await res.json();
    } catch (e) {
      console.error('[ai-summary] portfolio-summary network error:', e);
      return Response.json({ error: 'Network error reaching AI service' }, { status: 500 });
    }

    if (!res.ok) {
      console.error('[ai-summary] portfolio-summary API error — status:', res.status, '| body:', JSON.stringify(raw));
      return Response.json({ error: raw.error?.message ?? 'API error' }, { status: 500 });
    }

    const toolUse = raw.content?.find(
      block => block.type === 'tool_use' && block.name === 'generate_portfolio_summary'
    );
    if (!toolUse) {
      console.error('[ai-summary] no tool_use block in response:', JSON.stringify(raw));
      return Response.json({
        error: 'generation_failed',
        message: "We couldn't generate a summary. Please try again.",
      }, { status: 200 });
    }

    return Response.json(toolUse.input, { status: 200 });
  }

  // Legacy path: news sentiment analysis
  if (body.news?.length) {
    const { symbol, news } = body;
    const newsText = news.slice(0, 5).map((a, i) => `${i + 1}. ${a.headline}`).join('\n');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: `Analyze these news headlines for ${symbol} and respond with JSON only:\n${newsText}\n\n{"summary":"2-3 sentence summary","sentiment":"BULLISH or BEARISH or NEUTRAL","keyPoint":"one key insight"}` }],
      }),
    });
    const raw = await res.json();
    if (!res.ok) return Response.json({ error: raw.error?.message ?? 'API error' }, { status: 500 });
    const text = raw.content?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return Response.json({ error: 'Parse error' }, { status: 500 });
    try { return Response.json(JSON.parse(match[0])); } catch { return Response.json({ error: 'Parse error' }, { status: 500 }); }
  }

  // Stock snapshot: bull/bear/summary
  const { symbol, price, valuation: val, financials: fin, analyst } = body;
  if (!symbol) return Response.json({ error: 'Missing symbol' }, { status: 400 });

  const lines = [`Stock: ${symbol}`];
  if (price != null) lines.push(`Current Price: $${price.toFixed(2)}`);
  if (analyst?.target) {
    const upside = price ? (((analyst.target - price) / price) * 100).toFixed(1) : null;
    lines.push(`Analyst Target: $${analyst.target.toFixed(2)}${upside != null ? ` (${upside}% upside)` : ''}${analyst.count ? `, ${analyst.count} analysts` : ''}`);
    if (analyst.targetLow && analyst.targetHigh) {
      lines.push(`Price Target Range: $${analyst.targetLow.toFixed(2)} – $${analyst.targetHigh.toFixed(2)}`);
    }
  }
  if (val) {
    lines.push('Valuation:');
    if (val.peRatio    != null) lines.push(`  P/E TTM: ${val.peRatio.toFixed(1)}x`);
    if (val.forwardPE  != null) lines.push(`  Fwd P/E: ${val.forwardPE.toFixed(1)}x`);
    if (val.grossMargin != null) lines.push(`  Gross Margin: ${val.grossMargin.toFixed(1)}%`);
    if (val.netMargin  != null) lines.push(`  Net Margin: ${val.netMargin.toFixed(1)}%`);
    if (val.evEbitda   != null) lines.push(`  EV/EBITDA: ${val.evEbitda.toFixed(1)}x`);
    if (val.marketCap  != null) lines.push(`  Market Cap: $${(val.marketCap / 1000).toFixed(1)}B`);
  }
  if (fin) {
    lines.push('Financials (latest annual):');
    if (fin.revenue?.value    != null) lines.push(`  Revenue: $${(fin.revenue.value / 1e9).toFixed(1)}B`);
    if (fin.netIncome?.value  != null) lines.push(`  Net Income: $${(fin.netIncome.value / 1e9).toFixed(1)}B`);
    if (fin.operatingCF?.value != null) {
      const fcf = fin.operatingCF.value - (fin.capex?.value ?? 0);
      const fcfPct = fin.revenue?.value ? ((fcf / fin.revenue.value) * 100).toFixed(1) : null;
      lines.push(`  FCF: $${(fcf / 1e9).toFixed(1)}B${fcfPct != null ? ` (${fcfPct}% margin)` : ''}`);
    }
  }

  const anthropicBody = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: `You are a financial analyst. Provide a brief investment snapshot for ${symbol} based on the following data.

${lines.join('\n')}

Respond with JSON only (no markdown, no extra text). Each bull/bear case should be one concise sentence (10-15 words):
{"bullCases":["point","point","point"],"bearCases":["point","point","point"],"summary":"One sentence investor thesis."}`,
    }],
  };
  console.log('[ai-summary] snapshot request for', symbol, '— context lines:', lines);

  let res, raw;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(anthropicBody),
    });
    raw = await res.json();
  } catch (e) {
    console.error('[ai-summary] fetch to Anthropic failed:', e);
    return Response.json({ error: 'Network error reaching AI service' }, { status: 500 });
  }

  console.log('[ai-summary] Anthropic response status:', res.status, '— body:', JSON.stringify(raw));

  if (!res.ok) {
    console.error('[ai-summary] Anthropic API error — status:', res.status, '| full body:', JSON.stringify(raw, null, 2));
    return Response.json({ error: raw.error?.message ?? raw.error?.type ?? 'API error' }, { status: 500 });
  }

  const text = raw.content?.[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    console.error('[ai-summary] parse error — raw text:', text);
    return Response.json({ error: 'Parse error' }, { status: 500 });
  }
  try {
    return Response.json(JSON.parse(match[0]), {
      headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' },
    });
  } catch {
    console.error('[ai-summary] JSON.parse failed on:', match[0]);
    return Response.json({ error: 'Parse error' }, { status: 500 });
  }
}
