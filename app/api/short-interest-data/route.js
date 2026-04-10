import { parseTickers } from '@/lib/holdings';

async function fetchYahooCrumb() {
  try {
    const homeRes = await fetch('https://finance.yahoo.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
      redirect: 'follow',
      cache: 'no-store',
    });
    const rawCookies = homeRes.headers.getSetCookie?.() ?? [];
    const cookie = rawCookies.map(c => c.split(';')[0]).join('; ');

    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/plain', 'Cookie': cookie },
      cache: 'no-store',
    });
    if (!crumbRes.ok) return null;
    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes('{')) return null;

    console.log('[short-interest-data] crumb ok:', crumb.trim().slice(0, 8) + '…');
    return { crumb: crumb.trim(), cookie };
  } catch (e) {
    console.log('[short-interest-data] fetchYahooCrumb failed:', e?.message);
    return null;
  }
}

async function fetchShortInterest(ticker, auth) {
  try {
    const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : '';
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics${crumbParam}`;
    const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };
    if (auth?.cookie) headers['Cookie'] = auth.cookie;

    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) {
      console.log(`[short-interest-data] ${ticker} HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const ks = data?.quoteSummary?.result?.[0]?.defaultKeyStatistics;
    if (!ks) {
      console.log(`[short-interest-data] ${ticker} no defaultKeyStatistics — error:`, data?.quoteSummary?.error);
      return null;
    }

    console.log(`[short-interest-data] ${ticker} shortPercentOfFloat:`, ks.shortPercentOfFloat?.raw, 'sharesShortPriorMonth:', ks.sharesShortPriorMonth?.raw);

    const sharesShort        = ks.sharesShort?.raw           ?? null;
    const sharesShortPriorMonth = ks.sharesShortPriorMonth?.raw ?? null;

    const siChange = sharesShort != null && sharesShortPriorMonth != null && sharesShortPriorMonth !== 0
      ? ((sharesShort - sharesShortPriorMonth) / sharesShortPriorMonth) * 100
      : null;

    return {
      shortPercentOfFloat:  ks.shortPercentOfFloat?.raw ?? null,
      sharesShort,
      shortRatio:           ks.shortRatio?.raw          ?? null,
      sharesShortPriorMonth,
      siChange,
    };
  } catch {
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const holdings = parseTickers(searchParams);
  if (!holdings.length) return Response.json([]);

  const auth = await fetchYahooCrumb();

  const results = await Promise.all(
    holdings.map(async h => {
      const si = await fetchShortInterest(h.t, auth);
      return {
        ticker:               h.t,
        shortPercentOfFloat:  si?.shortPercentOfFloat  ?? null,
        sharesShort:          si?.sharesShort          ?? null,
        shortRatio:           si?.shortRatio           ?? null,
        sharesShortPriorMonth: si?.sharesShortPriorMonth ?? null,
        siChange:             si?.siChange             ?? null,
      };
    })
  );

  return Response.json(results, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=300' },
  });
}
