// Refresh founder_flags: for every name the quality screen might show, decide whether
// it is FOUNDER-LED (role CEO) and write one row to founder_flags. Runs as a standalone
// Node process on a GitHub Actions runner (monthly), the same shape as
// refresh-screen-quotes — NOT a Vercel cron (this is paced over minutes).
//
//   node --env-file=.env.local scripts/refresh-founder-flags.mjs          # dev, counts only
//   node --env-file=.env.local scripts/refresh-founder-flags.mjs --list   # dev, also list flagged names
//   (CI passes NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY / FMP_API_KEY as env)
//
// DETECTION — CEO-only and PRECISION-FIRST:
//   1. Recompute the exact set of names the screen might show (through-cycle ROIC passers
//      + short-history latest-year passers) via lib/screen/metrics — the SAME logic as the
//      route and refresh-screen-quotes, so the three never drift. Only these names are
//      checked, never the full universe.
//   2. For each, read FMP stable/profile → the current CEO name + the company CIK. (FMP's
//      CEO field is verified current; we trust it.)
//   3. Resolve the Wikidata entity BY CIK (P5531, 10-digit zero-padded — the same form FMP
//      returns), never by name search, and read its "founded by" people (P112).
//   4. Founder-led iff the CEO name matches a founder name: diacritics stripped, surname
//      plus given-name-or-initial. A match ⇒ founder_led=true, role 'CEO', source
//      'fmp+wikidata'. No match / no CIK / no Wikidata entity / no CEO ⇒ founder_led=false.
//
// OVERRIDES: founder_overrides is hand-curated and ALWAYS WINS at read time (the screen
// route merges the two). This job never reads it for truth — but it SKIPS the auto lookup
// for overridden symbols (their answer is already decided; no point spending FMP/Wikidata
// calls), and reports how many were skipped. So the auto pass can never contradict or
// clobber an override.
//
// Writes only founder_flags. A symbol whose lookup fails is written founder_led=false
// (no badge) — a failed or missing lookup NEVER blocks the screen. Logs show COUNTS ONLY
// unless --list is passed (dev sanity-check), so CI never prints a roster of names.

import { createClient } from '@supabase/supabase-js';
import {
  SNAP_COLS, classifyRow, passesRoic, throughCycleRoic, MIN_HISTORY_YEARS,
} from '../lib/screen/metrics.js';

const FMP_BASE = 'https://financialmodelingprep.com/stable';
const WDQS = 'https://query.wikidata.org/sparql';
const UA = 'stockdash-founder-flags/1.0 (https://stockdashes.com; jhalevi@gmail.com)';
// Paced so neither upstream is stressed: each name is one FMP profile call + at most one
// Wikidata query. Wikidata's public endpoint is the sensitive one (etiquette ~1/s), so we
// space the whole loop at ~1.4s/name; with Wikidata's own latency the ~650-name screen set
// takes ~35 min in practice (the workflow allows 60). Every request also has a hard 15s
// timeout so one hung socket can never stall the whole run.
const SPACING_MS = 1400;
// Hard per-request timeouts so one stalled socket can never hang the run. FMP is quick;
// the Wikidata query is heavier (its P570 "living founder" FILTER NOT EXISTS costs more),
// so it gets a longer budget to avoid spurious aborts.
const FMP_TIMEOUT_MS = 15_000;
const WDQS_TIMEOUT_MS = 25_000;
const UPSERT_CHUNK = 500;
const LIST = process.argv.includes('--list');

