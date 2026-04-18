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
        const [finnhubRes, fmpRes] = await Promise.all([
          fetch(
            `https://finnhub.io/api/v1/stock/metric?symbol=${h.t}&metric=all&token=${key}`,
            { next: { revalidate: 86400 } }
          ),
          fmpKey
            ? fetch(
                `https://financialmodelingprep.com/stable/key-metrics?symbol=${h.t}&limit=1&apikey=${fmpKey}`,
                { next: { revalidate: 86400 } }
              )
            : Promise.resolve(null),
        ]);

        const finnhubData = await finnhubRes.json();
        const m = finnhubData?.metric;

        let fmpForwardPE = null;
        if (fmpRes?.ok) {
          try {
            const fmpData = await fmpRes.json();
            fmpForwardPE = Array.isArray(fmpData) ? (fmpData[0]?.forwardPE ?? null) : null;
          } catch {}
        }

        return {
          ticker: h.t,
          name:   h.n,
          peRatio:     m?.peBasicExclExtraTTM                  ?? null,
          forwardPE:   fmpForwardPE,
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
