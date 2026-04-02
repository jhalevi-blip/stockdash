const CIK_MAP = {
  AMD:  '0000002488',
  AMZN: '0001018724',
  SOFI: '0001818201',
  RIG:  '0001451505',
  CELH: '0001370109',
  ADBE: '0000796343',
  OXY:  '0000797468',
  PHM:  '0000822416',
  LEN:  '0000760760',
  HNST: '0001631574',
  NNE:  '0001978040',
  ETOR: '0001975264',
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const type   = searchParams.get('type') || 'filings';
  const fhKey  = process.env.FINNHUB_API_KEY;

  if (!symbol) return Response.json({ error: 'Bad request' }, { status: 400 });

  try {
    if (type === 'filings') {
      const cik = CIK_MAP[symbol];
      if (!cik) return Response.json([]);
      const res = await fetch(
        `https://data.sec.gov/submissions/CIK${cik}.json`,
        { headers: { 'User-Agent': 'PortfolioIntel contact@example.com' },
          next: { revalidate: 86400 } }
      );
      const data = await res.json();
      const recent = data.filings?.recent;
      if (!recent) return Response.json([]);
      const filings = [];
      const forms = ['10-K', '10-Q', '8-K', 'DEF 14A'];
      for (let i = 0; i < recent.form.length && filings.length < 20; i++) {
        if (forms.includes(recent.form[i])) {
          filings.push({
            type:       recent.form[i],
            title:      recent.primaryDocument[i],
            filingDate: recent.filingDate[i],
finalLink: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${recent.form[i]}&dateb=&owner=include&count=10`,
          });
        }
      }
      return Response.json(filings);
    }

if (type === 'news') {
      if (!fhKey) return Response.json([]);
      const to = Math.floor(Date.now() / 1000);
      const from = to - 7 * 24 * 60 * 60;
      const fromDate = new Date(from*1000).toISOString().split('T')[0];
      const toDate = new Date(to*1000).toISOString().split('T')[0];

      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${fromDate}&to=${toDate}&token=${fhKey}`,
          { next: { revalidate: 3600 } } // cache 1 hour
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!Array.isArray(data)) return Response.json([]);
        return Response.json(data.slice(0, 10), {
          headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' }
        });
      } catch {
        // Return empty array gracefully on rate limit
        return Response.json([], {
          headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' }
        });
      }
    }

    return Response.json([]);
  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}