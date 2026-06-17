import { getSupabaseAdmin } from '@/lib/supabase';
import { sendToSubscriptions } from '@/lib/push';
import { fmtCurrency, fmtPct } from '@/app/(v2)/_lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Daily morning portfolio-summary push. Scheduled by vercel.json (06:00 UTC).
// For every subscribed user, computes their portfolio standing as of the last
// market close — replicating the dashboard's realPortfolioStats math verbatim
// (app/(v2)/dashboard/page.jsx) — and sends a web push:
//   title "StockDashes", body "Portfolio €432,622 · −1.07% at last close".
//
// Self-guarded by Authorization: Bearer ${CRON_SECRET} (Vercel injects this on
// cron invocations once CRON_SECRET is set; the same bearer enables manual
// curl tests). No middleware change needed — Clerk doesn't force auth on /api.
//
// All data is read server-side (Supabase + Finnhub + Yahoo). No Clerk session,
// no self-HTTP to our own API routes.

// Mirror of app/api/prices/route.js field selection — quote only (price + chgPct).
async function fetchQuotes(tickers, key) {
  const priceMap = {};
  const BATCH = 6; // modest concurrency to stay within the function timeout
  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (t) => {
        try {
          const quote = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${t}&token=${key}`,
            { cache: 'no-store' }
          ).then((r) => r.json());
          return { t, price: quote.c > 0 ? quote.c : quote.pc, chgPct: quote.dp };
        } catch {
          return { t, price: 0, chgPct: 0 };
        }
      })
    );
    for (const r of results) priceMap[r.t] = r;
  }
  return priceMap;
}

// Mirror of app/api/chart/route.js (Yahoo, EURUSD=X) + the dashboard's
// "last candle close > 0" gate. Default range '1y' → interval '1wk', matching
// the dashboard's /api/chart?symbol=EURUSD%3DX call. Returns USD-per-EUR or null.
async function fetchEurUsd() {
  try {
    const res = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=1wk&range=1y',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        next: { revalidate: 3600 }, // share /api/chart's hourly Data Cache entry for this URL
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const candles = timestamps
      .map((ts, i) => ({ close: closes[i] ?? null }))
      .filter((c) => c.close != null);
    const last = candles[candles.length - 1]?.close;
    return last != null && last > 0 ? last : null;
  } catch {
    return null;
  }
}

// Mirror of app/api/portfolio/route.ts holdings parsing: split positions from
// the cash sentinel { t: '__CASH__', amount, currency }.
function parsePortfolio(holdingsRaw) {
  const raw = Array.isArray(holdingsRaw) ? holdingsRaw : [];
  const cashEntry = raw.find((h) => h?.t === '__CASH__') ?? null;
  const positions = raw.filter((h) => h?.t !== '__CASH__');
  const cash = cashEntry
    ? { amount: cashEntry.amount, currency: cashEntry.currency ?? 'USD' }
    : null;
  return { positions, cash };
}

export async function GET(request) {
  // ── Auth: Vercel-injected (or manual) bearer ────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Skip weekends (no market close) ─────────────────────────────────────────
  const utcDay = new Date().getUTCDay(); // 0 = Sun, 6 = Sat
  if (utcDay === 0 || utcDay === 6) {
    return Response.json({ skipped: 'weekend' });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return Response.json({ error: 'Database unavailable' }, { status: 500 });

  // VAPID must be configured before we attempt any send (sendToSubscriptions
  // calls setVapidDetails, which throws on missing keys).
  if (
    !process.env.VAPID_SUBJECT ||
    !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY
  ) {
    return Response.json({ error: 'Push not configured' }, { status: 500 });
  }

  const finnhubKey = process.env.FINNHUB_API_KEY;
  if (!finnhubKey) return Response.json({ error: 'Missing API key' }, { status: 500 });

  // ── Load subscribers ────────────────────────────────────────────────────────
  const { data: subs, error: subErr } = await sb
    .from('push_subscriptions')
    .select('endpoint, subscription, user_id');
  if (subErr) return Response.json({ error: subErr.message }, { status: 500 });

  const summary = { usersProcessed: 0, sent: 0, failed: 0, removed: 0, skipped: 0 };
  if (!subs?.length) return Response.json(summary);

  // Group subscriptions by owning user (a user may have several devices).
  const subsByUser = new Map();
  for (const s of subs) {
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, []);
    subsByUser.get(s.user_id).push({ endpoint: s.endpoint, subscription: s.subscription });
  }
  const userIds = [...subsByUser.keys()];

  // ── Load those users' portfolios in one query ───────────────────────────────
  const { data: portfolioRows, error: pErr } = await sb
    .from('portfolios')
    .select('user_id, holdings')
    .in('user_id', userIds);
  if (pErr) return Response.json({ error: pErr.message }, { status: 500 });

  const portfolioByUser = new Map();
  for (const row of portfolioRows ?? []) {
    portfolioByUser.set(row.user_id, parsePortfolio(row.holdings));
  }

  // ── Unique ticker set across all users → one Finnhub quote each ──────────────
  const tickerSet = new Set();
  for (const { positions } of portfolioByUser.values()) {
    for (const h of positions) if (h?.t) tickerSet.add(h.t);
  }
  const priceMap = tickerSet.size
    ? await fetchQuotes([...tickerSet], finnhubKey)
    : {};

  // ── EUR/USD once ────────────────────────────────────────────────────────────
  const eurUsd = await fetchEurUsd();
  // Every figure is denominated in EUR (totalValueUsd ÷ eurUsd). If the FX fetch
  // failed we have no rate, so abort the whole run rather than send a wrong
  // number — sending garbage is worse than sending nothing.
  if (!eurUsd) {
    return Response.json({ skipped: 'fx_unavailable', usersProcessed: 0, sent: 0, failed: 0, removed: 0 });
  }

  // ── Per user: replicate realPortfolioStats, build body, send ────────────────
  for (const uid of userIds) {
    const portfolio = portfolioByUser.get(uid);
    if (!portfolio || portfolio.positions.length === 0) {
      summary.skipped += 1; // no portfolio row, or no positions
      continue;
    }

    const { positions, cash } = portfolio;
    const cashAmount = cash?.amount ?? 0;

    // Row enrichment (page.jsx ~201–219): price/chgPct from the live quote.
    const rows = positions.map((h) => {
      const q = priceMap[h.t] ?? {};
      const price = q.price ?? 0;
      const change = q.chgPct ?? 0;
      const mktValue = h.s * price;
      return { mktValue, change };
    });

    // realPortfolioStats (page.jsx ~258–288), USD aggregates first.
    const totalValueUsd = rows.reduce((s, r) => s + r.mktValue, 0);
    if (totalValueUsd <= 0) {
      summary.skipped += 1; // no priceable positions
      continue;
    }
    const dayChangeUsd = rows.reduce((s, r) => s + r.mktValue * (r.change / 100), 0);
    const prevValueUsd = totalValueUsd - dayChangeUsd;
    const dayChangePct = prevValueUsd > 0 ? (dayChangeUsd / prevValueUsd) * 100 : 0;

    // Display-layer FX: USD → EUR (÷ eurUsd) and fold EUR cash flat into the
    // total, exactly as the component does. Until eurUsd loads the dashboard
    // shows USD with cash excluded — we mirror that (eurUsd === null) path too.
    const positionsValue = eurUsd ? totalValueUsd / eurUsd : totalValueUsd;
    const totalValue = positionsValue + (eurUsd ? cashAmount : 0);
    const displayCurrency = eurUsd ? 'EUR' : 'USD';

    const body = `Portfolio ${fmtCurrency(totalValue, 0, displayCurrency)} · ${fmtPct(dayChangePct)} at last close`;
    const payload = JSON.stringify({ title: 'StockDashes', body, url: '/dashboard' });

    const r = await sendToSubscriptions({ sb, subs: subsByUser.get(uid), payload });
    summary.sent += r.sent;
    summary.failed += r.failed;
    summary.removed += r.removed;
    summary.usersProcessed += 1;
  }

  return Response.json(summary);
}
