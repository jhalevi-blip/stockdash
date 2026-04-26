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
        `https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(q)}&limit=25&apikey=${fmpKey}`,
        { next: { revalidate: 86400 } }
      ),
      fetch(
        `https://financialmodelingprep.com/stable/search-name?query=${encodeURIComponent(q)}&limit=25&apikey=${fmpKey}`,
        { next: { revalidate: 86400 } }
      ),
    ]);

    const [symbolData, nameData] = await Promise.all([
      symbolRes.ok ? symbolRes.json() : [],
      nameRes.ok  ? nameRes.json()   : [],
    ]);

    const qUpper = q.toUpperCase();
    const DERIVATIVE_RE = /direxion daily|t-rex \d+x|proshares ultra|leveraged|inverse|ultra short|ultra pro|\bx daily\b|\d+x long|\d+x short|\bbull\b|\bbear\b/i;

    function score(r) {
      let s = 0;
      const sym = r.symbol.toUpperCase();
      const exch = r.exchange ?? '';
      if (sym === qUpper)             s += 1000; // exact match
      if (sym.startsWith(qUpper))     s +=  500; // prefix match
      if (/NASDAQ|NYSE/.test(exch))   s +=  200; // major US exchange
      else if (/CBOE/.test(exch))     s +=  100; // secondary US exchange
      if (DERIVATIVE_RE.test(r.name)) s -=  300; // derivative/leveraged ETF penalty
      const excess = sym.length - 4;
      if (excess > 0)                 s -= excess * 10; // long-symbol penalty
      return s;
    }

    // Merge, deduplicate, score, cap at 5
    const seen = new Set();
    const merged = [...(Array.isArray(symbolData) ? symbolData : []),
                    ...(Array.isArray(nameData)   ? nameData   : [])]
      .filter(r => r.symbol && r.name && !seen.has(r.symbol) && seen.add(r.symbol))
      .sort((a, b) => score(b) - score(a))
      .slice(0, 5)
      .map(r => ({ symbol: r.symbol, name: r.name, exchange: r.exchange ?? '' }));

    return Response.json(merged, {
      headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800' },
    });
  } catch {
    return Response.json([]);
  }
}
