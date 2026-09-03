// Backfill fundamentals_snapshot from FMP /stable endpoints.
// Universe = NASDAQ + NYSE company-screener (explicit limit=5000, never omitted).
// For each symbol, pull the six probe-verified endpoints, compute derived fields,
// and upsert one row keyed by symbol.
//
// Rules honored here:
//  - Uncomputable field -> NULL (never 0, never a guess). Missing denominator != 0.
//  - Throttle to 150 requests/minute.
//  - Resumable: skip symbols whose as_of is already today.
//  - Flags: --limit N (first N symbols), --dry-run (compute + print, write nothing).
//
// Run: node scripts/backfill-fundamentals.mjs --limit 50 --dry-run
//      node scripts/backfill-fundamentals.mjs            (full universe, writes)
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import readline from 'node:readline';
import { pathToFileURL } from 'url';
import { fetchSymbolFundamentals, computeDerived, buildPeriodRows, num, latestCogsRev, grossMarginYears } from '../lib/watchlist/fundamentals.js';

// Startup flags parsed up front: --prod selects which env file to load, so it must
// be known before credentials are read. Without --prod the script reads .env.local
// (dev) exactly as before; with --prod it reads .env.prod.bak instead.
const argv = process.argv.slice(2);
const PROD = argv.includes('--prod');
const ENV_FILE = PROD ? '.env.prod.bak' : '.env.local';

const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const FMP = env.FMP_API_KEY;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const BASE = 'https://financialmodelingprep.com';

// ── CLI flags ─────────────────────────────────────────────────────────────────
// (argv / PROD / ENV_FILE are parsed above, before credentials are loaded.)
const YES = argv.includes('--yes');   // skip the interactive prod confirmation
const DRY_RUN = argv.includes('--dry-run');
const LIMIT = (() => { const i = argv.indexOf('--limit'); return i >= 0 ? parseInt(argv[i + 1], 10) : null; })();
// --sample <band> takes symbols from a market-cap band instead of the top of the
// list. Band syntax: "500M-1B", "1B-5B", "200B+".  M=1e6, B=1e9. Half-open [lo,hi).
const SAMPLE = (() => { const i = argv.indexOf('--sample'); return i >= 0 ? argv[i + 1] : null; })();
// --refresh-universe: repopulate symbol_universe from the screener, then exit.
// Normal runs read the universe from that table and never call the screener.
const REFRESH_UNIVERSE = argv.includes('--refresh-universe');
// --check-universe: one screener call per exchange, print + append counts to a
// local log. Read-only monitoring — makes no database writes.
const CHECK_UNIVERSE = argv.includes('--check-universe');
// --symbol <TICKER>: fetch and write ONE symbol to all three tables, bypassing the
// universe load, the evaluable-count abort guard, sample/limit and the resume skip.
// For on-demand population of names outside the screener universe (e.g. the research
// page). marketCap/sector/industry are unknown here -> stored NULL (no screener row).
const SYMBOL = (() => { const i = argv.indexOf('--symbol'); return i >= 0 ? (argv[i + 1] || '').toUpperCase() : null; })();
// ── Abort guards ──────────────────────────────────────────────────────────────
// These guard against CATASTROPHIC failure — a missing exchange, a truncated
// response, an inverted exclusion rule — NOT against normal drift. Raw has slid
// 2622 -> 1916 -> 1752 over three days (measured 2026-09-02: raw 1752, evaluable
// 1220), so an ABSOLUTE guard set near the current value would false-abort on
// continued drift — which is exactly why the raw guard is relative.
//   Raw (refresh only): RELATIVE to the previous universe — abort if the new
//     screener raw is more than MAX_RAW_DROP below the previous universe's row
//     count. This tolerates gradual drift but catches a sudden collapse (a missing
//     exchange, a truncated response). MIN_SCREENER_RAW is only the ABSOLUTE
//     backstop, used when there is no previous universe to compare against.
//   MIN_EVALUABLE — a normal backfill run + the refresh's post-exclusion sanity.
const MAX_RAW_DROP = 0.20;    // >20% below the previous universe aborts the refresh
const MIN_SCREENER_RAW = 800; // absolute backstop, only when there is no previous universe
const MIN_EVALUABLE = 600;

