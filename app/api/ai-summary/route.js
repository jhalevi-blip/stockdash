import { summarizeCorrelationMatrix } from '@/lib/correlation';

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
      portfolio_shape: {
        type: ['object', 'null'],
        description: 'Structured analysis of how the portfolio clusters across investing lenses. Null ONLY if the portfolio has fewer than 3 positions — always attempt this for 3+ position portfolios.',
        properties: {
          headline: {
            type: 'string',
            description: "A single sentence, 15-25 words, naming the 1-2 strongest clusters with weights. Written in the active voice of a conviction investor. Example: \"What you're really long: AI capex (3 positions, 58% of equity) and homebuilders (2 positions, 12% of equity).\"",
          },
          primary_clusters: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: {
              type: 'object',
              properties: {
                lens: {
                  type: 'string',
                  enum: ['sector', 'theme', 'macro', 'geographic', 'size_style', 'commodity_input', 'supply_chain', 'event_policy', 'liquidity_fund_flow', 'factor_style'],
                  description: 'Which lens this cluster is grouped under. Stays in English (enum value).',
                },
                label:             { type: 'string', description: 'Plain-English name of the cluster, e.g. "AI capex" or "rate-sensitive growth". Translated to user locale.' },
                concentration_pct: { type: 'number', minimum: 0, maximum: 100, description: 'Sum of position weights in this cluster, as a percentage of total equity.' },
                positions:         { type: 'array', items: { type: 'string' }, description: 'Tickers in this cluster.' },
                explanation:       { type: 'string', description: 'One sentence explaining why these positions move together. Translated to user locale.' },
                confidence: {
                  type: 'string',
                  enum: ['data_verified', 'pattern_based'],
                  description: 'data_verified if cluster has 2+ positions AND avg pairwise r within cluster > 0.5. pattern_based otherwise — including single-position clusters and thematic/sector knowledge clusters. Liquidity/fund flow clusters MUST be pattern_based.',
                },
              },
              required: ['lens', 'label', 'concentration_pct', 'positions', 'explanation', 'confidence'],
            },
          },
          honorable_mentions: {
            type: ['array', 'null'],
            maxItems: 3,
            description: 'Smaller clusters worth naming but not dominant. Null if none worth surfacing.',
            items: {
              type: 'object',
              properties: {
                lens:      { type: 'string', enum: ['sector', 'theme', 'macro', 'geographic', 'size_style', 'commodity_input', 'supply_chain', 'event_policy', 'liquidity_fund_flow', 'factor_style'] },
                label:     { type: 'string' },
                positions: { type: 'array', items: { type: 'string' } },
                note:      { type: 'string', description: 'One sentence on why this is worth flagging.' },
              },
              required: ['lens', 'label', 'positions', 'note'],
            },
          },
          blind_spots: {
            type: ['array', 'null'],
            maxItems: 2,
            description: 'What the portfolio is conspicuously NOT exposed to. One or two short statements. Null if portfolio is broadly diversified.',
            items: { type: 'string' },
          },
        },
        required: ['headline', 'primary_clusters'],
      },
    },
    required: ['rating', 'rating_summary', 'overview', 'suggested_action', 'language', 'portfolio_shape'],
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

## Portfolio Shape — "What You're Really Long"

Analyze the portfolio across these 10 lenses and identify which 1-3 clusters are the STRONGEST signals for THIS portfolio. Do not surface weak clusters to fill quota — the value is in ranking, not coverage.

The 10 lenses:
1. sector — GICS sector (e.g., semiconductors, software, energy, financials)
2. theme — investable thesis (AI capex, GLP-1, reshoring, defense, EV transition, nuclear renaissance)
3. macro — what macro driver moves these positions (rates, inflation, dollar strength, recession sensitivity)
4. geographic — country/region exposure (US-domestic, China-exposed, Taiwan-dependent, EM)
5. size_style — market cap and growth/value tilt (mega-cap growth, profitless small-cap, value)
6. commodity_input — what commodity inputs matter (oil, copper, semis-input, energy-input)
7. supply_chain — physical supply chain dependencies (Taiwan fabs, China manufacturing, Mexico nearshoring)
8. event_policy — election/regulatory/policy sensitivity (FDA, antitrust, tariffs, election outcomes)
9. liquidity_fund_flow — known hedge fund / ETF crowding patterns (Mag 7, profitless tech basket, AI capex consensus)
10. factor_style — systematic factor exposure (momentum, quality, low-vol, high-beta, profitability)

