import { trackFMP } from '@/lib/apiUsage';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('tickers') ?? '';

  if (!raw.trim()) {
    return Response.json({ error: 'Missing tickers param' }, { status: 400 });
  }

  const tickers = raw.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);

  if (tickers.length < 1 || tickers.length > 20) {
    return Response.json({ error: 'Provide between 1 and 20 tickers' }, { status: 400 });
  }

  const invalid = tickers.filter(t => !/^[A-Z0-9]+$/.test(t));
  if (invalid.length) {
    return Response.json({ error: `Invalid tickers: ${invalid.join(', ')}` }, { status: 400 });
  }

  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) {
    return Response.json({ error: 'FMP_API_KEY not configured' }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const fromDate = oneYearAgo.toISOString().slice(0, 10);

  trackFMP(tickers.length).catch(() => {});

  const results = await Promise.all(
    tickers.map(async ticker => {
      try {
        const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${ticker}&from=${fromDate}&to=${today}&apikey=${fmpKey}`;
        const res = await fetch(url, { next: { revalidate: 86400 } });

        if (!res.ok) {
          console.error(`[historical-prices] FMP ${res.status} for ${ticker}`);
          return { ticker, prices: null };
        }

        const json = await res.json();

        // stable endpoint returns array directly; v3 returns { historical: [...] }
        let rows;
        if (Array.isArray(json)) {
          rows = json;
        } else if (Array.isArray(json?.historical)) {
          rows = json.historical;
        } else {
          console.error(`[historical-prices] unexpected FMP shape for ${ticker}:`, JSON.stringify(json).slice(0, 200));
          return { ticker, prices: null };
        }

        const prices = rows
          .filter(d => d.date && d.close != null)
          .map(d => ({ date: d.date, close: +d.close }))
          .sort((a, b) => a.date.localeCompare(b.date));

        if (!prices.length) {
          console.error(`[historical-prices] no usable data for ${ticker}`);
          return { ticker, prices: null };
        }

        return { ticker, prices };
      } catch (err) {
        console.error(`[historical-prices] fetch failed for ${ticker}:`, err);
        return { ticker, prices: null };
      }
    })
  );

  const successful = results.filter(r => r.prices !== null).map(r => ({ ticker: r.ticker, prices: r.prices }));
  const failedTickers = results.filter(r => r.prices === null).map(r => r.ticker);

  if (successful.length === 0) {
    return Response.json({ error: 'All ticker fetches failed', failedTickers }, { status: 500 });
  }

  return Response.json(
    { data: successful, failedTickers },
    { headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=43200' } }
  );
}