function die(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// fetch with a hard timeout — a stalled connection aborts instead of hanging forever.
async function timedFetch(target, opts = {}, timeoutMs = FMP_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(target, { ...opts, signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(t);
  }
}

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

// ── Name matching — PRECISION-FIRST. Resolving founders BY CIK means the candidate set
// is exactly one company's founders, but a descendant CEO named after the founder must
// NEVER be flagged as the founder, so the match is deliberately strict:
//   • diacritics stripped, then compared on surname + given name;
//   • generational suffix (Jr/Sr/II/III/IV) must be EQUAL — a differing suffix, or one
//     present on only one side, is NOT a match (blocks "William Wrigley Jr." ≠ "William
//     Wrigley", the founder's namesake son);
//   • given names match only if identical, a lone initial ("J." ~ "Jeffrey"), or a known
//     nickname pair — a shared first letter alone is NOT enough ("James" ≠ "John").
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);
const NICK_GROUPS = [
  ['dave', 'david'], ['bob', 'rob', 'robert'], ['bill', 'will', 'william'],
  ['mike', 'michael'], ['jeff', 'jeffrey'], ['jim', 'james'], ['tom', 'thomas'],
  ['rick', 'richard'], ['chris', 'christopher'], ['dan', 'daniel'],
  ['steve', 'steven', 'stephen'], ['tony', 'anthony'],
];
const NICK = new Map();
NICK_GROUPS.forEach((g, i) => g.forEach(n => NICK.set(n, i)));

// Normalize to { toks, suffix }: lower-cased, diacritic-free tokens with any trailing
// generational suffix split off (never dropped — it is compared).
function parseName(s) {
  const toks = String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')     // strip diacritics
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')                           // drop punctuation (incl. the '.' after an initial)
    .replace(/\s+/g, ' ').trim()
    .split(' ').filter(Boolean);
  let suffix = '';
  if (toks.length > 1 && SUFFIXES.has(toks[toks.length - 1])) suffix = toks.pop();
  return { toks, suffix };
}

// Given names match iff identical, one is a lone initial of the other, or they share a
// nickname group. A common first letter alone does NOT match.
function givenMatches(a, b) {
  if (a === b) return true;
  if (a.length === 1 || b.length === 1) return a[0] === b[0];   // "J." ~ "Jeffrey"
  const ga = NICK.get(a), gb = NICK.get(b);
  return ga !== undefined && ga === gb;
}

function nameMatches(a, b) {
  const pa = parseName(a), pb = parseName(b);
  if (pa.toks.length < 2 || pb.toks.length < 2) return false;   // need given + surname on both
  if (pa.suffix !== pb.suffix) return false;                    // generational suffix must be equal
  if (pa.toks[pa.toks.length - 1] !== pb.toks[pb.toks.length - 1]) return false;   // surname
  return givenMatches(pa.toks[0], pb.toks[0]);
}

// FMP profile → { ceo, cik } or null on failure (1 retry). cik is zero-padded to 10.
async function fetchProfile(symbol) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await timedFetch(`${FMP_BASE}/profile?symbol=${encodeURIComponent(symbol)}&apikey=${fmpKey}`);
      if (res.status === 429) { await sleep(1500); continue; }
      if (!res.ok) { console.error(`[${symbol}] profile HTTP ${res.status}`); return null; }
      const j = await res.json();
      const row = Array.isArray(j) ? j[0] : null;
      if (!row) return null;
      const ceo = typeof row.ceo === 'string' && row.ceo.trim() ? row.ceo.trim() : null;
      const rawCik = row.cik != null ? String(row.cik).replace(/\D/g, '') : '';
      const cik = rawCik ? rawCik.padStart(10, '0') : null;
      return { ceo, cik };
    } catch (e) {
      console.error(`[${symbol}] profile error: ${e.message}`);
      await sleep(500);
    }
  }
  return null;
}