## Rules for portfolio_shape

- Use correlation data as evidence. Pairs with r > 0.7 are strong evidence of shared exposure. Pairs with r < 0.3 are evidence of genuine diversification. Per-ticker average correlation tells you which positions move with the pack vs. which are real diversifiers.
- For each primary cluster, mark confidence:
    - "data_verified" if the cluster has 2+ positions AND the average pairwise r within the cluster > 0.5
    - "pattern_based" otherwise — including single-position clusters (no pairwise data) and any cluster where the underlying signal is thematic/sector knowledge rather than correlation evidence
- liquidity_fund_flow clusters MUST be marked "pattern_based" — we do not have 13F data yet. Reference well-known crowding patterns from training knowledge only (e.g., "AI Magnificent" basket, profitless tech consensus).
- No double-counting. A position appears in at most one primary cluster. If two lenses both identify the same position, pick the lens with the stronger signal for that position and drop it from the other cluster. Honorable mentions follow the same rule — a position cannot appear in both a primary cluster and an honorable mention.
- Cluster integrity. A primary cluster must contain positions that genuinely share an investable thesis. For data_verified clusters, this is enforced by the avg pairwise r > 0.5 threshold. For pattern_based clusters, you must be able to articulate a single specific shared thesis — not "they all have some macro sensitivity" or "they all benefit from rates." If the only commonality is a vague macro tilt, do NOT cluster them. Instead, surface the strongest 1-2 names as honorable mentions or note the scatter as a blind spot ("the rest of the book is genuinely uncorrelated, with no shared thesis tying SOFI / CELH / ELF / HNST together").
- Honest scatter handling. If the portfolio has fewer than 3 genuine clusters, return fewer primary clusters. Do not pad to 3 to fill the maxItems quota. A portfolio with one dominant theme and otherwise scattered positions is best described as exactly that — one primary cluster plus blind spots, not three forced clusters.
- Dominant single position. If any single position is ≥ 30% of equity, name it as its own primary cluster rather than merging with thematic neighbors. The cluster has: lens chosen from whichever angle is most defining (typically theme or sector), label that names both the position and its thesis (e.g., "AMD — concentrated AI compute bet"), positions of length 1, and confidence "pattern_based" (single-position clusters cannot be data_verified). The explanation should name what the bet is and acknowledge that other portfolio positions in similar themes (e.g., AMZN for AI infrastructure) are SEPARATE bets, not part of this cluster.
- Second-order theme connections. When clustering by theme, look beyond first-order matches. A power infrastructure position in a portfolio with AI compute exposure is part of the AI capex theme — the thesis is "AI needs power." A semis-equipment position in a portfolio with chip designers is part of the AI capex theme — the thesis is "AI needs chips." Pairwise correlation may be moderate (r=0.3-0.5) for these connections; cite the thesis, not the correlation, and mark confidence as "pattern_based".
- The headline is the single most important sentence — it appears prominently in the UI. Write it in the active voice of a conviction investor. Examples:
  - "What you're really long: AI capex (3 positions, 58% of equity) and homebuilders (2 positions, 12% of equity)."
  - "What you're really long: rate-sensitive growth — 7 of 10 positions, 71% of equity."
  - "What you're really long: AMD as a single concentrated AI compute bet (38% of equity), with AMZN as a separate AI infrastructure position (22%)."
- blind_spots should name what the portfolio CONSPICUOUSLY lacks — defensives, dividend payers, international exposure, fixed-income proxies, energy. Only surface 1-2 if they're meaningful absences. Skip if the portfolio is genuinely broad.
- If the portfolio has fewer than 3 positions, set portfolio_shape to null entirely.
- All free-text fields (headline, label, explanation, note, blind_spots items) translate to the user's locale. The lens and confidence enum values stay in English.
- Numerical accuracy rule applies: every equity weight you cite must be derivable from the marketValue fields provided. Cash is excluded from equity weights and carries no thesis exposure.

