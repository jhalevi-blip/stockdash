// Signed-in smoke test: sign in as the dev test user and visit every signed-in
// page, recording per page:
//   • console errors (real console.error + uncaught pageerror; the browser's
//     redundant "Failed to load resource" network echoes are dropped — the /api
//     bucket already captures those precisely)
//   • failed / non-2xx requests to OUR OWN /api routes
//   • visible error / "unavailable" messages in the rendered page
//   • a full-page screenshot (→ gitignored .smoke-artifacts/)
//
//   (dev server must be running: npm run dev)
//   node --env-file=.env.local scripts/smoke-signed-in.mjs [--headed]
//
// Prints a pass/fail summary per page and exits non-zero if any page fails.
// The page list is imported from the app's own NAV_ITEMS so it can never drift.
// DEV-only: signInTestUser enforces the guard (scripts/lib/devGuard.mjs).
//
// TWO deliberate non-failures, so the signal is real bugs not test artifacts:
//   • net::ERR_ABORTED — the app intentionally cancels in-flight fetches on
//     navigation / stale-fetch supersession. Not a server failure.
//   • HTTP 429 from middleware.js — a shared in-memory 60 req/min-per-IP limiter.
//     A fast full-site crawl trips it, so we PACE requests under the budget and,
//     if a page still rate-limits, wait one window and retry it once. A page that
//     429s even after a fresh window genuinely over-fetches → then it fails.

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { signInTestUser } from './lib/signInTestUser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { NAV_ITEMS } = await import(pathToFileURL(path.join(__dirname, '..', 'app', '(v2)', '_lib', 'routes.js')).href);

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const origin = new URL(baseUrl).origin;
const headed = process.argv.includes('--headed');
const OUT_DIR = '.smoke-artifacts';
const NAV_TIMEOUT = 45000;
const SETTLE_MS = 2500;         // let client-side /api fetches resolve after networkidle
const RATE_WINDOW_MS = 60_000;  // must match middleware.js WINDOW_MS
const RATE_MAX = 60;            // must match middleware.js MAX_REQUESTS
const RATE_BUDGET = 45;         // stay comfortably under the limit while pacing

const ERROR_PATTERNS = [
  /something went wrong/i,
  /failed to load/i,
  /could ?n[o']t load/i,
  /unable to load/i,
  /error loading/i,
  /an error occurred/i,
  /is unavailable/i,
  /temporarily unavailable/i,
  /please try again/i,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT_DIR, { recursive: true });
const routes = NAV_ITEMS.map((n) => ({ id: n.id, label: n.label, href: n.href }));

// Rolling timestamps of our own /api responses, for proactive pacing.
const apiHits = [];
function recordApiHit() { apiHits.push(Date.now()); }
async function paceForBudget() {
  const now = Date.now();
  while (apiHits.length && now - apiHits[0] > RATE_WINDOW_MS) apiHits.shift();
  if (apiHits.length >= RATE_BUDGET) {
    const waitMs = RATE_WINDOW_MS - (now - apiHits[0]) + 500;
    console.log(`   … pacing ${Math.ceil(waitMs / 1000)}s to stay under the ${RATE_MAX}/min API limit`);
    await sleep(waitMs);
    const t = Date.now();
    while (apiHits.length && t - apiHits[0] > RATE_WINDOW_MS) apiHits.shift();
  }
}

let bucket = { console: [], api: [], rateLimited: 0 };
const isOwnApi = (url) => url.startsWith(origin) && url.includes('/api/');

const { browser, page } = await signInTestUser({ headless: !headed, baseUrl });

page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text().replace(/\s+/g, ' ').slice(0, 300);
  if (/Failed to load resource/i.test(text)) return; // redundant with the /api bucket
  bucket.console.push(text);
});
page.on('pageerror', (err) => bucket.console.push(`pageerror: ${err.message}`.slice(0, 300)));
page.on('response', (res) => {
  const url = res.url();
  if (!isOwnApi(url)) return;
  recordApiHit();
  const s = res.status();
  if (s === 429) bucket.rateLimited += 1;
  else if (s >= 400) bucket.api.push(`${s} ${res.request().method()} ${new URL(url).pathname}`);
});
page.on('requestfailed', (req) => {
  const url = req.url();
  if (!isOwnApi(url)) return;
  const err = req.failure()?.errorText || 'net error';
  if (/ERR_ABORTED/i.test(err)) return; // intentional client cancellation
  bucket.api.push(`FAILED ${req.method()} ${new URL(url).pathname} (${err})`);
});

