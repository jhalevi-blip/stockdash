import { trackFMP } from '@/lib/apiUsage';

export const dynamic = 'force-dynamic';

// Normalize any date string to a canonical quarter key e.g. "2025-Q2"
function toQuarterKey(dateStr) {
  const d = new Date(dateStr);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const quarter = Math.ceil(month / 3);
  return `${year}-Q${quarter}`;
}

// "2025-Q2" → "Q2 2025"
function quarterKeyToDisplay(key) {
  const [year, q] = key.split('-');
  return `${q} ${year}`;
}

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

// EDGAR: GAAP EPS only, no estimates. Lowest priority for actual.
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
        period:     d.end,
        quarterKey: toQuarterKey(d.end),
        actual:     d.val,
        estimate:   null,
      }));
  } catch {
    return [];
  }
}

// Finnhub: non-GAAP EPS + estimates. Highest priority for actual.
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
      period:     d.period,
      quarterKey: toQuarterKey(d.period),
      actual:     d.actual   ?? null,
      estimate:   d.estimate ?? null,
    }));
  } catch {
    return [];
  }
}

// FMP stable/earnings: non-GAAP EPS + estimates + revenue. Highest priority for estimate.
async function fetchFMP(symbol) {
  try {
    const key = process.env.FMP_API_KEY;
    if (!key) return new Map();
    const res = await fetch(
      `https://financialmodelingprep.com/stable/earnings?symbol=${symbol}&limit=20&apikey=${key}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return new Map();
    const data = await res.json();
    if (!Array.isArray(data)) return new Map();
    trackFMP(1).catch(() => {});
    // Key by quarter — FMP `date` is the fiscal period end date
    const map = new Map();
    for (const d of data) {
      if (!d.date) continue;
      const qk = toQuarterKey(d.date);
      if (!map.has(qk)) { // first entry per quarter wins
        map.set(qk, {
          period:          d.date,
          actual:          d.epsActual       ?? null,
          estimate:        d.epsEstimated    ?? null,
          revenueActual:   d.revenueActual   ?? null,
          revenueEstimate: d.revenueEstimated ?? null,
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
    console.log('[earnings-history] AMD EDGAR quarterKeys:', edgarRows.map(r => `${r.quarterKey}=${r.actual}`));
    console.log('[earnings-history] AMD Finnhub quarterKeys:', finnhubRows.map(r => `${r.quarterKey}=${r.actual}`));
    console.log('[earnings-history] AMD FMP quarterKeys:', [...fmpMap.entries()].map(([k, v]) => `${k}=${v.actual}`));
  }

  // Build index maps keyed by quarter
  const edgarByQ   = new Map(edgarRows.map(r => [r.quarterKey, r]));
  const finnhubByQ = new Map(finnhubRows.map(r => [r.quarterKey, r]));

  // Union of all quarter keys across all three sources
  const allKeys = new Set([
    ...edgarByQ.keys(),
    ...finnhubByQ.keys(),
    ...fmpMap.keys(),
  ]);

  const merged = new Map();
  for (const qk of allKeys) {
    const edgar   = edgarByQ.get(qk);
    const fh      = finnhubByQ.get(qk);
    const fmp     = fmpMap.get(qk);

    // actual:   Finnhub (non-GAAP) > FMP > EDGAR (GAAP)
    const actual = fh?.actual ?? fmp?.actual ?? edgar?.actual ?? null;
    // estimate: FMP > Finnhub
    const estimate = fmp?.estimate ?? fh?.estimate ?? null;
    // period string for chart date matching: Finnhub > FMP > EDGAR
    const period = fh?.period ?? fmp?.period ?? edgar?.period;

    merged.set(qk, {
      period,
      quarterKey:      qk,
      displayQuarter:  quarterKeyToDisplay(qk),
      actual,
      estimate,
      revenueActual:   fmp?.revenueActual   ?? null,
      revenueEstimate: fmp?.revenueEstimate ?? null,
    });
  }

  const results = [...merged.values()]
    .sort((a, b) => a.quarterKey.localeCompare(b.quarterKey))
    .slice(-12);

  return Response.json(results, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=300' },
  });
}