## Language

Write all text content in the language indicated by the user's browser locale. If the locale is unrecognized, default to English. The disclaimer sentence ("For informational purposes only, not financial advice.") must be translated naturally into the output language.

## Numerical accuracy

Every number you mention must be derivable from the data provided. Equity weights (expressed as % of total equity, excluding cash) must be computed from the marketValue fields given; do not include cash in a position's weight calculation. Never invent numbers. If you cannot support a claim with the data, do not make the claim.`;

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
    const { holdings, portfolioStats, userLang, correlationData } = body;
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

    const equityValue = portfolioStats.totalValue || 1; // guard against div/0; totalValue is equity only (excludes cash)
    const holdingLines = holdings.map(h => {
      const weightPct = fmt1((h.marketValue / equityValue) * 100);
      return `- ${h.ticker}: ${h.shares} shares, avg cost $${fmt2(h.avgCost)}, current price $${fmt2(h.currentPrice)}, P&L: ${fmt1(h.pnlPct)}%, market value $${fmt2(h.marketValue)} (${weightPct}% of equity)`;
    }).join('\n');

    let correlationBlock;
    if (correlationData?.tickers?.length >= 2 && correlationData?.matrix) {
      const { top_pairs, bottom_pairs, per_ticker_avg } = summarizeCorrelationMatrix(
        correlationData.tickers,
        correlationData.matrix,
      );
      const pairFmt = ({ a, b, r }) => `${a}/${b}: r=${r}`;
      correlationBlock = `Correlation data (Pearson r over ${correlationData.trading_days_used ?? '?'} trading days, ${correlationData.aligned_date_start} to ${correlationData.aligned_date_end}):
- Most correlated pairs: ${top_pairs.map(pairFmt).join(', ')}
- Least correlated pairs: ${bottom_pairs.map(pairFmt).join(', ')}
- Per-ticker avg r vs. rest of portfolio: ${per_ticker_avg.map(t => `${t.ticker}: ${t.avg_r}`).join(', ')}`;
    } else {
      correlationBlock = 'Correlation data: unavailable — do not claim data_verified confidence for any cluster.';
    }

    const userMessage = `Here is the user's stock portfolio:

Holdings (with equity weights):
${holdingLines}
Note: Weights are % of total equity; cash is reported separately and has no thesis exposure.

Portfolio totals:
- Total equity value: $${fmt2(portfolioStats.totalValue)}
- Total P&L: $${fmt2(portfolioStats.totalPnl)} (${fmt1(portfolioStats.totalPnlPct)}%)
- Cash position: $${fmt2(portfolioStats.cash)}

${correlationBlock}

User's browser locale: ${userLang || 'en'}`;

    let res, raw;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-opus-4-7',
          max_tokens: 1500,
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

    const result = toolUse.input;

    // ── Defend against missing suggested_action ───────────────────────────────
    if (!result.suggested_action) {
      console.warn('[ai-summary] portfolio-summary: suggested_action missing from generation');
      result.suggested_action = 'For informational purposes only, not financial advice.';
    }

    // ── Post-generation normalization: enforce 10% weight floor ───────────────
    if (result.portfolio_shape?.primary_clusters) {
      const kept = [];
      const demoted = [];
      for (const cluster of result.portfolio_shape.primary_clusters) {
        if (cluster.concentration_pct >= 10) {
          kept.push(cluster);
        } else {
          demoted.push({
            lens:      cluster.lens,
            label:     cluster.label,
            positions: cluster.positions,
            note:      cluster.explanation,
          });
        }
      }
      if (kept.length === 0) {
        result.portfolio_shape = null;
      } else {
        result.portfolio_shape.primary_clusters = kept;
        if (demoted.length > 0) {
          result.portfolio_shape.honorable_mentions = [
            ...(result.portfolio_shape.honorable_mentions ?? []),
            ...demoted,
          ];
        }
      }
    }

    return Response.json(result, { status: 200 });
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
