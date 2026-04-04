async function lookupCIK(ticker) {
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': 'PortfolioIntel/1.0 contact@portfoliointel.app' },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const entry = Object.values(data).find(e => e.ticker === ticker);
  return entry ? String(entry.cik_str).padStart(10, '0') : null;
}

async function fetchEdgar(cik) {
  try {
    const res = await fetch(
      `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/EarningsPerShareDiluted.json`,
      {
        headers: {
          'User-Agent': 'PortfolioIntel/1.0 contact@portfoliointel.app',
          'Accept': 'application/json',
        },
        next: { revalidate: 86400 },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const units = data?.units?.['USD/shares'] ?? data?.units?.shares ?? [];
    const quarterly = units.filter(d => d.form === '10-Q' && d.val != null);
    const byEnd = new Map();
    for (const d of quarterly) {
      const existing = byEnd.get(d.end);
      if (!existing || d.filed > existing.filed) byEnd.set(d.end, d);
    }
    return [...byEnd.values()]
      .sort((a, b) => new Date(a.end) - new Date(b.end))
      .slice(-12)
      .map(d => ({
        period:          d.end,
        actual:          d.val,
        estimate:        null,
        revenueActual:   null,
        revenueEstimate: null,
      }));
  } catch {
    return [];
  }
}

async function fetchFinnhub(symbol) {
  try {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) return [];
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&limit=4&token=${key}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(d => ({
      period:          d.period,
      actual:          d.actual   ?? null,
      estimate:        d.estimate ?? null,
      revenueActual:   null,
      revenueEstimate: null,
    }));
  } catch {
    return [];
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();

  if (!symbol) return Response.json({ error: 'Missing symbol param' }, { status: 400 });

  const cik = await lookupCIK(symbol);

  const [edgarRows, finnhubRows] = await Promise.all([
    cik ? fetchEdgar(cik) : Promise.resolve([]),
    fetchFinnhub(symbol),
  ]);

  // Merge: start with EDGAR, overlay Finnhub (which has estimates) for matching periods
  const merged = new Map();
  for (const row of edgarRows)   merged.set(row.period, row);
  for (const row of finnhubRows) merged.set(row.period, row); // Finnhub wins on overlap

  const results = [...merged.values()]
    .sort((a, b) => new Date(a.period) - new Date(b.period))
    .slice(-12);

  return Response.json(results, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=300' },
  });
}
