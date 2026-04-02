export const dynamic = 'force-dynamic';

const FUNDS = [
  { name: 'Pershing Square',        manager: 'Bill Ackman',           cik: '0001336528' },
  { name: 'Berkshire Hathaway',     manager: 'Warren Buffett',        cik: '0001067294' },
  { name: 'Greenlight Capital',     manager: 'David Einhorn',         cik: '0001079114' },
  { name: 'Appaloosa Management',   manager: 'David Tepper',          cik: '0001006438' },
  { name: 'Duquesne Family Office', manager: 'Stan Druckenmiller',    cik: '0001536411' },
];

const HEADERS = {
  'User-Agent': 'PortfolioIntel/1.0 contact@portfoliointel.app',
  'Accept-Encoding': 'gzip, deflate',
};

async function getLatest13F(cik) {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: HEADERS,
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = await res.json();

  const { form, accessionNumber, filingDate } = data.filings.recent;
  const idx = form.findIndex(f => f === '13F-HR');
  if (idx === -1) return null;

  return { accession: accessionNumber[idx], date: filingDate[idx] };
}

async function findInfotableFilename(numCik, accessionNoDashes) {
  const res = await fetch(
    `https://www.sec.gov/Archives/edgar/data/${numCik}/${accessionNoDashes}/index.json`,
    { headers: HEADERS, cache: 'no-store' }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const items = data.directory?.item ?? [];

  // Prefer an item explicitly typed as INFORMATION TABLE, then fall back to XML filename heuristics
  const infoItem =
    items.find(i => (i.type ?? '').toUpperCase().includes('INFORMATION TABLE')) ??
    items.find(i => /infotable|informationtable/i.test(i.name ?? '')) ??
    items.find(i => /\.xml$/i.test(i.name ?? '') && !/primary_doc|cover/i.test(i.name ?? ''));

  return infoItem?.name ?? null;
}

function parseInfoTable(xml) {
  // First pass: collect raw values as-is from XML
  const raw = [];
  for (const [, content] of xml.matchAll(/<infoTable>([\s\S]*?)<\/infoTable>/gi)) {
    const get = tag => {
      const m = content.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
      return m?.[1]?.trim() ?? null;
    };
    const name   = get('nameOfIssuer');
    const value  = parseFloat(get('value')     || '0');
    const shares = parseFloat(get('sshPrnamt') || '0');
    const type   = get('sshPrnamtType');
    if (name && type === 'SH' && shares > 0) raw.push({ name, value, shares });
  }

  return raw.map(h => ({ name: h.name, value: h.value, shares: h.shares }));
}

async function fetchFundHoldings(fund) {
  try {
    const numCik = String(parseInt(fund.cik, 10));
    const latest = await getLatest13F(fund.cik);
    if (!latest) return { ...fund, holdings: [], filingDate: null };

    const accessionNoDashes = latest.accession.replace(/-/g, '');
    const filename = await findInfotableFilename(numCik, accessionNoDashes);
    if (!filename) return { ...fund, holdings: [], filingDate: latest.date };

    const xmlRes = await fetch(
      `https://www.sec.gov/Archives/edgar/data/${numCik}/${accessionNoDashes}/${filename}`,
      { headers: { ...HEADERS, Accept: 'text/xml,*/*' }, cache: 'no-store' }
    );
    if (!xmlRes.ok) return { ...fund, holdings: [], filingDate: latest.date };

    const xml = await xmlRes.text();
    const all  = parseInfoTable(xml);
    const totalValue = all.reduce((s, h) => s + h.value, 0);

    const top15 = all
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)
      .map(h => ({ ...h, pctPortfolio: totalValue > 0 ? h.value / totalValue : null }));

    return { ...fund, holdings: top15, filingDate: latest.date, totalValue };
  } catch (err) {
    console.error(`[funds] Error fetching ${fund.name}:`, err.message);
    return { ...fund, holdings: [], filingDate: null };
  }
}

export async function GET() {
  const results = await Promise.all(FUNDS.map(fetchFundHoldings));
  return Response.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
