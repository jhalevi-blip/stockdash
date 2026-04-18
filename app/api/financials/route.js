// app/api/financials/route.js
// Annual: SEC EDGAR XBRL API. Quarterly: FMP income-statement + FMP cash-flow-statement.

export const revalidate = 86400;
export const dynamic = 'force-dynamic';

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

async function fetchFMPQuarterly(ticker, fmpKey) {
  const res = await fetch(
    `https://financialmodelingprep.com/stable/income-statement?symbol=${ticker}&period=quarter&limit=8&apikey=${fmpKey}`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchFMPCashFlow(ticker, fmpKey) {
  const res = await fetch(
    `https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${ticker}&period=quarter&limit=8&apikey=${fmpKey}`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function fmpToQuarterly(stmts, field) {
  if (!Array.isArray(stmts) || stmts.length === 0) return [];
  return stmts
    .filter(s => s[field] != null)
    .map(s => {
      const endDate = new Date(s.date);
      const month = endDate.getMonth() + 1;
      const q = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4';
      return { quarter: `${q} ${endDate.getFullYear()}`, end: s.date, value: s[field] };
    })
    .sort((a, b) => new Date(b.end) - new Date(a.end));
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

  // ── Quarterly: FMP income-statement + FMP cash-flow-statement ────────────
  // EDGAR is NOT used for quarterly cash flow — EDGAR reports CF cumulatively
  // (YTD) so only Q1 passes the 60-105 day span filter. FMP returns point-in-time
  // quarterly figures for all periods.
  if (period === 'quarterly') {
    const fmpKey = process.env.FMP_API_KEY;
    // CIK still needed as EDGAR fallback for income statement if FMP key absent
    const cik = (!fmpKey) ? await lookupCIK(ticker) : null;

    const [fmpStmts, fmpCF, edgarCFData, edgarCapexData] = await Promise.all([
      fmpKey ? fetchFMPQuarterly(ticker, fmpKey)  : Promise.resolve(null),
      fmpKey ? fetchFMPCashFlow(ticker, fmpKey)   : Promise.resolve(null),
      // EDGAR CF only fetched as fallback when no FMP key
      (!fmpKey && cik) ? fetchConcept(cik, CONCEPTS.operatingCF) : Promise.resolve(null),
      (!fmpKey && cik) ? fetchConcept(cik, CONCEPTS.capex)       : Promise.resolve(null),
    ]);

    const useFMP   = Array.isArray(fmpStmts) && fmpStmts.length > 0;
    const useFMPCF = Array.isArray(fmpCF)    && fmpCF.length    > 0;

    if (useFMP) trackFMP(useFMPCF ? 2 : 1).catch(() => {}); // 1 IS call + 1 CF call

    let revenue, grossProfit, netIncome, operatingIncome;

    if (useFMP) {
      revenue         = fmpToQuarterly(fmpStmts, 'revenue');
      grossProfit     = fmpToQuarterly(fmpStmts, 'grossProfit');
      netIncome       = fmpToQuarterly(fmpStmts, 'netIncome');
      operatingIncome = fmpToQuarterly(fmpStmts, 'operatingIncome');
    } else {
      // EDGAR fallback for income statement fields (no FMP key)
      const edgarCik = cik ?? await lookupCIK(ticker);
      const [revenueData, revenueFb1Data, revenueFb2Data, netIncomeData, grossProfitData, operatingIncomeData] =
        edgarCik ? await Promise.all([
          fetchConcept(edgarCik, CONCEPTS.revenue),
          fetchConcept(edgarCik, CONCEPTS.revenueFb1),
          fetchConcept(edgarCik, CONCEPTS.revenueFb2),
          fetchConcept(edgarCik, CONCEPTS.netIncome),
          fetchConcept(edgarCik, CONCEPTS.grossProfit),
          fetchConcept(edgarCik, CONCEPTS.operatingIncome),
        ]) : [null, null, null, null, null, null];

      revenue = extractQuarterly(revenueData);
      if (revenue.length === 0) revenue = extractQuarterly(revenueFb1Data);
      if (revenue.length === 0) revenue = extractQuarterly(revenueFb2Data);
      grossProfit     = extractQuarterly(grossProfitData);
      netIncome       = extractQuarterly(netIncomeData);
      operatingIncome = extractQuarterly(operatingIncomeData);
    }

    // Cash flow: FMP point-in-time quarterly figures preferred over EDGAR YTD cumulative.
    // FMP capitalExpenditure is typically negative (cash outflow) — the UI computes
    // FCF = operatingCF - capex, so a negative capex value is stored as-is and the
    // subtraction cancels out correctly: e.g. 500 - (-200) = 700. Verify via AMD log.
    const operatingCF = useFMPCF
      ? fmpToQuarterly(fmpCF, 'operatingCashFlow')
      : extractQuarterly(edgarCFData);
    const capex = useFMPCF
      ? fmpToQuarterly(fmpCF, 'capitalExpenditure')
      : extractQuarterly(edgarCapexData);

    return Response.json({
      ticker,
      period: 'quarterly',
      revenue,
      grossProfit,
      netIncome,
      operatingIncome,
      operatingCF,
      capex,
    }, { headers: { 'Cache-Control': 's-maxage=21600, stale-while-revalidate=3600' } });
  }

  // ── Annual: EDGAR only ────────────────────────────────────────────────────
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

    // Revenue: try primary tag first, then fallbacks
    let revenue = extractAnnual(revenueData);
    if (revenue.length === 0) revenue = extractAnnual(revenueFb1Data);
    if (revenue.length === 0) revenue = extractAnnual(revenueFb2Data);

    return Response.json({
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
    }, {
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