// Universe-level exclusion (decided at construction — see docs/decision-universe-exclusions.md).
const EXCL_SECTORS = new Set(['Financial Services', 'Utilities', 'Real Estate']);
// First failing rule wins, in precedence order sector -> cogs_ratio -> gm_years.
function exclusionReason(sector, latest_cogs_rev, gm_years) {
  if (EXCL_SECTORS.has(sector)) return 'sector';
  if (latest_cogs_rev === null || latest_cogs_rev < 0 || latest_cogs_rev > 1) return 'cogs_ratio';
  if (!(gm_years >= 4)) return 'gm_years';
  return null;
}
const parseCap = s => { const m = /^(\d+(?:\.\d+)?)([MB])$/.exec(s.trim()); return m ? parseFloat(m[1]) * (m[2] === 'B' ? 1e9 : 1e6) : null; };
const parseBand = s => {
  if (!s) return null;
  if (s.endsWith('+')) return { lo: parseCap(s.slice(0, -1)), hi: null };
  const [a, b] = s.split('-'); return { lo: parseCap(a), hi: parseCap(b) };
};

// ── Dates ───────────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10);

// ── Throttle: 150 req/min => >=400ms between requests, globally ────────────────
const MIN_GAP_MS = Math.ceil(60000 / 150); // 400ms
let lastReq = 0;
let gateChain = Promise.resolve();
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Serialize EVERY request through a promise chain so concurrent callers (the
// per-symbol Promise.all) are actually spaced MIN_GAP_MS apart. A plain
// read-sleep-write gate races under Promise.all and bursts 6-at-once, which FMP
// throttles; chaining makes it a true global mutex -> steady 150 req/min.
function gate() {
  gateChain = gateChain.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastReq);
    if (wait > 0) await sleep(wait);
    lastReq = Date.now();
  });
  return gateChain;
}
async function getJson(path) {
  await gate();
  try {
    const r = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}apikey=${FMP}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j && typeof j === 'object' && (j['Error Message'] || j.error)) return null;
    return j;
  } catch { return null; }
}

// Numeric helpers (num, ratio, cagr, …) and the per-symbol fetch/compute now live
// in lib/watchlist/fundamentals.js. `num` is imported for the universe helpers below.

// ── Universe: NASDAQ + NYSE, explicit limit=5000 (never omit) ──────────────────
const CORE = 'isActivelyTrading=true&isEtf=false&isFund=false&marketCapMoreThan=500000000&volumeMoreThan=200000&limit=5000';
async function screener(exchange) {
  const j = await getJson(`/stable/company-screener?exchange=${exchange}&${CORE}`);
  return Array.isArray(j) ? j : [];
}

