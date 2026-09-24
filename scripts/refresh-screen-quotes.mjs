// Refresh screen_quotes: the daily post-close price + 52-week high for every
// ROIC-passer the quality screen might show. Runs as a standalone Node process on a
// GitHub Actions runner (NOT a Vercel cron function — the Hobby tier caps function
// duration at 60s and this job is paced over several minutes).
//
//   node --env-file=.env.local scripts/refresh-screen-quotes.mjs   # dev
//   (CI passes NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY / FMP_API_KEY as env)
//
// WHAT IT DOES:
//   1. Recompute the ROIC-passer set exactly as the screen does (evaluable universe ∩
//      snapshot, operating ROIC ≥ 13%, flagged names excluded) — via lib/screen/metrics.
//   2. Fetch a single-symbol FMP quote for each, PACED at ≤ ~150 req/min so the site's
//      own live quotes (watchlist, alerts) are never starved.
//   3. Upsert { symbol, price, year_high, as_of } into screen_quotes. as_of is the
//      quote's OWN price timestamp (FMP `timestamp`), never wall-clock now.
//
// Read-only against the reference tables; the only table it writes is screen_quotes.
// A quote that fails to fetch is logged and left as-is (its prior, older row — if any —
// stays, so the screen's staleness warning correctly flags it); it is never written as
// a fake "fresh" row.

import { createClient } from '@supabase/supabase-js';
import {
  SNAP_COLS, classifyRow, passesRoic, fin,
} from '../lib/screen/metrics.js';

const FMP_BASE = 'https://financialmodelingprep.com/stable';
const RATE_PER_MIN = 145;                 // headroom under FMP Starter's ~300/min & the site
const SPACING_MS = Math.ceil(60_000 / RATE_PER_MIN);  // ≈ 414ms between request starts
const UPSERT_CHUNK = 500;

function die(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const fmpKey = process.env.FMP_API_KEY;
if (!url || !secret) die('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY missing.');
if (!fmpKey) die('FMP_API_KEY missing.');
const sb = createClient(url, secret);

const PAGE = 1000;
async function fetchAll(table, columns, apply) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(columns).range(from, from + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) die(`read ${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// One single-symbol quote → { price, yearHigh, asOf } or null on failure (1 retry).
async function fetchQuote(symbol) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${FMP_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${fmpKey}`, { cache: 'no-store' });
      if (res.status === 429) { await sleep(1500); continue; }   // backoff on rate-limit
      if (!res.ok) { console.error(`[${symbol}] HTTP ${res.status}`); return null; }
      const j = await res.json();
      const row = Array.isArray(j) ? j[0] : null;
      if (!row) { console.error(`[${symbol}] empty quote payload`); return null; }
      return {
        price: fin(row.price) ? row.price : null,
        yearHigh: fin(row.yearHigh) ? row.yearHigh : null,
        // FMP timestamp is epoch seconds → ISO; null if absent (never synthesize now).
        asOf: row.timestamp ? new Date(row.timestamp * 1000).toISOString() : null,
      };
    } catch (e) {
      console.error(`[${symbol}] fetch error: ${e.message}`);
      await sleep(500);
    }
  }
  return null;
}

(async () => {
  const t0 = Date.now();
  const project = url.match(/https:\/\/([a-z]+)/)?.[1] ?? url;
  console.log(`\nrefresh-screen-quotes → ${project}  (pace ≤ ${RATE_PER_MIN}/min)\n`);

  // 1. Recompute the ROIC-passer set.
  const universe = await fetchAll('symbol_universe', 'symbol', q => q.is('exclusion_reason', null));
  const evalSet = new Set(universe.map(r => r.symbol));
  const snap = await fetchAll('fundamentals_snapshot', SNAP_COLS);
  const passers = [];
  for (const r of snap) {
    if (!evalSet.has(r.symbol)) continue;
    const { flagged, roic } = classifyRow(r);
    if (!flagged && passesRoic(roic)) passers.push(r.symbol);
  }
  passers.sort();
  console.log(`ROIC-passers to quote: ${passers.length}`);

  // 2. Fetch quotes, paced.
  const rows = [];
  let ok = 0, failed = 0;
  const now = new Date().toISOString();
  for (let i = 0; i < passers.length; i++) {
    const started = Date.now();
    const symbol = passers[i];
    const q = await fetchQuote(symbol);
    if (q && (fin(q.price) || fin(q.yearHigh))) {
      rows.push({ symbol, price: q.price, year_high: q.yearHigh, as_of: q.asOf, updated_at: now });
      ok++;
    } else {
      failed++;
    }
    if ((i + 1) % 100 === 0 || i === passers.length - 1) {
      process.stdout.write(`\r  quoted ${i + 1}/${passers.length}  (ok ${ok}, failed ${failed})`);
    }
    const elapsed = Date.now() - started;
    if (i < passers.length - 1 && elapsed < SPACING_MS) await sleep(SPACING_MS - elapsed);
  }
  console.log('');

  // 3. Upsert.
  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await sb.from('screen_quotes').upsert(chunk, { onConflict: 'symbol' });
    if (error) die(`upsert screen_quotes [${i}]: ${error.message}`);
    written += chunk.length;
  }

  console.log(`\nwrote ${written} rows  (ok ${ok}, failed ${failed})  in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  // A run that quoted nothing is a real failure (FMP outage / bad key) — exit non-zero
  // so CI surfaces it instead of silently leaving stale prices.
  if (passers.length > 0 && ok === 0) die('quoted 0 of the ROIC-passers — treating as failure.');
  console.log('✓ done\n');
})().catch(e => die(e.message));
