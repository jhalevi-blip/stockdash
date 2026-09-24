import { getSupabaseAdmin } from '@/lib/supabase';
import { getQuotesForGroup } from '@/lib/watchlist/quotes';
import { resolveBatchIsins } from '@/lib/brokers/isinResolver';
import { lastCompletedSessionDate, etCalendarDate } from '@/lib/marketStatus';

// Daily PRODUCTION WATCHDOG — read-only health probe for the whole stack.
//
// Called once a day by .github/workflows/prod-watchdog.yml with
//   Authorization: Bearer ${CRON_SECRET}
// (the same secret + pattern as watchlist-alerts / portfolio-summary). Without a
// valid token it returns 404 — indistinguishable from a route that doesn't exist,
// so a public-repo reader can't even tell it's here.
//
// Contract: it returns ONLY pass/fail per check plus a short, non-sensitive reason
// ("prices: AMD 3 sessions stale"). NEVER data, keys, user info, or raw error text —
// every check is wrapped so an exception becomes a generic reason, and DB/API keys
// stay server-side (GitHub only ever sees the pass/fail JSON). All checks run
// concurrently, each with its own timeout, to stay well under Vercel's 60s limit.
//
// HTTP 200 when every check passes, 503 when any fails (belt-and-suspenders alongside
// the `ok` flag the workflow reads).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FETCH_TIMEOUT_MS = 12_000;
const PRICE_TICKERS = ['AAPL', 'MSFT', 'AMD'];        // 3 known, liquid US names
const KNOWN_ISIN = 'NL0010273215';                    // ASML — verified in isinResolver
const KNOWN_ISIN_EXPECT = 'ASML';
const SCREEN_STALE_TRADING_DAYS = 2;                  // matches app/api/screen (STALE_TRADING_DAYS)
const FUNDAMENTALS_MAX_DAYS = Number(process.env.WATCHDOG_FUNDAMENTALS_MAX_DAYS) || 90;
// Heartbeat freshness budgets. portfolio-summary fires ~06:00 UTC daily; 26h tolerates
// the watchdog running just before it. watchlist-alerts fires only 13:00–21:00 UTC on
// weekdays, so its last beat on a Monday morning is the previous Friday evening (~56h) —
// 74h clears that gap while still catching a genuinely dead scheduler.
const HEARTBEAT_MAX_HOURS = { 'portfolio-summary': 26, 'watchlist-alerts': 74 };

const pass = (name) => ({ name, pass: true });
const fail = (name, reason) => ({ name, pass: false, reason: `${name}: ${reason}` });

// fetch with a hard timeout; returns the Response or throws.
async function timedFetch(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(t);
  }
}

