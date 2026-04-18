import { parseTickers } from '@/lib/holdings';
import { trackFinnhub, trackFMP } from '@/lib/apiUsage';

export const dynamic = 'force-dynamic'; // ensure function body always executes

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const holdings = parseTickers(searchParams);
  if (!holdings.length) return Response.json([]);

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return Response.json({ error: 'Missing API key' }, { status: 500 });

  const fmpKey = process.env.FMP_API_KEY;
  trackFinnhub(holdings.length * 2); // metric + quote per ticker
  if (fmpKey) trackFMP(holdings.length).catch(() => {}); // 1 call per ticker

  const results = await Promise.all(
    holdings.map(async h => {
      try {
        const [metricRes, quoteRes, analystRes] = await Promise.all([
          fetch(
            `https://finnhub.io/api/v1/stock/metric?symbol=${h.t}&metric=all&token=${key}`,
            { cache: 'no-store' }
          ),
          fetch(
            `https://finnhub.io/api/v1/quote?symbol=${h.t}&token=${key}`,
            { cache: 'no-store' }
          ),
          fmpKey
            ? fetch(
                `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${h.t}&period=annual&limit=2&apikey=${fmpKey}`,
                { cache: 'no-store' }
              )
            : Promise.resolve(null),
        ]);

        const finnhubData = await metricRes.json();
        const m = finnhubData?.metric;

        const quoteData = await quoteRes.json();
        const currentPrice = quoteData?.c ?? null; // c = current price from Finnhub quote

        let forwardPE = null;
        let analystData = null;

        if (analystRes) {
          const rawBody = await analystRes.text();
          if (h.t === 'AMD') console.log('[valuation] AMD FMP analyst-estimates — status:', analystRes.status, '| body:', rawBody.slice(0, 500));
          if (analystRes.ok) {
            try {
              analystData = JSON.parse(rawBody);
              const forwardEPS = Array.isArray(analystData) ? (analystData[0]?.estimatedEpsAvg ?? null) : null;
              if (forwardEPS != null && forwardEPS !== 0 && currentPrice != null) {
                forwardPE = currentPrice / forwardEPS;
              }
            } catch {}
          }
        }

        // Fallback: Finnhub epsForwardTTM
        if (forwardPE === null && currentPrice != null && m?.epsForwardTTM != null && m.epsForwardTTM !== 0) {
          forwardPE = currentPrice / m.epsForwardTTM;
        }

        if (h.t === 'AMD') console.log('[valuation] AMD —', JSON.stringify({
          currentPrice,
          epsForwardTTM: m?.epsForwardTTM,
          analystData,
          forwardPE,
        }));

        return {
          ticker: h.t,
          name:   h.n,
          peRatio:     m?.peBasicExclExtraTTM                  ?? null,
          forwardPE,
          pbRatio:     m?.pbAnnual                             ?? null,
          psRatio:     m?.psAnnual                             ?? null,
          evEbitda:    m?.evEbitdaTTM ?? m?.enterpriseValueEbitdaTTM ?? null,
          debtEquity:  m?.['longTermDebt/equityAnnual']        ?? null,
          roe:         m?.roeRfy                               ?? null,
          roa:         m?.roaRfy                               ?? null,
          netMargin:   m?.netProfitMarginTTM                   ?? null,
          grossMargin: m?.grossMarginTTM                       ?? null,
          marketCap:   m?.marketCapitalization                 ?? null,
          beta:        m?.beta                                 ?? null,
        };
      } catch {
        return { ticker: h.t, name: h.n };
      }
    })
  );

  return Response.json(results, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