// Wikidata "founded by" (P112) English labels for the entity whose CIK (P5531) equals the
// 10-digit padded cik. [] when the entity or the property is absent. null on query failure.
// LIVING founders only: a founder with a date of death (P570) is excluded — a deceased
// person cannot be the current CEO, so this drops namesake-descendant false positives (a
// son/CEO sharing the founder's name) even when FMP omits the "II"/"Jr." from the CEO.
async function fetchFounders(cik) {
  const query = `SELECT ?fLabel WHERE { ?c wdt:P5531 "${cik}". ?c wdt:P112 ?f. `
    + `FILTER NOT EXISTS { ?f wdt:P570 ?death } `
    + `?f rdfs:label ?fLabel. FILTER(LANG(?fLabel)="en") }`;
  const target = `${WDQS}?format=json&query=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await timedFetch(target, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } }, WDQS_TIMEOUT_MS);
      if (res.status === 429 || res.status >= 500) { await sleep(2000); continue; }
      if (!res.ok) { console.error(`[${cik}] wdqs HTTP ${res.status}`); return null; }
      const j = await res.json();
      return (j?.results?.bindings ?? []).map(b => b.fLabel?.value).filter(Boolean);
    } catch (e) {
      console.error(`[${cik}] wdqs error: ${e.message}`);
      await sleep(1000);
    }
  }
  return null;
}

(async () => {
  const t0 = Date.now();
  const project = url.match(/https:\/\/([a-z]+)/)?.[1] ?? url;
  console.log(`\nrefresh-founder-flags → ${project}  (CEO-only, precision-first)\n`);

  // 1. Recompute the set of names the screen might show — through-cycle passers (10-yr
  //    median ≥ floor) PLUS short-history names (< MIN_HISTORY_YEARS computable years)
  //    whose LATEST-year ROIC clears the floor. Identical to refresh-screen-quotes.
  const universe = await fetchAll('symbol_universe', 'symbol', q => q.is('exclusion_reason', null));
  const evalSet = new Set(universe.map(r => r.symbol));
  const snap = await fetchAll('fundamentals_snapshot', SNAP_COLS);
  const annual = await fetchAll('fundamentals_annual',
    'symbol, fiscal_year, ebit, income_tax_expense, income_before_tax, total_current_assets, cash_and_equivalents, total_current_liabilities, short_term_debt, net_ppe');
  const annualBySym = new Map();
  for (const r of annual) { const a = annualBySym.get(r.symbol); if (a) a.push(r); else annualBySym.set(r.symbol, [r]); }
  const screenNames = [];
  for (const r of snap) {
    if (!evalSet.has(r.symbol)) continue;
    if (classifyRow(r).flagged) continue;
    const tc = throughCycleRoic(annualBySym.get(r.symbol));
    const gateable = tc.years >= MIN_HISTORY_YEARS;
    if ((gateable && passesRoic(tc.median)) || (!gateable && tc.years > 0 && passesRoic(tc.latest))) {
      screenNames.push(r.symbol);
    }
  }
  screenNames.sort();

  // Overridden symbols are already decided (override wins at read time) — skip their auto
  // lookup. Read the symbol list only; never their values.
  const overrides = await fetchAll('founder_overrides', 'symbol');
  const overrideSet = new Set(overrides.map(r => r.symbol));
  const toCheck = screenNames.filter(s => !overrideSet.has(s));
  const overriddenInScreen = screenNames.filter(s => overrideSet.has(s));
  console.log(`screen-relevant names: ${screenNames.length}  (overridden, skipped: ${overriddenInScreen.length};  to auto-check: ${toCheck.length})`);

  // 2–4. For each name: FMP CEO + CIK → Wikidata P112 by P5531 → name match. Paced.
  const rows = [];
  const flaggedNames = [];   // for the optional --list roster
  let checked = 0, autoFlagged = 0, noCik = 0, noEntity = 0, lookupFailed = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < toCheck.length; i++) {
    const started = Date.now();
    const symbol = toCheck[i];
    let founderLed = false, founderName = null;

    const prof = await fetchProfile(symbol);
    if (!prof) {
      lookupFailed++;                                        // FMP failed → no badge, counted
    } else if (!prof.ceo || !prof.cik) {
      if (!prof.cik) noCik++;                                // can't resolve the entity precisely
    } else {
      const founders = await fetchFounders(prof.cik);
      if (founders === null) {
        lookupFailed++;                                      // Wikidata failed → no badge, counted
      } else if (founders.length === 0) {
        noEntity++;                                          // no entity for this CIK, or no P112
      } else if (founders.some(f => nameMatches(prof.ceo, f))) {
        founderLed = true;
        founderName = prof.ceo;                              // the current, clean CEO name
      }
    }

    rows.push({ symbol, founder_led: founderLed, founder_name: founderName,
      role: founderLed ? 'CEO' : null, source: 'fmp+wikidata', checked_at: now });
    checked++;
    if (founderLed) { autoFlagged++; flaggedNames.push(`${symbol} — ${founderName}`); }

    if ((i + 1) % 50 === 0 || i === toCheck.length - 1) {
      process.stdout.write(`\r  checked ${i + 1}/${toCheck.length}  (auto-flagged ${autoFlagged})`);
    }
    const elapsed = Date.now() - started;
    if (i < toCheck.length - 1 && elapsed < SPACING_MS) await sleep(SPACING_MS - elapsed);
  }
  console.log('');

  // 5. Upsert founder_flags (overridden symbols are intentionally not written here).
  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await sb.from('founder_flags').upsert(chunk, { onConflict: 'symbol' });
    if (error) die(`upsert founder_flags [${i}]: ${error.message}`);
    written += chunk.length;
  }

  console.log(
    `\nchecked ${checked}  ·  auto-flagged ${autoFlagged}  ·  overridden ${overriddenInScreen.length}  ` +
    `·  no-CIK ${noCik}  ·  no-entity/no-P112 ${noEntity}  ·  lookup-failed ${lookupFailed}  ` +
    `·  wrote ${written} rows  in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  if (LIST) {
    console.log(`\nauto-flagged (${flaggedNames.length}):`);
    for (const n of flaggedNames) console.log(`  ${n}`);
    if (overriddenInScreen.length) console.log(`overridden & screen-relevant (${overriddenInScreen.length}): ${overriddenInScreen.join(', ')}`);
  }
  console.log('✓ done\n');
})().catch(e => die(e.message));
