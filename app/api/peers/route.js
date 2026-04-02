// app/api/peers/route.js
// Fetches peer tickers from Finnhub, then pulls metrics for each peer

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.toUpperCase();
  const key    = process.env.FINNHUB_API_KEY;

  if (!ticker) return Response.json({ error: 'Missing ticker param' }, { status: 400 });
  if (!key)    return Response.json({ error: 'Missing API key' }, { status: 500 });

  try {
    // Step 1: get peer list from Finnhub
    const peersRes = await fetch(
      `https://finnhub.io/api/v1/stock/peers?symbol=${ticker}&token=${key}`,
      { next: { revalidate: 86400 } }
    );
    const peersRaw = await peersRes.json();

    // Finnhub returns an array of tickers including the queried one
    // Limit to 6 peers max to avoid rate limits
    const allTickers = Array.isArray(peersRaw) ? peersRaw : [];
    const peers = [ticker, ...allTickers.filter(t => t !== ticker).slice(0, 5)];

    // Step 2: fetch metrics for each peer in parallel
    const results = await Promise.all(
      peers.map(async (t) => {
        try {
          const [metricRes, profileRes] = await Promise.all([
            fetch(
              `https://finnhub.io/api/v1/stock/metric?symbol=${t}&metric=all&token=${key}`,
              { next: { revalidate: 86400 } }
            ),
            fetch(
              `https://finnhub.io/api/v1/stock/profile2?symbol=${t}&token=${key}`,
              { next: { revalidate: 86400 } }
            ),
          ]);

          const metricData  = await metricRes.json();
          const profileData = await profileRes.json();
          const m = metricData?.metric;

          return {
            ticker:      t,
            name:        profileData?.name ?? t,
            isBase:      t === ticker,
            // Valuation
            peRatio:     m?.peBasicExclExtraTTM        ?? null,
            forwardPE:   m?.peNormalizedAnnual          ?? null,
            pbRatio:     m?.pbAnnual                    ?? null,
            psRatio:     m?.psAnnual                    ?? null,
            evEbitda:    m?.evEbitdaAnnual               ?? null,
            marketCap:   m?.marketCapitalization         ?? null,
            // Financials
            revenueGrowth: m?.revenueGrowthTTMYoy       ?? null,
            grossMargin:   m?.grossMarginTTM             ?? null,
            netMargin:     m?.netProfitMarginTTM         ?? null,
            roe:           m?.roeRfy                     ?? null,
            roa:           m?.roaRfy                     ?? null,
            debtEquity:    m?.totalDebt2TotalEquityAnnual ?? null,
            // Price
            week52High:  m?.['52WeekHigh']              ?? null,
            week52Low:   m?.['52WeekLow']               ?? null,
            beta:        m?.beta                        ?? null,
          };
        } catch {
          return { ticker: t, name: t, isBase: t === ticker };
        }
      })
    );

    return Response.json(results, {
      headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
