// Brand-new-user broker-import journey, end to end on localhost, in a real Chrome.
//
//   (npm run dev must be running)
//   node --env-file=.env.local scripts/verify-import-journey.mjs [--headed]
//
// For each configured broker fixture that EXISTS on disk:
//   1. reset the empty test user to blank, sign in, screenshot the empty dashboard
//      (assert the "Sample portfolio" state — a brand-new user has no holdings)
//   2. open Add-portfolio → Upload panel, upload the file through the REAL UI
//   3. assert the broker was auto-detected correctly; screenshot the parse summary
//   4. click Import, then Save; screenshot the dashboard with holdings
//   5. read the persisted portfolio (GET /api/portfolio) and compare holdings, cash
//      and currency to the independently-computed expectations from the file,
//      flagging any mismatch
//
// Fixtures live in the gitignored .scratch/fixtures/ (the repo is public, so nothing
// derived from a real export is committed). A missing fixture is SKIPPED with a clear
// message, not a failure. Exits non-zero on any real failure/mismatch.
// DEV-only: signInTestUser + the reset both enforce scripts/lib/devGuard.mjs.

import fs from 'fs';
import path from 'path';
import { signInTestUser } from './lib/signInTestUser.mjs';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { assertDevEnv } from './lib/devGuard.mjs';

assertDevEnv({ supabase: true, clerk: true });

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const headed = process.argv.includes('--headed');
const OUT_DIR = '.scratch/journey-artifacts';
const EMPTY_ID = process.env.TEST_EMPTY_USER_ID;
if (!EMPTY_ID) { console.error('✖ TEST_EMPTY_USER_ID not set — run scripts/create-empty-test-user.mjs'); process.exit(1); }

const FIXTURES = [
  { broker: 'saxo',   label: 'Saxo Bank', file: '.scratch/fixtures/saxo-real-anon.xlsx',   expected: '.scratch/fixtures/saxo-real-anon.expected.json' },
  { broker: 'degiro', label: 'DeGiro',    file: '.scratch/fixtures/degiro-real-anon.xlsx', expected: '.scratch/fixtures/degiro-real-anon.expected.json' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT_DIR, { recursive: true });
const sb = getSupabaseAdmin();

async function resetEmpty() {
  for (const t of ['watchlist_items', 'watchlist_sections', 'portfolios', 'portfolio_transactions']) {
    const { error } = await sb.from(t).delete().eq('user_id', EMPTY_ID);
    if (error) throw new Error(`reset ${t}: ${error.message}`);
  }
}

// Click the first button/anchor whose text matches `pred`. Returns true if clicked.
async function clickByText(page, predSrc) {
  return page.evaluate((src) => {
    const pred = new Function('t', `return ${src};`);
    const el = [...document.querySelectorAll('button, a')].find((e) => pred((e.innerText || '').trim()));
    if (el) { el.click(); return true; }
    return false;
  }, predSrc);
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true });

