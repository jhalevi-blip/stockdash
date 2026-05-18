// app/api/valuation-history/route.js
// FMP stable/ratios: 5-year history of valuation multiples + averages

export const dynamic = 'force-dynamic';

import { trackFMP } from '@/lib/apiUsage';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.toUpperCase();
  if (!ticker) return Response.json({ error: 'Missing ticker' }, { status: 400 });

  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return Response.json({ error: 'FMP not configured' }, { status: 503 });

  let data;
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/ratios?symbol=${ticker}&limit=5&apikey=${fmpKey}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return Response.json({ error: 'FMP fetch failed' }, { status: 502 });
    data = await res.json();
  } catch {
    return Response.json({ error: 'Network error' }, { status: 502 });
  }

  trackFMP(1).catch(() => {});

  if (!Array.isArray(data) || data.length === 0) {
    return Response.json({ ticker, history: [], averages: {} },
      { headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' } });
  }

  const history = data.map(row => ({
    year:        row.calendarYear ?? row.date?.slice(0, 4),
    pe:          row.priceEarningsRatio   ?? null,
    ps:          row.priceToSalesRatio    ?? null,
    pb:          row.priceToBookRatio     ?? null,
    evEbitda:    row.enterpriseValueMultiple ?? null,
    netMargin:   row.netProfitMargin  != null ? row.netProfitMargin  * 100 : null,
    grossMargin: row.grossProfitMargin != null ? row.grossProfitMargin * 100 : null,
    roe:         row.returnOnEquity   != null ? row.returnOnEquity   * 100 : null,
  }));

  function avg(key) {
    const vals = history.map(h => h[key]).filter(v => v != null && isFinite(v) && v > 0);
    if (!vals.length) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }

  const averages = {
    pe:          avg('pe'),
    ps:          avg('ps'),
    pb:          avg('pb'),
    evEbitda:    avg('evEbitda'),
    netMargin:   avg('netMargin'),
    grossMargin: avg('grossMargin'),
    roe:         avg('roe'),
  };

  return Response.json({ ticker, history, averages },
    { headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' } });
}
