// app/api/financials/route.js
// Fetches annual financial data from SEC EDGAR XBRL API (free, no key needed)

export const revalidate = 86400; // cache entire route for 24 hours

const TICKER_TO_CIK = {
  AMD:  '0000002488',
  AMZN: '0001018724',
  SOFI: '0001818874',
  RIG:  '0001451505',
  CELH: '0001341766',
  ADBE: '0000796343',
  OXY:  '0000797468',
  PHM:  '0000822416',
  LEN:  '0000920760',
  HNST: '0001530979',
  NNE:  '0001923891',
  AAPL: '0000320193',
  MSFT: '0000789019',
  NVDA: '0001045810',
  TSLA: '0001318605',
};

// Primary and fallback EDGAR us-gaap concept tags
const CONCEPTS = {
  revenue:      'RevenueFromContractWithCustomerExcludingAssessedTax',
  revenueFb1:   'Revenues',
  revenueFb2:   'SalesRevenueNet',
  netIncome:    'NetIncomeLoss',
  eps:          'EarningsPerShareDiluted',
  assets:       'Assets',
  liabilities:  'Liabilities',
  equity:       'StockholdersEquity',
  operatingCF:  'NetCashProvidedByUsedInOperatingActivities',
  capex:        'PaymentsToAcquirePropertyPlantAndEquipment',
  grossProfit:  'GrossProfit',
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

  if (!ticker) {
    return Response.json(
      { error: 'Missing required param: ticker' },
      { status: 400 }
    );
  }

  const cik = TICKER_TO_CIK[ticker];
  if (!cik) {
    return Response.json(
      {
        error: `CIK not mapped for ticker: ${ticker}. Add it to TICKER_TO_CIK in route.js.`,
      },
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
    ]);

    // Revenue: try primary tag first, then fallbacks
    let revenue = extractAnnual(revenueData);
    if (revenue.length === 0) revenue = extractAnnual(revenueFb1Data);
    if (revenue.length === 0) revenue = extractAnnual(revenueFb2Data);

    const result = {
      ticker,
      cik,
      revenue,
      grossProfit:  extractAnnual(grossProfitData),
      netIncome:    extractAnnual(netIncomeData),
      eps:          extractAnnual(epsData),
      assets:       extractAnnual(assetsData),
      liabilities:  extractAnnual(liabilitiesData),
      equity:       extractAnnual(equityData),
      operatingCF:  extractAnnual(operatingCFData),
      capex:        extractAnnual(capexData),
    };

    return Response.json(result);
  } catch (err) {
    console.error(`[financials] Error fetching ${ticker}:`, err);
    return Response.json(
      { error: err.message ?? 'Unknown server error' },
      { status: 500 }
    );
  }
}