import { trackFMP } from '@/lib/apiUsage';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (q.length < 2) return Response.json([]);

  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return Response.json([]);

  try {
    trackFMP(2).catch(() => {}); // 1 symbol call + 1 name call

    const [symbolRes, nameRes] = await Promise.all([
      fetch(
        `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(q)}&limit=10&apikey=${fmpKey}`,
        { next: { revalidate: 86400 } }
      ),
      fetch(
        `https://financialmodelingprep.com/stable/search-name?query=${encodeURIComponent(q)}&limit=10&apikey=${fmpKey}`,
        { next: { revalidate: 86400 } }
      ),
    ]);

    const [symbolData, nameData] = await Promise.all([
      symbolRes.ok ? symbolRes.json() : [],
      nameRes.ok  ? nameRes.json()   : [],
    ]);

    // Merge, deduplicate by symbol, prefer US exchanges, cap at 5
    const seen = new Set();
    const merged = [...(Array.isArray(symbolData) ? symbolData : []),
                    ...(Array.isArray(nameData)   ? nameData   : [])]
      .filter(r => r.symbol && r.name && !seen.has(r.symbol) && seen.add(r.symbol))
      .sort((a, b) => {
        const usA = /NASDAQ|NYSE|CBOE/.test(a.exchange) ? 0 : 1;
        const usB = /NASDAQ|NYSE|CBOE/.test(b.exchange) ? 0 : 1;
        return usA - usB;
      })
      .slice(0, 5)
      .map(r => ({ symbol: r.symbol, name: r.name, exchange: r.exchange ?? '' }));

    return Response.json(merged, {
      headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800' },
    });
  } catch {
    return Response.json([]);
  }
}
