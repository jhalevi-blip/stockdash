import { parseTickers } from '@/lib/holdings';
import { trackFinnhub } from '@/lib/apiUsage';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const holdings = parseTickers(searchParams);
  if (!holdings.length) return Response.json([]);

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return Response.json({ error: 'Missing API key' }, { status: 500 });

  trackFinnhub(holdings.length); // quote per ticker (52-week metric served by /api/valuation)

  const results = await Promise.all(
    holdings.map(async h => {
      const quote = await fetch(`https://finnhub.io/api/v1/quote?symbol=${h.t}&token=${key}`, { next: { revalidate: 60 } }).then(r => r.json());
      return {
        ticker: h.t,
        price: quote.c > 0 ? quote.c : quote.pc,
        chgPct: quote.dp,
        high: quote.h,
        low: quote.l,
        prevClose: quote.pc,
        marketOpen: quote.c > 0,
      };
    })
  );

  return Response.json(results, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' }
  });
}
