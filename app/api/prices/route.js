import { parseTickers } from '@/lib/holdings';
import { trackFinnhub } from '@/lib/apiUsage';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const holdings = parseTickers(searchParams);
  if (!holdings.length) return Response.json([]);

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return Response.json({ error: 'Missing API key' }, { status: 500 });

  trackFinnhub(holdings.length * 2); // quote + metric per ticker

  const results = await Promise.all(
    holdings.map(async h => {
      const [quote, metric] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/quote?symbol=${h.t}&token=${key}`, { next: { revalidate: 60 } }).then(r => r.json()),
        fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${h.t}&metric=all&token=${key}`, { next: { revalidate: 3600 } }).then(r => r.json()),
      ]);
      return {
        ticker: h.t,
        price: quote.c > 0 ? quote.c : quote.pc,
        chgPct: quote.dp,
        high: quote.h,
        low: quote.l,
        prevClose: quote.pc,
        marketOpen: quote.c > 0,
        week52High: metric?.metric?.['52WeekHigh'] ?? null,
        week52Low: metric?.metric?.['52WeekLow'] ?? null,
      };
    })
  );

  return Response.json(results, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' }
  });
}
