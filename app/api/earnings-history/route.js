import { trackFMP } from '@/lib/apiUsage';

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
      `https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&limit=12&token=${key}`,
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

async function fetchFMP(symbol) {
  try {
    const key = process.env.FMP_API_KEY;
    if (!key) return new Map();
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/historical/earning_calendar/${symbol}?apikey=${key}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return new Map();
    const data = await res.json();
    if (!Array.isArray(data)) return new Map();
    trackFMP(1).catch(() => {});
    // Key by fiscalDateEnding (YYYY-MM-DD) — matches EDGAR period end dates
    const map = new Map();
    for (const d of data) {
      if (d.fiscalDateEnding) {
        map.set(d.fiscalDateEnding, {
          estimate:        d.epsEstimated        ?? null,
          revenueActual:   d.revenue             ?? null,
          revenueEstimate: d.revenueEstimated    ?? null,
        });
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();

  if (!symbol) return Response.json({ error: 'Missing symbol param' }, { status: 400 });

  const cik = await lookupCIK(symbol);

  const [edgarRows, finnhubRows, fmpMap] = await Promise.all([
    cik ? fetchEdgar(cik) : Promise.resolve([]),
    fetchFinnhub(symbol),
    fetchFMP(symbol),
  ]);

  if (symbol === 'AMD') {
    console.log('[earnings-history] AMD EDGAR periods:', edgarRows.map(r => r.period));
    console.log('[earnings-history] AMD Finnhub periods:', finnhubRows.map(r => r.period));
    console.log('[earnings-history] AMD FMP fiscalDateEndings:', [...fmpMap.keys()]);
  }

  // Merge: start with EDGAR, overlay Finnhub (which has estimates) for matching periods
  const merged = new Map();
  for (const row of edgarRows)   merged.set(row.period, row);
  for (const row of finnhubRows) merged.set(row.period, row); // Finnhub wins on overlap

  // Fill estimate (and revenue fields) from FMP for quarters still missing an estimate
  for (const [period, row] of merged) {
    if (row.estimate === null && fmpMap.has(period)) {
      const fmp = fmpMap.get(period);
      merged.set(period, {
        ...row,
        estimate:        fmp.estimate,
        revenueActual:   row.revenueActual   ?? fmp.revenueActual,
        revenueEstimate: row.revenueEstimate ?? fmp.revenueEstimate,
      });
    }
  }

  const results = [...merged.values()]
    .sort((a, b) => new Date(a.period) - new Date(b.period))
    .slice(-12);

  return Response.json(results, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=300' },
  });
}
