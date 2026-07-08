export const dynamic = 'force-dynamic';

// ── Yahoo crumb handshake (cookie + crumb), cached in module memory ──────────
// The handshake is two uncached fetches; a crumb stays valid for hours, so we
// reuse it across requests for up to 4h instead of re-handshaking every call.
const CRUMB_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
let crumbCache = null;    // { crumb, cookie, expiresAt } | null
let crumbInFlight = null; // Promise<auth|null> | null — dedupes concurrent refreshes

// Raw handshake — no caching. Callers go through getYahooCrumb().
async function fetchFreshYahooCrumb() {
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

// Drop the cached crumb so the next getYahooCrumb() re-handshakes.
function invalidateCrumb() {
  crumbCache = null;
}

// Return a valid { crumb, cookie } — from cache when fresh, otherwise re-handshake.
// Concurrent refreshes share a single in-flight handshake to avoid a stampede.
async function getYahooCrumb({ forceRefresh = false } = {}) {
  if (!forceRefresh && crumbCache && crumbCache.expiresAt > Date.now()) {
    return crumbCache;
  }
  if (!crumbInFlight) {
    crumbInFlight = (async () => {
      const fresh = await fetchFreshYahooCrumb();
      crumbCache = fresh ? { ...fresh, expiresAt: Date.now() + CRUMB_TTL_MS } : null;
      return crumbCache;
    })().finally(() => { crumbInFlight = null; });
  }
  return crumbInFlight;
}

function calendarEventsUrl(ticker, auth) {
  const crumbQ = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : '';
  return `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=calendarEvents${crumbQ}`;
}

function calendarEventsInit(auth) {
  return {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      ...(auth ? { 'Cookie': auth.cookie } : {}),
    },
    next: { revalidate: 86400 },
  };
}

async function fetchEarningsDate(ticker, auth) {
  try {
    let res = await fetch(calendarEventsUrl(ticker, auth), calendarEventsInit(auth));
    // A cached crumb can be rejected (expired/rotated) — refresh once and retry.
    if ((res.status === 401 || res.status === 403) && auth) {
      invalidateCrumb();
      const fresh = await getYahooCrumb({ forceRefresh: true });
      if (fresh) {
        auth = fresh;
        res = await fetch(calendarEventsUrl(ticker, auth), calendarEventsInit(auth));
      }
    }
    if (!res.ok) return null;
    const data = await res.json();
    const earnings = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings;
    if (!earnings) return null;

    const dates = earnings.earningsDate ?? [];
    if (!dates.length) return null;

    const today = new Date().toISOString().split('T')[0];
    // earningsDate is an array (sometimes a range of two dates); take the earliest future one
    let nextDate = null;
    for (const d of dates) {
      const dateStr = d.fmt ?? new Date(d.raw * 1000).toISOString().split('T')[0];
      if (dateStr >= today) { nextDate = dateStr; break; }
    }
    if (!nextDate) return null;

    return {
      date: nextDate,
      epsEstimate: earnings.earningsAverage?.raw ?? null,
    };
  } catch {
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get('tickers') ?? '';
  const tickers = tickersParam
    ? tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean)
    : [];

  if (!tickers.length) return Response.json([]);

  const auth = await getYahooCrumb();

  const results = await Promise.all(
    tickers.map(async ticker => {
      const d = await fetchEarningsDate(ticker, auth);
      if (!d) return { symbol: ticker, noData: true };
      return {
        symbol:      ticker,
        date:        d.date,
        hour:        null,
        epsEstimate: d.epsEstimate,
        noData:      false,
      };
    })
  );

  const sorted = [
    ...results.filter(r => !r.noData).sort((a, b) => a.date.localeCompare(b.date)),
    ...results.filter(r =>  r.noData),
  ];

  return Response.json(sorted, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=300' },
  });
}