// The previous universe = the rows written by the most recent refresh strictly
// before today (identified by the newest last_seen < TODAY): how many there are and
// their by-reason composition. Used as the moving baseline for the relative raw guard
// and printed alongside it. Returns count 0 when the table is empty or has only
// today's rows (e.g. a same-day re-run), which makes the guard fall back to the
// absolute floor.
async function previousUniverse() {
  const { data, error } = await sb.from('symbol_universe')
    .select('last_seen').lt('last_seen', TODAY).order('last_seen', { ascending: false }).limit(1);
  if (error) { console.error(`symbol_universe read error: ${error.message}`); process.exit(1); }
  if (!data || data.length === 0) return { date: null, count: 0, byReason: {} };
  const date = data[0].last_seen;
  // Pull the whole cohort's exclusion_reason (paginated) so its composition can be
  // shown next to the raw drift on every refresh.
  let rows = [], from = 0; const PAGE = 1000;
  while (true) {
    const { data: page, error: pErr } = await sb.from('symbol_universe')
      .select('exclusion_reason').eq('last_seen', date).range(from, from + PAGE - 1);
    if (pErr) { console.error(`symbol_universe read error: ${pErr.message}`); process.exit(1); }
    rows = rows.concat(page);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  const byReason = {};
  for (const r of rows) { const k = r.exclusion_reason || 'evaluable'; byReason[k] = (byReason[k] || 0) + 1; }
  return { date, count: rows.length, byReason };
}
const fmtReasons = r => ['sector', 'cogs_ratio', 'gm_years', 'evaluable'].map(k => `${k}=${r[k] || 0}`).join(', ');

// Repopulate symbol_universe from the screener AND decide universe-level exclusions
// at construction. Aborts BEFORE any write if the raw screener collapsed relative to
// the previous universe (> MAX_RAW_DROP below it; absolute MIN_SCREENER_RAW floor when
// there is no previous universe) or if too few evaluable survive (< MIN_EVALUABLE), so
// neither a truncated screener nor a broken exclusion pass can overwrite a good table.
async function refreshUniverse() {
  const nasdaq = (await screener('NASDAQ')).map(r => ({ ...r, __ex: 'NASDAQ' }));
  const nyse = (await screener('NYSE')).map(r => ({ ...r, __ex: 'NYSE' }));
  const seen = new Set();
  const rows = [...nasdaq, ...nyse].filter(r => r.symbol && !seen.has(r.symbol) && seen.add(r.symbol));
  console.log(`screener raw: NASDAQ ${nasdaq.length} + NYSE ${nyse.length} = ${rows.length} unique`);

  // Raw guard: RELATIVE to the previous universe, with an absolute backstop. Print
  // both counts so the drift is visible in the run output either way.
  const prev = await previousUniverse();
  if (prev.count > 0) {
    const floor = Math.ceil(prev.count * (1 - MAX_RAW_DROP));
    console.log(`previous universe (${prev.date}): ${prev.count} rows [${fmtReasons(prev.byReason)}]  ->  new raw: ${rows.length}  (relative floor ${floor}; >${(MAX_RAW_DROP * 100).toFixed(0)}% drop aborts)`);
    if (rows.length < floor) {
      console.error(`ABORT: screener raw ${rows.length} < ${floor} (>${(MAX_RAW_DROP * 100).toFixed(0)}% below previous ${prev.count}) — source looks degraded; symbol_universe NOT written.`);
      process.exit(1);
    }
  } else {
    console.log(`no previous universe to compare against; applying absolute floor ${MIN_SCREENER_RAW}. new raw: ${rows.length}`);
    if (rows.length < MIN_SCREENER_RAW) {
      console.error(`ABORT: screener raw ${rows.length} < ${MIN_SCREENER_RAW} (absolute floor, no previous universe) — source looks degraded; symbol_universe NOT written.`);
      process.exit(1);
    }
  }

  // Compute exclusion signals for EVERY symbol (one annual income call each) so any
  // rule can be reversed later from the stored signals without re-probing. This
  // dominates the refresh runtime (~rows count at the 150/min throttle).
  console.log(`computing exclusion signals for ${rows.length} symbols (annual income each)…`);
  const enriched = [];
  let done = 0;
  for (const r of rows) {
    const inc = await getJson(`/stable/income-statement?symbol=${r.symbol}&period=annual&limit=5`);
    const latest_cogs_rev = latestCogsRev(inc);
    const gm_years = grossMarginYears(inc);
    enriched.push({ ...r, latest_cogs_rev, gm_years, exclusion_reason: exclusionReason(r.sector, latest_cogs_rev, gm_years) });
    if (++done % 200 === 0) console.log(`  …${done}/${rows.length}`);
  }

  // Report composition BEFORE writing so real thresholds can be chosen from it.
  const byReason = {}, bySectorExcl = {};
  for (const e of enriched) {
    const k = e.exclusion_reason || 'evaluable';
    byReason[k] = (byReason[k] || 0) + 1;
    if (e.exclusion_reason === 'sector') bySectorExcl[e.sector] = (bySectorExcl[e.sector] || 0) + 1;
  }
  const evaluable = enriched.filter(e => e.exclusion_reason === null).length;
  console.log(`\n=== UNIVERSE COMPOSITION ===`);
  console.log(`raw:        ${rows.length}`);
  console.log(`evaluable:  ${evaluable}  (${(100 * evaluable / rows.length).toFixed(1)}%)`);
  console.log(`excluded by reason:`);
  for (const [k, v] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${v}`);
  console.log(`  sector breakdown: ${Object.entries(bySectorExcl).map(([s, n]) => `${s}=${n}`).join(', ')}`);
  // Same format as the previous-universe line above, so the two are directly comparable.
  console.log(`new universe      (${TODAY}): ${rows.length} rows [${fmtReasons(byReason)}]`);

  if (evaluable < MIN_EVALUABLE) {
    console.error(`\nABORT: evaluable ${evaluable} < ${MIN_EVALUABLE} — exclusion pass or source looks wrong; symbol_universe NOT written.`);
    process.exit(1);
  }

  // first_seen is omitted on purpose: the DB default fills it on insert, and an
  // upsert UPDATE leaves it untouched. last_seen is stamped each run.
  const payload = enriched.map(r => ({
    symbol: r.symbol, exchange: r.__ex,
    sector: r.sector || null, industry: r.industry || null,
    market_cap: num(r.marketCap),
    latest_cogs_rev: r.latest_cogs_rev, gm_years: r.gm_years, exclusion_reason: r.exclusion_reason,
    last_seen: TODAY,
  }));
  let written = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const batch = payload.slice(i, i + 500);
    const { error } = await sb.from('symbol_universe').upsert(batch, { onConflict: 'symbol' });
    if (error) { console.error(`symbol_universe upsert error: ${error.message}`); process.exit(1); }
    written += batch.length;
  }
  console.log(`\nsymbol_universe refreshed: ${written} rows (last_seen=${TODAY}); ${evaluable} evaluable, ${written - evaluable} excluded`);
}

// Read the persisted EVALUABLE universe (exclusion_reason IS NULL). Never calls the
// screener. Returns rows shaped like screener rows (symbol/sector/industry/marketCap)
// so buildRow() is unchanged; excluded symbols stay in the table for audit but are
// never processed here.
async function loadUniverse() {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('symbol_universe')
      .select('symbol,exchange,sector,industry,market_cap')
      .is('exclusion_reason', null)
      .order('symbol').range(from, from + PAGE - 1);
    if (error) { console.error(`symbol_universe read error: ${error.message}`); process.exit(1); }
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out.map(r => ({ symbol: r.symbol, exchange: r.exchange, sector: r.sector, industry: r.industry, marketCap: r.market_cap }));
}

// Monitoring probe: one screener call per exchange. Logs, per exchange, a
// tab-separated line: timestamp, exchange, rows, bytes, bytes/row, whether the
// body's last (non-whitespace) character is a closing bracket, and a status field
// ("ok", or the actual error when fetch throws). The closing-bracket flag tells a
// truncated transfer apart from FMP returning fewer rows. No database access.
async function checkUniverse() {
  const ts = new Date().toISOString();
  let total = 0;
  const symbolsByExchange = {};
  for (const ex of ['NASDAQ', 'NYSE']) {
    let rows = 0, bytes = 0, closed = false, status = 'ok', symbols = [];
    await gate();
    try {
      const r = await fetch(`${BASE}/stable/company-screener?exchange=${ex}&${CORE}&apikey=${FMP}`);
      const body = await r.text();
      bytes = Buffer.byteLength(body, 'utf8');
      closed = body.trimEnd().slice(-1) === ']';       // trailing whitespace ignored
      try { const j = JSON.parse(body); if (Array.isArray(j)) { rows = j.length; symbols = j.map(x => x.symbol).filter(Boolean); } } catch { rows = 0; }
    } catch (e) {
      // fetch throws on network-level failures; the real detail is often in e.cause.
      const cause = e?.cause ? ` (${e.cause.code || e.cause.message || e.cause})` : '';
      status = `${e?.message || e}${cause}`.replace(/\s+/g, ' ').trim();   // keep it single-field TSV-safe
    }
    symbolsByExchange[ex] = symbols;
    total += rows;
    const bpr = rows > 0 ? Math.round(bytes / rows) : 0;
    const line = `${ts}\t${ex}\t${rows}\t${bytes}\t${bpr}\t${closed}\t${status}`;
    console.log(line);
    fs.appendFileSync('scripts/universe-counts.log', line + '\n');
  }
  // Full per-exchange symbol dump (read-only, no DB). Timestamp made filename-safe.
  const file = `scripts/universe-symbols-${ts.replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(file, JSON.stringify({ generatedAt: ts, ...symbolsByExchange }, null, 2));
  console.log(`symbols dumped: ${file} (${total} total)`);
  console.log(`combined raw: ${total}${total < MIN_SCREENER_RAW ? `  (< ${MIN_SCREENER_RAW} — refresh would abort)` : ''}`);
}

// ── Per-symbol computation ─────────────────────────────────────────────────────
// Thin wrapper: fetch via the lib (injecting our throttled getJson so pacing stays
// a script concern), then compute the derived row via the lib. All fetching and
// derivation live in lib/watchlist/fundamentals.js.
export async function buildRow(screenRow) {
  const raw = await fetchSymbolFundamentals(screenRow.symbol, getJson);
  const snapshot = computeDerived(raw, screenRow);
  const { annual, quarterly } = buildPeriodRows(raw, screenRow.symbol);
  return { snapshot, annual, quarterly };
}

// Never start a --prod run silently: require an explicit go-ahead. --yes skips the
// interactive prompt (for non-interactive / CI use); otherwise ask on the terminal
// and abort on anything other than "y".
async function confirmProd() {
  if (YES) { console.log('--yes supplied → proceeding against PRODUCTION.'); return; }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(res => rl.question('Proceed against PRODUCTION? type "y" to continue: ', res));
  rl.close();
  if (answer.trim().toLowerCase() !== 'y') {
    console.error('Aborted — production run not confirmed.');
    process.exit(1);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`backfill-fundamentals  ${TODAY}  ${DRY_RUN ? '[DRY RUN]' : '[WRITE]'}${LIMIT ? `  limit=${LIMIT}` : ''}${SAMPLE ? `  sample=${SAMPLE}` : ''}${REFRESH_UNIVERSE ? '  [refresh-universe]' : ''}${CHECK_UNIVERSE ? '  [check-universe]' : ''}${SYMBOL ? `  symbol=${SYMBOL}` : ''}`);

  // Target banner — always printed before any write, loud and hard to miss, so the
  // destination project is never ambiguous. A --prod run must also be confirmed.
  const bar = '═'.repeat(64);
  console.log(`\n${bar}\n  TARGET: ${PROD ? 'PRODUCTION' : 'DEV'}   ${env.NEXT_PUBLIC_SUPABASE_URL}\n  (env file: ${ENV_FILE})\n${bar}\n`);
  if (PROD) await confirmProd();

  if (CHECK_UNIVERSE) { await checkUniverse(); return; }
  if (REFRESH_UNIVERSE) { await refreshUniverse(); return; }

  let universe, todo;
  if (SYMBOL) {
    // Single-symbol mode: no universe table, no evaluable guard, no sample/limit, no
    // resume skip. One synthetic screener row (cap/sector/industry unknown -> NULL);
    // everything FMP-derived (ratios + raw operands + period history) still populates.
    universe = [{ symbol: SYMBOL, marketCap: null, sector: null, industry: null }];
    todo = universe;
    console.log(`single-symbol mode: ${SYMBOL} — bypassing universe/guard/resume; writing all three tables.\n`);
  } else {
    // Universe comes from the persisted symbol_universe table — the screener is never
    // called on a normal run (repopulate it explicitly with --refresh-universe).
    universe = await loadUniverse();
    console.log(`evaluable universe (from symbol_universe): ${universe.length} symbols`);

    // Abort guard, BEFORE any write. An evaluable universe under MIN_EVALUABLE means
    // symbol_universe is empty/half-written or the exclusion pass over-excluded;
    // refuse to run so a degraded universe can't overwrite fundamentals_snapshot.
    if (universe.length < MIN_EVALUABLE) {
      console.error(`ABORT: evaluable universe ${universe.length} < ${MIN_EVALUABLE} — refusing to run. Repopulate with --refresh-universe.`);
      process.exit(1);
    }

    if (SAMPLE) {
      const band = parseBand(SAMPLE);
      if (!band || band.lo === null) { console.error(`bad --sample band: ${SAMPLE}`); process.exit(1); }
      universe = universe.filter(r => { const mc = num(r.marketCap); return mc !== null && mc >= band.lo && (band.hi === null || mc < band.hi); });
      console.log(`sample band ${SAMPLE}: ${universe.length} symbols in [${band.lo}${band.hi === null ? ', ∞' : `, ${band.hi}`})`);
    }
    if (LIMIT) universe = universe.slice(0, LIMIT);

    // Resume: drop symbols already snapshotted today.
    const wanted = universe.map(r => r.symbol);
    const done = new Set();
    for (let i = 0; i < wanted.length; i += 500) {
      const { data } = await sb.from('fundamentals_snapshot')
        .select('symbol').eq('as_of', TODAY).in('symbol', wanted.slice(i, i + 500));
      (data || []).forEach(r => done.add(r.symbol));
    }
    todo = universe.filter(r => !done.has(r.symbol));
    console.log(`to process: ${todo.length}  (skipped ${universe.length - todo.length} already as_of ${TODAY})\n`);
  }

  // Coverage counters. COLS is derived from the first snapshot row so every stored
  // column — including the new 015 raw operands — is reported without a hand-list to
  // keep in sync. Keys not worth a coverage line (the PK and as_of) are dropped.
  let COLS = null;
  const cover = {};
  const divergences = [];   // {symbol, div} for every row with a computable divergence
  const RATIO_COLS = ['roic', 'roic_reported', 'roe', 'fcf_conversion', 'net_debt_ebitda'];
  const ratioVals = Object.fromEntries(RATIO_COLS.map(c => [c, []]));  // non-null values, for tails
  let gmDropSymbols = 0;    // symbols with >=1 gross-margin year dropped as bad data
  let netCashTrue = 0;      // symbols flagged net_cash = true (netDebt < 0)
  let roicThinBase = 0;     // symbols flagged roic_thin_base = true
  let processed = 0, written = 0, failed = 0;
  // Period-history counters: how many fiscal years / calendar quarters FMP returned
  // per symbol, so we can see how much history actually came back.
  const annualCounts = [], quarterlyCounts = [];
  let annualWritten = 0, quarterlyWritten = 0;

  for (const sr of todo) {
    let built;
    try { built = await buildRow(sr); }
    catch (e) { console.log(`  ${sr.symbol}: build error ${e.message}`); failed++; continue; }
    const row = built.snapshot;
    if (!COLS) { COLS = Object.keys(row).filter(k => k !== 'symbol' && k !== 'as_of' && k !== '__gmDropped'); for (const c of COLS) cover[c] = 0; }
    processed++;
    for (const c of COLS) if (row[c] !== null && row[c] !== undefined) cover[c]++;
    if (row.market_cap_divergence !== null) divergences.push({ symbol: row.symbol, div: row.market_cap_divergence });
    if (row.__gmDropped > 0) gmDropSymbols++;
    if (row.net_cash === true) netCashTrue++;
    if (row.roic_thin_base === true) roicThinBase++;
    for (const c of RATIO_COLS) if (row[c] !== null) ratioVals[c].push(row[c]);
    annualCounts.push(built.annual.length);
    quarterlyCounts.push(built.quarterly.length);

    if (DRY_RUN) {
      console.log(`  ${row.symbol.padEnd(6)} annual=${built.annual.length} quarterly=${built.quarterly.length}  ` + COLS.map(c => `${c}=${row[c] === null ? '∅' : row[c]}`).join('  '));
      continue;
    }
    // Write period rows FIRST, then the snapshot. The snapshot's as_of=today is the
    // resume signal (skipped next run), so it must land only after this symbol's
    // history is safely written — a mid-symbol crash then re-fetches the whole symbol.
    const { __gmDropped, ...dbRow } = row;   // diagnostics don't go to the table
    if (built.annual.length) {
      const { error } = await sb.from('fundamentals_annual').upsert(built.annual, { onConflict: 'symbol,fiscal_year' });
      if (error) { console.log(`  ${row.symbol}: fundamentals_annual upsert error ${error.message}`); failed++; continue; }
      annualWritten += built.annual.length;
    }
    if (built.quarterly.length) {
      const { error } = await sb.from('fundamentals_quarterly').upsert(built.quarterly, { onConflict: 'symbol,calendar_year,calendar_quarter' });
      if (error) { console.log(`  ${row.symbol}: fundamentals_quarterly upsert error ${error.message}`); failed++; continue; }
      quarterlyWritten += built.quarterly.length;
    }
    const { error } = await sb.from('fundamentals_snapshot').upsert(dbRow, { onConflict: 'symbol' });
    if (error) { console.log(`  ${row.symbol}: upsert error ${error.message}`); failed++; }
    else written++;
  }

  // ── Coverage report ─────────────────────────────────────────────────────────
  console.log(`\n=== COVERAGE (${processed} symbols processed${DRY_RUN ? ', nothing written' : `, ${written} written`}${failed ? `, ${failed} failed` : ''}) ===`);
  const pad = (s, n) => String(s).padEnd(n);
  for (const c of (COLS || [])) {
    const n = cover[c], pct = processed ? Math.round((n / processed) * 100) : 0;
    console.log(`  ${pad(c, 24)} ${pad(`${n}/${processed}`, 10)} ${pct}%`);
  }

  // ── Period-history report ─────────────────────────────────────────────────────
  // How much annual/quarterly history FMP actually returned, per symbol, so gaps are
  // visible. `zero` = symbols for which the table got no rows at all.
  const periodStats = arr => {
    if (!arr.length) return { zero: 0, min: 0, p50: 0, max: 0, total: 0 };
    const s = [...arr].sort((a, b) => a - b);
    return { zero: arr.filter(x => x === 0).length, min: s[0], p50: s[Math.floor(0.5 * (s.length - 1))], max: s[s.length - 1], total: arr.reduce((a, b) => a + b, 0) };
  };
  const aS = periodStats(annualCounts), qS = periodStats(quarterlyCounts);
  console.log(`\n=== PERIOD HISTORY (rows per symbol; ${DRY_RUN ? 'not written' : `${annualWritten} annual + ${quarterlyWritten} quarterly rows written`}) ===`);
  console.log(`  ${pad('table', 22)} ${'min'.padStart(5)} ${'p50'.padStart(5)} ${'max'.padStart(5)} ${'zero'.padStart(6)} ${'total'.padStart(8)}`);
  console.log(`  ${pad('fundamentals_annual', 22)} ${String(aS.min).padStart(5)} ${String(aS.p50).padStart(5)} ${String(aS.max).padStart(5)} ${String(aS.zero).padStart(6)} ${String(aS.total).padStart(8)}`);
  console.log(`  ${pad('fundamentals_quarterly', 22)} ${String(qS.min).padStart(5)} ${String(qS.p50).padStart(5)} ${String(qS.max).padStart(5)} ${String(qS.zero).padStart(6)} ${String(qS.total).padStart(8)}`);

  // ── Market-cap divergence report ─────────────────────────────────────────────
  const bad = divergences.filter(d => d.div > 0.2).sort((a, b) => b.div - a.div);
  console.log(`\n=== MARKET-CAP DIVERGENCE ===`);
  console.log(`> 0.2 (untrusted): ${bad.length}  of ${divergences.length} rows with a divergence value`);
  console.log('ten worst offenders:');
  for (const d of bad.slice(0, 10)) console.log(`  ${pad(d.symbol, 8)} ${(d.div * 100).toFixed(1)}%`);

  // ── Gross-margin cleaning + ratio tails ─────────────────────────────────────
  console.log(`\n=== GROSS-MARGIN CLEANING ===`);
  console.log(`symbols with >=1 annual gross-margin year dropped (outside [-1,1]): ${gmDropSymbols} of ${processed}`);
  console.log(`net_cash = true (netDebt < 0, net_debt_ebitda NULLed on purpose): ${netCashTrue} of ${processed}`);
  console.log(`roic_thin_base = true (invested capital < 5% of revenue, roic kept): ${roicThinBase} of ${processed}`);

  const pctile = (arr, p) => {
    if (!arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const idx = (p / 100) * (s.length - 1), lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  const f = v => v === null ? 'n/a' : v.toFixed(4);
  console.log(`\n=== RATIO TAILS (non-null across sample) ===`);
  console.log(`  ${pad('ratio', 16)} ${pad('n', 5)} ${'min'.padStart(13)} ${'p5'.padStart(13)} ${'p95'.padStart(13)} ${'max'.padStart(13)}`);
  for (const c of RATIO_COLS) {
    const a = ratioVals[c];
    const min = a.length ? Math.min(...a) : null, max = a.length ? Math.max(...a) : null;
    console.log(`  ${pad(c, 16)} ${pad(a.length, 5)} ${f(min).padStart(13)} ${f(pctile(a, 5)).padStart(13)} ${f(pctile(a, 95)).padStart(13)} ${f(max).padStart(13)}`);
  }
}

// Run only when executed directly, so the module can be imported for testing
// (the harness/route import buildRow without triggering a full run).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
