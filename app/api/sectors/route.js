import { trackFMP } from '@/lib/apiUsage';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('tickers') ?? '';

  if (!raw.trim()) {
    return Response.json({ error: 'Missing tickers param' }, { status: 400 });
  }

  const tickers = raw
    .split(',')
    .map(t => t.trim().toUpperCase())
    .filter(t => t && /^[A-Z0-9.]+$/.test(t));

  if (tickers.length < 1 || tickers.length > 30) {
    return Response.json({ error: 'Provide between 1 and 30 valid tickers' }, { status: 400 });
  }

  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) {
    return Response.json({ error: 'FMP_API_KEY not configured' }, { status: 500 });
  }

  trackFMP(tickers.length).catch(() => {});

  const results = await Promise.all(
    tickers.map(async ticker => {
      try {
        const url = `https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apikey=${fmpKey}`;
        const res  = await fetch(url, { next: { revalidate: 86400 } });
        if (!res.ok) return null;
        const json = await res.json();
        const sector = Array.isArray(json) ? json[0]?.sector : json?.sector;
        if (!sector) return null;
        return { ticker, sector };
      } catch {
        return null;
      }
    })
  );

  const sectorMap = {};
  for (const entry of results) {
    if (entry) sectorMap[entry.ticker] = entry.sector;
  }

  return Response.json(sectorMap, {
    headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=43200' },
  });
}
