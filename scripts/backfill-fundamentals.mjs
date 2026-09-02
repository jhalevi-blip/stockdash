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
import { pathToFileURL } from 'url';
import { fetchSymbolFundamentals, computeDerived, num, latestCogsRev, grossMarginYears } from '../lib/watchlist/fundamentals.js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const FMP = env.FMP_API_KEY;
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const BASE = 'https://financialmodelingprep.com';

// ── CLI flags ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
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
// ── Abort guards ──────────────────────────────────────────────────────────────
// These guard against CATASTROPHIC failure — a missing exchange, a truncated
// response, an inverted exclusion rule — NOT against normal drift. They sit well
// below the live values on purpose: raw has slid 2622 -> 1916 -> 1752 over three
// days (measured 2026-09-02: raw 1752, evaluable 1220), so a guard set near the
// current value would false-abort on continued drift. Drift itself is monitored
// via the raw count printed on every refresh — that's the signal, not the guard.
//   MIN_SCREENER_RAW — refresh only: detects a degraded/truncated screener.
//   MIN_EVALUABLE    — a normal backfill run + the refresh's post-exclusion sanity.
const MIN_SCREENER_RAW = 800;
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

// Repopulate symbol_universe from the screener AND decide universe-level exclusions
// at construction. Aborts BEFORE any write if the raw screener is degraded
// (< MIN_SCREENER_RAW) or if too few evaluable survive (< MIN_EVALUABLE), so neither
// a truncated screener nor a broken exclusion pass can overwrite a good table.
async function refreshUniverse() {
  const nasdaq = (await screener('NASDAQ')).map(r => ({ ...r, __ex: 'NASDAQ' }));
  const nyse = (await screener('NYSE')).map(r => ({ ...r, __ex: 'NYSE' }));
  const seen = new Set();
  const rows = [...nasdaq, ...nyse].filter(r => r.symbol && !seen.has(r.symbol) && seen.add(r.symbol));
  console.log(`screener raw: NASDAQ ${nasdaq.length} + NYSE ${nyse.length} = ${rows.length} unique`);
  if (rows.length < MIN_SCREENER_RAW) {
    console.error(`ABORT: screener raw ${rows.length} < ${MIN_SCREENER_RAW} — source looks degraded; symbol_universe NOT written.`);
    process.exit(1);
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
    const k = e.exclusion_reason || '(evaluable)';
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
  return computeDerived(raw, screenRow);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`backfill-fundamentals  ${TODAY}  ${DRY_RUN ? '[DRY RUN]' : '[WRITE]'}${LIMIT ? `  limit=${LIMIT}` : ''}${SAMPLE ? `  sample=${SAMPLE}` : ''}${REFRESH_UNIVERSE ? '  [refresh-universe]' : ''}${CHECK_UNIVERSE ? '  [check-universe]' : ''}`);

  if (CHECK_UNIVERSE) { await checkUniverse(); return; }
  if (REFRESH_UNIVERSE) { await refreshUniverse(); return; }

  // Universe comes from the persisted symbol_universe table — the screener is never
  // called on a normal run (repopulate it explicitly with --refresh-universe).
  let universe = await loadUniverse();
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
  const todo = universe.filter(r => !done.has(r.symbol));
  console.log(`to process: ${todo.length}  (skipped ${universe.length - todo.length} already as_of ${TODAY})\n`);

  // Coverage counters over every populated column (excl. key/date).
  const COLS = ['market_cap', 'market_cap_divergence', 'avg_dollar_volume', 'sector', 'industry',
    'roic', 'roic_thin_base', 'roe', 'gross_margin', 'gross_margin_stdev', 'gross_margin_years',
    'operating_income', 'fcf', 'net_income', 'fcf_conversion', 'net_debt_ebitda', 'net_cash',
    'nulled_ratios', 'shares_cagr_3y', 'revenue_cagr_3y', 'price', 'high_52w', 'drawdown_pct'];
  const cover = Object.fromEntries(COLS.map(c => [c, 0]));
  const divergences = [];   // {symbol, div} for every row with a computable divergence
  const RATIO_COLS = ['roic', 'roe', 'fcf_conversion', 'net_debt_ebitda'];
  const ratioVals = Object.fromEntries(RATIO_COLS.map(c => [c, []]));  // non-null values, for tails
  let gmDropSymbols = 0;    // symbols with >=1 gross-margin year dropped as bad data
  let netCashTrue = 0;      // symbols flagged net_cash = true (netDebt < 0)
  let roicThinBase = 0;     // symbols flagged roic_thin_base = true
  let processed = 0, written = 0, failed = 0;

  for (const sr of todo) {
    let row;
    try { row = await buildRow(sr); }
    catch (e) { console.log(`  ${sr.symbol}: build error ${e.message}`); failed++; continue; }
    processed++;
    for (const c of COLS) if (row[c] !== null && row[c] !== undefined) cover[c]++;
    if (row.market_cap_divergence !== null) divergences.push({ symbol: row.symbol, div: row.market_cap_divergence });
    if (row.__gmDropped > 0) gmDropSymbols++;
    if (row.net_cash === true) netCashTrue++;
    if (row.roic_thin_base === true) roicThinBase++;
    for (const c of RATIO_COLS) if (row[c] !== null) ratioVals[c].push(row[c]);

    if (DRY_RUN) {
      console.log(`  ${row.symbol.padEnd(6)} ` + COLS.map(c => `${c}=${row[c] === null ? '∅' : row[c]}`).join('  '));
    } else {
      const { __gmDropped, ...dbRow } = row;   // diagnostics don't go to the table
      const { error } = await sb.from('fundamentals_snapshot').upsert(dbRow, { onConflict: 'symbol' });
      if (error) { console.log(`  ${row.symbol}: upsert error ${error.message}`); failed++; }
      else written++;
    }
  }

  // ── Coverage report ─────────────────────────────────────────────────────────
  console.log(`\n=== COVERAGE (${processed} symbols processed${DRY_RUN ? ', nothing written' : `, ${written} written`}${failed ? `, ${failed} failed` : ''}) ===`);
  const pad = (s, n) => String(s).padEnd(n);
  for (const c of COLS) {
    const n = cover[c], pct = processed ? Math.round((n / processed) * 100) : 0;
    console.log(`  ${pad(c, 22)} ${pad(`${n}/${processed}`, 10)} ${pct}%`);
  }

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
