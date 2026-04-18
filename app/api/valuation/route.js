import { parseTickers } from '@/lib/holdings';
import { trackFinnhub, trackFMP } from '@/lib/apiUsage';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const holdings = parseTickers(searchParams);
  if (!holdings.length) return Response.json([]);

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return Response.json({ error: 'Missing API key' }, { status: 500 });

  const fmpKey = process.env.FMP_API_KEY;
  trackFinnhub(holdings.length); // 1 call per ticker
  if (fmpKey) trackFMP(holdings.length).catch(() => {}); // 1 call per ticker

  const results = await Promise.all(
    holdings.map(async h => {
      try {
        const [finnhubRes, analystRes] = await Promise.all([
          fetch(
            `https://finnhub.io/api/v1/stock/metric?symbol=${h.t}&metric=all&token=${key}`,
            { next: { revalidate: 86400 } }
          ),
          fmpKey
            ? fetch(
                `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${h.t}&limit=2&apikey=${fmpKey}`,
                { cache: 'no-store' }
              )
            : Promise.resolve(null),
        ]);

        const finnhubData = await finnhubRes.json();
        const m = finnhubData?.metric;

        // Derive current price from Finnhub TTM P/E × TTM EPS
        const fhPrice = (m?.peBasicExclExtraTTM != null && m?.epsBasicExclExtraTTM != null && m.epsBasicExclExtraTTM !== 0)
          ? m.peBasicExclExtraTTM * m.epsBasicExclExtraTTM
          : null;

        let forwardPE = null;

        if (analystRes?.ok) {
          try {
            const analystData = await analystRes.json();
            // index 0 = next year's estimates (most forward period)
            if (h.t === 'AMD') console.log('[valuation] FMP analyst-estimates AMD (raw):', JSON.stringify(analystData, null, 2));
            const forwardEPS = Array.isArray(analystData) ? (analystData[0]?.estimatedEpsAvg ?? null) : null;
            if (forwardEPS != null && forwardEPS !== 0 && fhPrice != null) {
              forwardPE = fhPrice / forwardEPS;
            }
          } catch {}
        }

        // Fallback: Finnhub epsForwardTTM
        if (forwardPE === null && fhPrice != null && m?.epsForwardTTM != null && m.epsForwardTTM !== 0) {
          forwardPE = fhPrice / m.epsForwardTTM;
        }

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
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=300' }
  });
}
