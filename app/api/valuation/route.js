import { parseTickers } from '@/lib/holdings';
import { trackFinnhub } from '@/lib/apiUsage';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const holdings = parseTickers(searchParams);
  if (!holdings.length) return Response.json([]);

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return Response.json({ error: 'Missing API key' }, { status: 500 });

  trackFinnhub(holdings.length); // 1 call per ticker

  const results = await Promise.all(
    holdings.map(async h => {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/stock/metric?symbol=${h.t}&metric=all&token=${key}`,
          { next: { revalidate: 86400 } }
        );
        const data = await res.json();
        const m = data?.metric;
        return {
          ticker: h.t,
          name:   h.n,
          peRatio:     m?.peBasicExclExtraTTM                  ?? null,
          forwardPE:   m?.peNormalizedAnnual                   ?? null,
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