async function runFixture(page, fx, results) {
  const abs = path.resolve(fx.file);
  const expected = JSON.parse(fs.readFileSync(fx.expected, 'utf8'));
  const flags = [];
  const fail = (m) => { flags.push(m); };

  // 1) reset + empty dashboard
  await resetEmpty();
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  const sampleBanner = await page.evaluate(() => /Sample portfolio|Add your portfolio/i.test(document.body.innerText));
  if (!sampleBanner) fail('empty dashboard did not show the "Sample portfolio / Add your portfolio" state');
  await shot(page, `${fx.broker}-01-empty-dashboard.png`);

  // 2) open editor → upload panel
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('open-portfolio-editor')));
  await page.waitForFunction(() => /Upload CSV\/Excel/i.test(document.body.innerText), { timeout: 15000 });
  await clickByText(page, `/Upload CSV\\/Excel/i.test(t)`);
  const fileInput = await page.waitForSelector('input[type="file"][accept*="csv"]', { timeout: 15000 });

  // capture the /api/upload parse result
  let parse = null;
  const onResp = async (res) => {
    if (res.url().includes('/api/upload') && res.request().method() === 'POST') {
      try { parse = await res.json(); } catch { /* ignore */ }
    }
  };
  page.on('response', onResp);

  // 3) upload + wait for parse
  await fileInput.uploadFile(abs);
  await page.waitForFunction(() => /positions? ready to save|not a CSV|Upload failed|could not/i.test(document.body.innerText), { timeout: 45000 })
    .catch(() => {});
  await sleep(1500);
  page.off('response', onResp);
  await shot(page, `${fx.broker}-02-parsed.png`);

  if (!parse) { fail('no /api/upload response captured'); }
  const detected = (parse?.files?.[0]?.format) || null;
  if (detected !== fx.broker) fail(`broker mis-detected: expected ${fx.broker}, got ${detected ?? 'none'}`);

  // 4) Import → Save
  const clickedImport = await clickByText(page, `/Import\\s+\\d+\\s+position/i.test(t)`);
  if (!clickedImport) fail('could not find the "Import N positions" button');
  await page.waitForFunction(() => /Save Portfolio/i.test(document.body.innerText), { timeout: 15000 }).catch(() => {});
  await sleep(600);
  const clickedSave = await clickByText(page, `/Save Portfolio/i.test(t)`);
  if (!clickedSave) fail('could not find the "Save Portfolio" button');
  await page.waitForFunction(() => !/Save Portfolio/i.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
  await sleep(2500);
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle2' });
  await sleep(2500);
  await shot(page, `${fx.broker}-03-dashboard-holdings.png`);

  // 5) read persisted portfolio and verify against the file
  const persisted = await page.evaluate(async () => {
    const r = await fetch('/api/portfolio'); return r.ok ? r.json() : { error: r.status };
  });
  const pHoldings = Array.isArray(persisted?.holdings) ? persisted.holdings : [];
  const parseHoldings = Array.isArray(parse?.holdings) ? parse.holdings : [];

  // (a) HOLDINGS — parse→import→persist integrity: every parsed position must land
  // in the saved portfolio with the same ticker + shares (nothing lost/corrupted by
  // the UI journey). The parser owns FIFO/splits, so it is the holdings authority;
  // this proves the journey faithfully carries its output through to storage.
  if (parseHoldings.length === 0) fail('parse produced 0 holdings');
  const sh = (arr) => new Map(arr.map((h) => [String(h.t ?? h.ticker).toUpperCase(), Number(h.s ?? h.shares)]));
  const pMap = sh(pHoldings), parseMap = sh(parseHoldings);
  const integrityIssues = [];
  for (const [t, s] of parseMap) {
    if (!pMap.has(t)) integrityIssues.push(`${t}: parsed ${s} shares, not persisted`);
    else if (Math.abs(pMap.get(t) - s) > 1e-6) integrityIssues.push(`${t}: parsed ${s}, persisted ${pMap.get(t)}`);
  }
  for (const [t] of pMap) if (!parseMap.has(t)) integrityIssues.push(`${t}: persisted but not in parse output`);
  if (integrityIssues.length) fail(`holdings parse→persist mismatch:\n      - ` + integrityIssues.slice(0, 12).join('\n      - '));

  // (b) CURRENCY — the file's per-ticker instrument currency (Instrumentvaluta) must
  // match the parser's per-position currency. NOTE: portfolios.holdings does NOT
  // store currency ({t,s,c,d} only), so this is checked on the parse result.
  const curIssues = [];
  let curChecked = 0;
  for (const h of parseHoldings) {
    const t = String(h.t ?? h.ticker).toUpperCase();
    const want = expected.currencyByTicker?.[t];
    const got = (h.currency || '').toUpperCase();
    if (!want || !got) continue;
    curChecked++;
    if (want !== got) curIssues.push(`${t}: file says ${want}, parse says ${got}`);
  }
  if (curIssues.length) fail(`currency mismatch vs file (${curIssues.length}):\n      - ` + curIssues.slice(0, 12).join('\n      - '));

  // (c) CASH — independently derived from the file (Σ Boekingsbedrag, EUR) must match
  // both the parse's reconstructed cash and the persisted __CASH__ entry.
  const pCash = persisted?.cash;
  const parseCash = parse?.currentCash?.amountEur;
  if (expected.cashEur > 0) {
    if (!pCash) fail(`cash missing: file says €${expected.cashEur}`);
    else {
      if (String(pCash.currency).toUpperCase() !== 'EUR') fail(`cash currency: expected EUR, got ${pCash.currency}`);
      if (Math.abs(Number(pCash.amount) - expected.cashEur) > 1.0) fail(`cash vs file: file says €${expected.cashEur}, saved €${pCash.amount}`);
    }
  }
  if (parseCash != null && pCash && Math.abs(Number(pCash.amount) - Number(parseCash)) > 1.0) {
    fail(`parse→persist cash drift: upload €${parseCash}, saved €${pCash.amount}`);
  }

  const passed = flags.length === 0;
  results.push({ ...fx, passed, flags, detected, persistedCount: pHoldings.length,
    parsedCount: parseHoldings.length, curChecked, cash: pCash, expectedCash: expected.cashEur });

  console.log(`${passed ? '✓' : '✗'} ${fx.label}: broker=${detected} · persisted ${pHoldings.length}/${parseHoldings.length} parsed · currency ${curChecked - curIssues.length}/${curChecked} · cash €${pCash?.amount ?? '—'} vs file €${expected.cashEur}`);
  flags.forEach((f) => console.log(`    ↳ ${f}`));
}

// ── run ──────────────────────────────────────────────────────────────────────
const present = FIXTURES.filter((f) => fs.existsSync(f.file) && fs.existsSync(f.expected));
const missing = FIXTURES.filter((f) => !(fs.existsSync(f.file) && fs.existsSync(f.expected)));
for (const m of missing) console.log(`· SKIP ${m.label}: fixture not found at ${m.file} (drop a real export and re-run its anonymizer)`);
if (!present.length) { console.log('\nNo fixtures present — nothing to verify.\n'); process.exit(0); }

const { browser, page } = await signInTestUser({ headless: !headed, baseUrl, userId: EMPTY_ID });
const results = [];
try {
  for (const fx of present) {
    try { await runFixture(page, fx, results); }
    catch (e) { results.push({ ...fx, passed: false, flags: [`threw: ${e.message}`] }); console.log(`✗ ${fx.label}: threw ${e.message}`); }
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log('\n───────────────────────── IMPORT JOURNEY SUMMARY ─────────────────────────');
console.log(`Fixtures run   : ${results.length}   (skipped: ${missing.length})`);
console.log(`Passed         : ${results.length - failed.length}`);
console.log(`Failed         : ${failed.length}`);
console.log(`Screenshots    : ${OUT_DIR}/`);
console.log('');
process.exit(failed.length > 0 ? 1 : 0);
