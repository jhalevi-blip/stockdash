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
    return { crumb: crumb.trim(), cookie };
  } catch {
    return null;
  }
}

async function fetchInstitutional(ticker, auth) {
  try {
    if (!auth) return null;
    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=institutionOwnership,majorHoldersBreakdown&crumb=${encodeURIComponent(auth.crumb)}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Cookie': auth.cookie },
        next: { revalidate: 86400 },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return null;

    const mhb  = result.majorHoldersBreakdown;
    const inst = result.institutionOwnership?.ownershipList ?? [];

    const top5 = inst.slice(0, 5).map(h => ({
      name:    h.organization,
      shares:  h.shares?.raw    ?? null,
      pctHeld: h.pctHeld?.raw   ?? null,
      value:   h.value?.raw     ?? null,
    }));

    return {
      institutionsPctHeld: mhb?.institutionsPercentHeld?.raw ?? null,
      institutionsCount:   mhb?.institutionsCount?.raw       ?? null,
      insidersPctHeld:     mhb?.insidersPercentHeld?.raw     ?? null,
      top5,
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
      const inst = await fetchInstitutional(h.t, auth);
      return {
        ticker: h.t,
        name:   h.n,
        ...(inst || { institutionsPctHeld: null, institutionsCount: null, insidersPctHeld: null, top5: [] }),
      };
    })
  );

  const sorted = results.sort((a, b) => (b.institutionsPctHeld ?? -1) - (a.institutionsPctHeld ?? -1));

  return Response.json(sorted, {
    headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate' },
  });
}
