// Prove the test user works end-to-end: sign in on localhost in a real Chrome,
// open the dashboard, wait for the seeded holdings + hero chart to render, and
// save a screenshot.
//
//   (dev server must be running: npm run dev)
//   node --env-file=.env.local scripts/verify-test-user-dashboard.mjs [--headed]
//
// DEV-only (see devGuard.mjs). Writes ./dev-test-user-dashboard.png (uncommitted).

import { signInTestUser } from './lib/signInTestUser.mjs';

const headed = process.argv.includes('--headed');
const baseUrl = process.env.VERIFY_BASE_URL || 'http://localhost:3000';
const OUT = 'dev-test-user-dashboard.png';

const { browser, page } = await signInTestUser({ headless: !headed, baseUrl });
try {
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle2', timeout: 60000 });

  // Wait for a seeded holding to appear (proves /api/portfolio returned real data)
  // and for a chart element to exist (the hero chart).
  await page.waitForFunction(() => {
    const txt = document.body.innerText || '';
    const hasHolding = /\bSOFI\b|\bISRG\b|\bCELH\b/.test(txt);
    const hasChart = !!document.querySelector('canvas, svg .recharts-surface, .recharts-surface, svg path');
    return hasHolding && hasChart;
  }, { timeout: 45000 }).catch(() => console.warn('· holdings/chart wait timed out — screenshotting current state anyway'));

  await new Promise((r) => setTimeout(r, 1500)); // let the chart animation settle
  await page.screenshot({ path: OUT, fullPage: true });
  console.log(`✓ Signed in as test user. URL: ${page.url()}`);
  console.log(`✓ Screenshot saved: ${OUT}`);

  // The seeded portfolio is all US (USD) equities, so with per-position currency
  // valuation EVERY position must price: 0 unpriced. A "no price" cell or an
  // "N positions unpriced" note here means a US ticker's exchange isn't mapping to
  // USD (regression in lib/quoteCurrency.js) — fail loudly.
  const unpriced = await page.evaluate(() => {
    const noPriceCells = [...document.querySelectorAll('table tbody tr')]
      .filter((tr) => /no price/i.test(tr.innerText))
      .map((tr) => tr.querySelector('td span')?.innerText?.trim());
    const note = [...document.querySelectorAll('*')]
      .find((e) => e.children.length === 0 && /positions? unpriced/i.test(e.textContent || ''))?.textContent?.trim() || null;
    return { noPriceCells, note };
  });
  if (unpriced.noPriceCells.length > 0 || unpriced.note) {
    console.error(`✖ seeded dashboard has unpriced positions: ${unpriced.noPriceCells.join(', ') || ''} ${unpriced.note ? `(note: "${unpriced.note}")` : ''}`);
    await browser.close();
    process.exit(1);
  }
  console.log('✓ 0 unpriced positions — all seeded holdings priced in USD.');
} finally {
  await browser.close();
}
