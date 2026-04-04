// app/api/short-interest/route.js
// Fetches analyst price targets from Finnhub (free), falls back to FMP, then Yahoo Finance

import { parseTickers } from '@/lib/holdings';
import { trackFinnhub, trackFMP } from '@/lib/apiUsage';

async function fetchFMP(ticker, fmpKey) {
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/price-target-summary?symbol=${ticker}&apikey=${fmpKey}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const d = Array.isArray(data) ? data[0] : data;
    if (!d?.lastQuarterAvgPriceTarget && !d?.allTimeAvgPriceTarget) return null;
    return {
      lastQuarterTarget: d?.lastQuarterAvgPriceTarget ?? null,
      lastQuarterCount:  d?.lastQuarterCount          ?? null,
      lastYearTarget:    d?.lastYearAvgPriceTarget    ?? null,
      lastYearCount:     d?.lastYearCount             ?? null,
      allTimeTarget:     d?.allTimeAvgPriceTarget     ?? null,
      allTimeCount:      d?.allTimeCount              ?? null,
      source: 'FMP',
    };
  } catch {
    return null;
  }
}

async function fetchFinnhub(ticker, finnhubKey) {
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/price-target?symbol=${ticker}&token=${finnhubKey}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const d = await res.json();
    if (!d?.targetMean) return null;
    return {
      lastQuarterTarget: d?.targetMean        ?? null,
      lastQuarterCount:  d?.numberOfAnalysts  ?? null,
      lastYearTarget:    null,
      lastYearCount:     null,
      allTimeTarget:     d?.targetMean        ?? null,
      allTimeCount:      d?.numberOfAnalysts  ?? null,
      targetHigh:        d?.targetHigh        ?? null,
      targetLow:         d?.targetLow         ?? null,
      source: 'Finnhub',
    };
  } catch {
    return null;
  }
}

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

async function fetchYahoo(ticker, auth) {
  try {
    if (!auth) return null;
    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=financialData&crumb=${encodeURIComponent(auth.crumb)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
          'Cookie': auth.cookie,
        },
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const fd = data?.quoteSummary?.result?.[0]?.financialData;
    if (!fd?.targetMeanPrice?.raw) return null;
    return {
      lastQuarterTarget: fd.targetMeanPrice.raw          ?? null,
      lastQuarterCount:  fd.numberOfAnalystOpinions?.raw ?? null,
      lastYearTarget:    null,
      lastYearCount:     null,
      allTimeTarget:     fd.targetMeanPrice.raw          ?? null,
      allTimeCount:      fd.numberOfAnalystOpinions?.raw ?? null,
      targetHigh:        fd.targetHighPrice?.raw         ?? null,
      targetLow:         fd.targetLowPrice?.raw          ?? null,
      source: 'Yahoo',
    };
  } catch {
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const holdings = parseTickers(searchParams);
  if (!holdings.length) return Response.json([]);

  const fmpKey     = process.env.FMP_API_KEY;
  const finnhubKey = process.env.FINNHUB_API_KEY;

  if (!fmpKey && !finnhubKey) {
    return Response.json({ error: 'Missing API keys' }, { status: 500 });
  }

  const yahooAuth = await fetchYahooCrumb();

  const results = await Promise.all(
    holdings.map(async h => {
      let targets = null;
      // Try Finnhub first (free, no quota cost)
      if (finnhubKey) {
        trackFinnhub(1);
        targets = await fetchFinnhub(h.t, finnhubKey);
      }
      // Fall back to FMP if Finnhub returned empty
      if (!targets && fmpKey) {
        trackFMP(1).catch(() => {});
        targets = await fetchFMP(h.t, fmpKey);
      }
      if (!targets) targets = await fetchYahoo(h.t, yahooAuth);

      return {
        ticker: h.t,
        name:   h.n,
        ...(targets || {}),
      };
    })
  );

  return Response.json(results, {
    headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=300' },
  });
}
