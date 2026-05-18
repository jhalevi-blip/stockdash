// app/api/analyst-ratings/route.js
// Finnhub: /stock/recommendation (consensus) + /stock/price-target (PT range)
// FMP:     stable/grades-historical (recent rating actions)

export const dynamic = 'force-dynamic';

import { trackFMP } from '@/lib/apiUsage';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.toUpperCase();
  if (!ticker) return Response.json({ error: 'Missing ticker' }, { status: 400 });

  const finnhubKey = process.env.FINNHUB_API_KEY;
  const fmpKey     = process.env.FMP_API_KEY;

  const [recData, ptData, gradesData] = await Promise.all([
    finnhubKey
      ? fetch(
          `https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${finnhubKey}`,
          { next: { revalidate: 3600 } }
        ).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null),

    finnhubKey
      ? fetch(
          `https://finnhub.io/api/v1/stock/price-target?symbol=${ticker}&token=${finnhubKey}`,
          { next: { revalidate: 3600 } }
        ).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null),

    fmpKey
      ? fetch(
          `https://financialmodelingprep.com/stable/grades-historical?symbol=${ticker}&limit=10&apikey=${fmpKey}`,
          { next: { revalidate: 3600 } }
        ).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (fmpKey && Array.isArray(gradesData) && gradesData.length > 0) {
    trackFMP(1).catch(() => {});
  }

  // Most recent recommendation period from Finnhub
  const latestRec = Array.isArray(recData) && recData.length > 0 ? recData[0] : null;
  const consensus = latestRec ? {
    strongBuy:  latestRec.strongBuy  ?? 0,
    buy:        latestRec.buy        ?? 0,
    hold:       latestRec.hold       ?? 0,
    sell:       latestRec.sell       ?? 0,
    strongSell: latestRec.strongSell ?? 0,
    period:     latestRec.period,
  } : null;

  // Price target range
  const priceTarget = ptData?.targetMean != null ? {
    mean:      ptData.targetMean,
    high:      ptData.targetHigh,
    low:       ptData.targetLow,
    median:    ptData.targetMedian,
    analysts:  ptData.numberOfAnalysts,
  } : null;

  // Recent grade changes from FMP
  const recentChanges = Array.isArray(gradesData)
    ? gradesData.slice(0, 10).map(g => ({
        date:   g.date,
        firm:   g.gradingCompany,
        action: g.action,       // e.g. "upgrade", "downgrade", "initiated", "reiterated"
        from:   g.previousGrade,
        to:     g.newGrade,
      }))
    : [];

  return Response.json(
    { ticker, consensus, priceTarget, recentChanges },
    { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=900' } }
  );
}
