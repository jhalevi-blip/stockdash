// Server-side market data for the landing sample section.
//
// Fetched once per revalidation interval and shared across ALL visitors via
// Next's Data Cache — never per browser (the provider routes are unauthenticated
// behind 60/min/IP and per-visitor fetching would throttle real traffic).
//
// Two tiers, per the caching decision:
//   • 900s   — price / day-change / VIX / benchmark (intraday)
//   • 86400s — P/E, beta, market cap, dividend yield, next-earnings dates (slow)
//
// HARD RULE: no hardcoded fallback. Any field that doesn't come back is null, and
// the consuming card/field renders absent — never a stale or invented number.

export const SAMPLE_TICKERS = ['ASML', 'SHEL', 'ING', 'NXPI', 'NVDA', 'MSFT'];

const INTRADAY = 900;
const DAILY    = 86400;
const FMP_BASE = 'https://financialmodelingprep.com/stable';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

async function fmpQuote(symbol, revalidate) {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `${FMP_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${key}`,
      { next: { revalidate } },
    );
    if (!res.ok) return null;
    const arr = await res.json();
    return Array.isArray(arr) ? arr[0] ?? null : null;
  } catch { return null; }
}

async function fmpNextEarnings(symbol) {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `${FMP_BASE}/earnings?symbol=${symbol}&limit=8&apikey=${key}`,
      { next: { revalidate: DAILY } },
    );
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr)) return null;
    const today = new Date().toISOString().slice(0, 10);
    const future = arr.filter((e) => e?.date > today).sort((a, b) => a.date.localeCompare(b.date));
    return future[0]?.date ?? null;
  } catch { return null; }
}

async function finnhubMetric(symbol) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${key}`,
      { next: { revalidate: DAILY } },
    );
    if (!res.ok) return null;
    return (await res.json())?.metric ?? null;
  } catch { return null; }
}

export async function getSampleMarketData() {
  const perTicker = {};

  await Promise.all(SAMPLE_TICKERS.map(async (t) => {
    const [quote, metric, nextEarnings] = await Promise.all([
      fmpQuote(t, INTRADAY),      // intraday: price + day change
      finnhubMetric(t),           // daily: P/E, beta, market cap, div yield
      fmpNextEarnings(t),         // daily: next earnings date
    ]);
    perTicker[t] = {
      dayChangePct: num(quote?.changePercentage),
      pe:           num(metric?.peBasicExclExtraTTM),
      beta:         num(metric?.beta),
      marketCapMM:  num(metric?.marketCapitalization),        // Finnhub: USD millions
      divYield:     num(metric?.dividendYieldIndicatedAnnual), // percent
      nextEarnings: nextEarnings ?? null,                      // ISO YYYY-MM-DD
    };
  }));

  const [vixQuote, benchQuote] = await Promise.all([
    fmpQuote('^VIX', INTRADAY),
    fmpQuote('URTH', INTRADAY),   // iShares MSCI World ETF — benchmark day change
  ]);

  const upcoming = SAMPLE_TICKERS
    .map((t) => ({ ticker: t, date: perTicker[t].nextEarnings }))
    .filter((e) => e.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    perTicker,
    vix:                 num(vixQuote?.price),
    benchmarkDayPct:     num(benchQuote?.changePercentage),
    nextEarningsSoonest: upcoming[0] ?? null,
  };
}
