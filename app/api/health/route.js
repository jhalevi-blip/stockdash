export const dynamic = 'force-dynamic';

async function check(name, fn) {
  const start = Date.now();
  try {
    await fn();
    return { status: 'ok', latency: Date.now() - start };
  } catch (err) {
    return { status: 'error', latency: Date.now() - start, error: err.message };
  }
}

export async function GET() {
  const finnhubKey = process.env.FINNHUB_API_KEY;
  const fmpKey     = process.env.FMP_API_KEY;

  const [finnhub, fmp, edgar, yahoo] = await Promise.all([
    check('finnhub', async () => {
      if (!finnhubKey) throw new Error('No API key');
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=AMD&token=${finnhubKey}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      if (d.c == null) throw new Error('Empty response');
    }),

    check('fmp', async () => {
      if (!fmpKey) throw new Error('No API key');
      const res = await fetch(
        `https://financialmodelingprep.com/stable/price-target-summary?symbol=AMD&apikey=${fmpKey}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      if (!Array.isArray(d) && !d?.symbol) throw new Error('Unexpected response shape');
    }),

    check('edgar', async () => {
      const res = await fetch(
        'https://data.sec.gov/api/xbrl/companyconcept/CIK0000002488/us-gaap/NetIncomeLoss.json',
        {
          headers: { 'User-Agent': 'PortfolioIntel/1.0 contact@portfoliointel.app' },
          cache: 'no-store',
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),

    check('yahoo', async () => {
      const res = await fetch(
        'https://query1.finance.yahoo.com/v8/finance/chart/AMD?interval=1d&range=1d',
        {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
          cache: 'no-store',
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      if (!d?.chart?.result?.[0]) throw new Error('Empty response');
    }),
  ]);

  const checkedAt = new Date().toISOString();

  return Response.json(
    { finnhub: { ...finnhub, checkedAt }, fmp: { ...fmp, checkedAt }, edgar: { ...edgar, checkedAt }, yahoo: { ...yahoo, checkedAt } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