async function visitOnce(route) {
  bucket = { console: [], api: [], rateLimited: 0 };
  let navError = null;
  try {
    await page.goto(`${baseUrl}${route.href}`, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    await sleep(SETTLE_MS);
  } catch (e) { navError = e.message; }

  const visibleErrors = [];
  try {
    const text = await page.evaluate(() => document.body.innerText || '');
    const seen = new Set();
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t && ERROR_PATTERNS.some((re) => re.test(t)) && !seen.has(t)) { seen.add(t); visibleErrors.push(t.slice(0, 140)); }
    }
  } catch { /* page gone */ }

  return { navError, console: [...bucket.console], api: [...bucket.api], rateLimited: bucket.rateLimited, visibleErrors };
}

const results = [];
try {
  for (const route of routes) {
    await paceForBudget();
    let r = await visitOnce(route);

    // If the shared limiter tripped, let the window reset and retry the page once.
    if (r.rateLimited > 0 && !r.api.length) {
      console.log(`   … ${route.href} hit the rate limiter; waiting one window then retrying`);
      await sleep(RATE_WINDOW_MS + 500);
      apiHits.length = 0;
      r = await visitOnce(route);
    }

    const slug = route.href.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
    try { await page.screenshot({ path: path.join(OUT_DIR, `${slug}.png`), fullPage: true }); } catch { /* ignore */ }

    // A page that STILL 429s after a fresh window is genuinely over-fetching → fail.
    const persistentRateLimit = r.rateLimited > 0;
    const failed = !!r.navError || r.api.length > 0 || r.console.length > 0 || r.visibleErrors.length > 0 || persistentRateLimit;
    results.push({ ...route, ...r, persistentRateLimit, failed });

    console.log(`${failed ? '✗' : '✓'} ${route.href.padEnd(22)} ${route.label}`);
    if (r.navError) console.log(`    ↳ navigation error: ${r.navError}`);
    r.api.forEach((a) => console.log(`    ↳ api: ${a}`));
    if (persistentRateLimit) console.log(`    ↳ api: still 429 after window reset (${r.rateLimited} calls) — page over-fetches`);
    r.console.forEach((c) => console.log(`    ↳ console: ${c}`));
    r.visibleErrors.forEach((v) => console.log(`    ↳ visible: "${v}"`));
  }
} finally {
  await browser.close();
}

const failedPages = results.filter((r) => r.failed);
console.log('\n───────────────────────────── SUMMARY ─────────────────────────────');
console.log(`Pages checked : ${results.length}`);
console.log(`Passed        : ${results.length - failedPages.length}`);
console.log(`Failed        : ${failedPages.length}`);
if (failedPages.length) {
  console.log('\nFailing pages:');
  for (const r of failedPages) {
    const reasons = [
      r.navError && 'nav',
      r.api.length && `${r.api.length} api`,
      r.persistentRateLimit && 'rate-limit',
      r.console.length && `${r.console.length} console`,
      r.visibleErrors.length && `${r.visibleErrors.length} visible`,
    ].filter(Boolean).join(', ');
    console.log(`  ✗ ${r.href}  (${reasons})`);
  }
}
console.log(`\nScreenshots   : ${OUT_DIR}/\n`);
process.exit(failedPages.length > 0 ? 1 : 0);
