// app/api/financials/route.js
// Fetches annual financial data from SEC EDGAR XBRL API (free, no key needed)

export const revalidate = 86400; // cache entire route for 24 hours

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

// Primary and fallback EDGAR us-gaap concept tags
const CONCEPTS = {
  revenue:         'RevenueFromContractWithCustomerExcludingAssessedTax',
  revenueFb1:      'Revenues',
  revenueFb2:      'SalesRevenueNet',
  netIncome:       'NetIncomeLoss',
  eps:             'EarningsPerShareDiluted',
  assets:          'Assets',
  liabilities:     'Liabilities',
  equity:          'StockholdersEquity',
  operatingCF:     'NetCashProvidedByUsedInOperatingActivities',
  capex:           'PaymentsToAcquirePropertyPlantAndEquipment',
  grossProfit:     'GrossProfit',
  operatingIncome: 'OperatingIncomeLoss',
};

async function fetchConcept(cik, conceptTag) {
  const url =
    `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${conceptTag}.json`;

  const res = await fetch(url, {
    headers: {
      // SEC EDGAR requires a descriptive User-Agent with contact email
      'User-Agent': 'PortfolioIntel/1.0 contact@portfoliointel.app',
      'Accept-Encoding': 'gzip, deflate',
      'Accept': 'application/json',
    },
    next: { revalidate: 86400 }, // cache for 24 hours on Vercel
  });

  if (!res.ok) return null;

  try {
    return await res.json();
  } catch {
    return null;
  }
}

function extractQuarterly(data, n = 5) {
  if (!data?.units) return [];
  const units =
    data.units.USD ??
    data.units.shares ??
    Object.values(data.units)[0];
  if (!units || !Array.isArray(units)) return [];

  // Keep entries spanning ~1 quarter (60–105 days) — excludes YTD/annual values
  const quarterly = units
    .filter(d => {
      if (d.val == null || !d.start) return false;
      const days = (new Date(d.end) - new Date(d.start)) / 86400000;
      return days >= 60 && days <= 105;
    })
    .sort((a, b) => new Date(b.end) - new Date(a.end));

  const seen = new Set();
  const deduped = [];
  for (const d of quarterly) {
    if (!seen.has(d.end)) {
      seen.add(d.end);
      const endDate = new Date(d.end);
      const month = endDate.getMonth() + 1;
      const q = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4';
      deduped.push({ quarter: `${q} ${endDate.getFullYear()}`, end: d.end, value: d.val });
    }
  }

  return deduped.slice(0, n);
}

function extractAnnual(data, n = 5) {
  if (!data?.units) return [];

  // Prefer USD units, fall back to shares or first available
  const units =
    data.units.USD ??
    data.units.shares ??
    Object.values(data.units)[0];

  if (!units || !Array.isArray(units)) return [];

  // Keep only annual 10-K filings with a value
  const annual = units
    .filter(d => d.form === '10-K' && d.val != null)
    .sort((a, b) => new Date(b.end) - new Date(a.end));

  // Deduplicate: one entry per fiscal year end date
  const seen = new Set();
  const deduped = [];
  for (const d of annual) {
    const yr = d.end.slice(0, 4);
    if (!seen.has(yr)) {
      seen.add(yr);
      deduped.push({ year: yr, end: d.end, value: d.val });
    }
  }

  // Return oldest → newest, limited to n years
  return deduped.slice(0, n).reverse();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.toUpperCase();
  const period = searchParams.get('period') ?? 'annual'; // 'annual' | 'quarterly'

  if (!ticker) {
    return Response.json(
      { error: 'Missing required param: ticker' },
      { status: 400 }
    );
  }

  const cik = await lookupCIK(ticker);
  if (!cik) {
    return Response.json(
      { error: `CIK not found for ticker: ${ticker}` },
      { status: 404 }
    );
  }

  try {
    // Fetch all concepts in parallel
    const [
      revenueData,
      revenueFb1Data,
      revenueFb2Data,
      netIncomeData,
      epsData,
      assetsData,
      liabilitiesData,
      equityData,
      operatingCFData,
      capexData,
      grossProfitData,
      operatingIncomeData,
    ] = await Promise.all([
      fetchConcept(cik, CONCEPTS.revenue),
      fetchConcept(cik, CONCEPTS.revenueFb1),
      fetchConcept(cik, CONCEPTS.revenueFb2),
      fetchConcept(cik, CONCEPTS.netIncome),
      fetchConcept(cik, CONCEPTS.eps),
      fetchConcept(cik, CONCEPTS.assets),
      fetchConcept(cik, CONCEPTS.liabilities),
      fetchConcept(cik, CONCEPTS.equity),
      fetchConcept(cik, CONCEPTS.operatingCF),
      fetchConcept(cik, CONCEPTS.capex),
      fetchConcept(cik, CONCEPTS.grossProfit),
      fetchConcept(cik, CONCEPTS.operatingIncome),
    ]);

    if (period === 'quarterly') {
      let revenue = extractQuarterly(revenueData);
      if (revenue.length === 0) revenue = extractQuarterly(revenueFb1Data);
      if (revenue.length === 0) revenue = extractQuarterly(revenueFb2Data);

      return Response.json({
        ticker,
        cik,
        period: 'quarterly',
        revenue,
        grossProfit:     extractQuarterly(grossProfitData),
        netIncome:       extractQuarterly(netIncomeData),
        operatingIncome: extractQuarterly(operatingIncomeData),
        operatingCF:     extractQuarterly(operatingCFData),
        capex:           extractQuarterly(capexData),
      }, { headers: { 'Cache-Control': 's-maxage=21600, stale-while-revalidate=3600' } });
    }

    // Revenue: try primary tag first, then fallbacks
    let revenue = extractAnnual(revenueData);
    if (revenue.length === 0) revenue = extractAnnual(revenueFb1Data);
    if (revenue.length === 0) revenue = extractAnnual(revenueFb2Data);

    const result = {
      ticker,
      cik,
      revenue,
      grossProfit:     extractAnnual(grossProfitData),
      netIncome:       extractAnnual(netIncomeData),
      eps:             extractAnnual(epsData),
      assets:          extractAnnual(assetsData),
      liabilities:     extractAnnual(liabilitiesData),
      equity:          extractAnnual(equityData),
      operatingCF:     extractAnnual(operatingCFData),
      capex:           extractAnnual(capexData),
    };

    return Response.json(result, {
      headers: { 'Cache-Control': 's-maxage=21600, stale-while-revalidate=3600' },
    });
  } catch (err) {
    console.error(`[financials] Error fetching ${ticker}:`, err);
    return Response.json(
      { error: err.message ?? 'Unknown server error' },
      { status: 500 }
    );
  }
}