// Yahoo last-close for an FX pair (EURUSD=X / GBPUSD=X), mirroring the server-side
// fetch in cron/portfolio-summary. Returns a positive number or null.
async function yahooClose(symbol) {
  const res = await timedFetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`,
    { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const last = [...closes].reverse().find((c) => c != null);
  return last != null && last > 0 ? last : null;
}

// Weekend-aware trading-day count strictly between two instants (mirrors app/api/screen).
// Holiday-agnostic, so it can over-count by ~1 around a holiday — which errs toward
// warning, never toward hiding staleness.
function tradingDaysOld(asOfMs, nowMs) {
  const d = new Date(asOfMs); d.setUTCHours(0, 0, 0, 0);
  const end = new Date(nowMs); end.setUTCHours(0, 0, 0, 0);
  let count = 0;
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

// ── Individual checks. Each resolves to { name, pass, reason? } and never throws
//    (runCheck wraps them), so one failure can't take down the others. ──────────

async function checkPage(name, url) {
  const res = await timedFetch(url, { redirect: 'manual' });
  // 2xx (rendered) or a 3xx to the auth flow both mean "the page is being served".
  if ((res.status >= 200 && res.status < 400)) return pass(name);
  return fail(name, `HTTP ${res.status}`);
}

async function checkPrices() {
  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) return fail('prices', 'not configured');
  const { quotes } = await getQuotesForGroup(PRICE_TICKERS, { fmpKey, label: 'watchdog' });
  const lastSession = lastCompletedSessionDate();   // ET date of the newest closed session
  const bad = [];
  for (const t of PRICE_TICKERS) {
    const q = quotes[t];
    if (!q || q.error || q.price == null) { bad.push(`${t} no price`); continue; }
    if (q.asOf == null) { bad.push(`${t} no timestamp`); continue; }
    // Fresh iff the quote's own ET date is on or after the last completed session.
    if (etCalendarDate(new Date(q.asOf)) < lastSession) {
      const days = Math.floor((Date.now() - q.asOf) / 86_400_000);
      bad.push(`${t} ${days}d stale`);
    }
  }
  return bad.length ? fail('prices', bad.join(', ')) : pass('prices');
}

async function checkFx() {
  const [eur, gbp] = await Promise.all([yahooClose('EURUSD=X'), yahooClose('GBPUSD=X')]);
  const missing = [];
  if (!eur) missing.push('EURUSD');
  if (!gbp) missing.push('GBPUSD');
  return missing.length ? fail('fx', `${missing.join(', ')} unavailable`) : pass('fx');
}

async function checkFundamentals(sb) {
  const { data, error } = await sb
    .from('fundamentals_snapshot')
    .select('updated_at')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) return fail('fundamentals', 'query failed');
  const newest = data?.[0]?.updated_at ? Date.parse(data[0].updated_at) : null;
  if (!newest) return fail('fundamentals', 'no rows');
  const days = Math.floor((Date.now() - newest) / 86_400_000);
  return days > FUNDAMENTALS_MAX_DAYS
    ? fail('fundamentals', `${days} days old (max ${FUNDAMENTALS_MAX_DAYS})`)
    : pass('fundamentals');
}

async function checkIsin() {
  const resolved = await resolveBatchIsins([KNOWN_ISIN]);
  const ticker = resolved.get(KNOWN_ISIN);
  if (!ticker) return fail('isin', `${KNOWN_ISIN} unresolved`);
  if (ticker !== KNOWN_ISIN_EXPECT) return fail('isin', `${KNOWN_ISIN} → unexpected`);
  return pass('isin');
}

async function checkScreenQuotes(sb) {
  const { data, error } = await sb
    .from('screen_quotes')
    .select('as_of')
    .not('as_of', 'is', null)
    .order('as_of', { ascending: false })
    .limit(1);
  if (error) return fail('screen_quotes', 'query failed');
  const newest = data?.[0]?.as_of ? Date.parse(data[0].as_of) : null;
  if (!newest) return fail('screen_quotes', 'no rows');
  const old = tradingDaysOld(newest, Date.now());
  return old > SCREEN_STALE_TRADING_DAYS
    ? fail('screen_quotes', `${old} trading days old`)
    : pass('screen_quotes');
}

async function checkHeartbeats(sb) {
  const { data, error } = await sb.from('job_heartbeats').select('job, last_run_at');
  if (error) return [fail('job_portfolio_summary', 'query failed'), fail('job_watchlist_alerts', 'query failed')];
  const byJob = new Map((data ?? []).map((r) => [r.job, r.last_run_at]));
  return Object.entries(HEARTBEAT_MAX_HOURS).map(([job, maxHours]) => {
    const name = `job_${job.replace(/-/g, '_')}`;
    const at = byJob.get(job) ? Date.parse(byJob.get(job)) : null;
    if (!at) return fail(name, 'no run recorded yet');
    const hours = Math.floor((Date.now() - at) / 3_600_000);
    return hours > maxHours ? fail(name, `${hours}h since last run (max ${maxHours}h)`) : pass(name);
  });
}

// Wrap any check so a thrown error becomes a generic, non-sensitive failure — never
// raw error text in the response.
async function runCheck(name, fn) {
  try {
    return await fn();
  } catch {
    return fail(name, 'check error');
  }
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    // Indistinguishable from a nonexistent route — no hint that a watchdog lives here.
    return new Response('Not found', { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const sb = getSupabaseAdmin();

  // DB-backed checks degrade to a single clear failure if Supabase isn't configured,
  // rather than throwing four identical errors.
  const dbChecks = sb
    ? [
        runCheck('fundamentals', () => checkFundamentals(sb)),
        runCheck('screen_quotes', () => checkScreenQuotes(sb)),
        runCheck('heartbeats', () => checkHeartbeats(sb)),
      ]
    : [Promise.resolve(fail('database', 'unavailable'))];

  const settled = await Promise.all([
    runCheck('site', () => checkPage('site', `${origin}/`)),
    runCheck('sign_in', () => checkPage('sign_in', `${origin}/sign-in`)),
    runCheck('prices', () => checkPrices()),
    runCheck('fx', () => checkFx()),
    runCheck('isin', () => checkIsin()),
    ...dbChecks,
  ]);

  // checkHeartbeats returns an array of results; flatten everything to a flat list.
  const checks = settled.flat();
  const ok = checks.every((c) => c.pass);

  return Response.json(
    { ok, checkedAt: new Date().toISOString(), checks },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
