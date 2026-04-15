// app/api/chart/route.js
// Uses Yahoo Finance for historical candle data (up to 5 years)

const RANGE_MAP = {
  '1y': { range: '1y', interval: '1wk' },
  '3y': { range: '3y', interval: '1wk' },
  '5y': { range: '5y', interval: '1mo' },
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const rangeParam = searchParams.get('range') ?? '1y';

  if (!symbol) {
    return Response.json({ error: 'Missing symbol param' }, { status: 400 });
  }

  const { range, interval } = RANGE_MAP[rangeParam] ?? RANGE_MAP['1y'];

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        next: { revalidate: 3600 }, // cache 1 hour
      }
    );

    if (!res.ok) {
      return Response.json({ candles: [] });
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return Response.json({ candles: [] });
    }

    const timestamps = result.timestamp || [];
    const closes     = result.indicators?.quote?.[0]?.close || [];
    const opens      = result.indicators?.quote?.[0]?.open  || [];
    const highs      = result.indicators?.quote?.[0]?.high  || [];
    const lows       = result.indicators?.quote?.[0]?.low   || [];
    const volumes    = result.indicators?.quote?.[0]?.volume || [];

    const candles = timestamps.map((ts, i) => ({
      date:  new Date(ts * 1000).toISOString().slice(0, 10),
      label: new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      close:  closes[i]  ?? null,
      open:   opens[i]   ?? null,
      high:   highs[i]   ?? null,
      low:    lows[i]    ?? null,
      volume: volumes[i] ?? null,
    })).filter(c => c.close != null);

    return Response.json({ candles }, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('[chart] Error:', err);
    return Response.json({ candles: [] });
  }
}
