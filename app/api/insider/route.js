import { parseTickers } from '@/lib/holdings';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const holdings = parseTickers(searchParams);
  if (!holdings.length) return Response.json([]);

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return Response.json({ error: 'Missing API key' }, { status: 500 });

  const results = await Promise.all(
    holdings.map(h =>
      fetch(`https://finnhub.io/api/v1/stock/insider-transactions?symbol=${h.t}&token=${key}`)
        .then(r => r.json())
        .then(d => (d.data || []).slice(0, 3).map(t => ({
          ticker: h.t,
          name: t.name,
          share: t.share,
          change: t.change,
          transactionDate: t.transactionDate,
          transactionCode: t.transactionCode,
          transactionPrice: t.transactionPrice,
        })))
        .catch(() => [])
    )
  );

  const all = results.flat()
    .filter(t => t.change !== 0)
    .sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate))
    .slice(0, 30);

  return Response.json(all);
}
