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
        let fmpPrice     = null;
        if (fmpRes?.ok) {
          try {
            const fmpData = await fmpRes.json();
            const km = Array.isArray(fmpData) ? fmpData[0] : null;
            if (h.t === 'AMD') console.log(`[valuation] FMP key-metrics AMD (full):`, JSON.stringify(km, null, 2));
            fmpForwardPE = km?.forwardPE ?? null;
            fmpPrice     = km?.price     ?? null;
            // Fallback 1: price / forwardEPS from FMP key-metrics
            if (fmpForwardPE === null && km?.forwardEPS != null && fmpPrice != null && km.forwardEPS !== 0) {
              fmpForwardPE = fmpPrice / km.forwardEPS;
            }
          } catch {}
        }
        // Fallback 2: price / Finnhub epsForwardTTM
        if (fmpForwardPE === null && fmpPrice != null && m?.epsForwardTTM != null && m.epsForwardTTM !== 0) {
          fmpForwardPE = fmpPrice / m.epsForwardTTM;
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
