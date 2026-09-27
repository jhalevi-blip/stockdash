// Visual QA smoke: visit every signed-in page + the public homepage at 390px and
// 1440px in both dark and light themes (toggled via data-theme attribute), screenshot
// each combination, and detect:
//   1. horizontal scroll    — body wider than the viewport
//   2. broken images        — img.naturalWidth === 0
//   3. text silently clipped — overflow:hidden without text-overflow:ellipsis
//   4. WCAG AA contrast     — < 4.5:1 normal text, < 3:1 large text (≥18px or ≥14px bold)
//
// First run: pass --update-baseline to record all findings as the known-issues file.
// Subsequent runs: issues NOT in the baseline → exit 1 (new regression).
// Known issues (in baseline) are always listed but never block the run.
//
//   node --env-file=.env.local scripts/smoke-visual-qa.mjs [--user seeded|empty] [--update-baseline]
//   node --env-file=.env.local scripts/smoke-visual-qa.mjs --user empty [--update-baseline]
//
// (npm run dev must be running; DEV-only: devGuard enforced by signInTestUser)

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { signInTestUser } from './lib/signInTestUser.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { NAV_ITEMS } = await import(pathToFileURL(path.join(__dirname, '..', 'app', '(v2)', '_lib', 'routes.js')).href);

const baseUrl   = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const headed    = process.argv.includes('--headed');
const UPDATE    = process.argv.includes('--update-baseline');
const userArg   = (process.argv.find(a => a.startsWith('--user='))?.split('=')[1])
               || (process.argv.includes('--user') ? process.argv[process.argv.indexOf('--user') + 1] : null)
               || 'seeded';
const userId    = userArg === 'empty' ? process.env.TEST_EMPTY_USER_ID : process.env.TEST_USER_ID;
if (!userId) { console.error(`✖ no user id for --user ${userArg}`); process.exit(1); }

const OUT_DIR       = `.scratch/visual-qa/${userArg}`;
const BASELINE_FILE = path.join(__dirname, 'visual-qa-baseline.json');
const SETTLE_MS     = 2500;
const NAV_TIMEOUT   = 45000;

const VIEWPORTS = [
  { w: 390,  h: 844, label: '390'  },
  { w: 1440, h: 900, label: '1440' },
];
const THEMES = ['dark', 'light'];

fs.mkdirSync(OUT_DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Checks (each runs inside page.evaluate) ───────────────────────────────────

async function checkHorizontalScroll(page) {
  return page.evaluate(() => {
    const sw = document.documentElement.scrollWidth;
    const cw = document.documentElement.clientWidth;
    return sw > cw + 2 ? [{ type: 'horizontal_scroll', scrollWidth: sw, clientWidth: cw }] : [];
  });
}

async function checkBrokenImages(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('img')]
      .filter(img => img.complete && img.naturalWidth === 0 && img.src)
      .map(img => ({ type: 'broken_image', src: img.src, alt: img.alt || '' }))
  );
}

async function checkTextClipping(page) {
  return page.evaluate(() => {
    const issues = [];
    const seen = new Set();
    for (const el of document.querySelectorAll('*')) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (!['hidden', 'clip'].includes(style.overflow) && !['hidden', 'clip'].includes(style.overflowX)) continue;
      if (style.textOverflow === 'ellipsis') continue;    // intentional truncation
      if (el.scrollWidth <= el.clientWidth + 5) continue; // not actually overflowing
      const text = (el.textContent || '').trim().slice(0, 40);
      if (!text) continue;
      const key = el.tagName + '|' + text.slice(0, 20);
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({ type: 'text_clip', tag: el.tagName, text,
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
    return issues.slice(0, 20);
  });
}

async function checkContrast(page) {
  return page.evaluate(() => {
    function sRGBtoLin(c) {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    function luminance(r, g, b) {
      return 0.2126 * sRGBtoLin(r) + 0.7152 * sRGBtoLin(g) + 0.0722 * sRGBtoLin(b);
    }
    function ratio(l1, l2) {
      const lo = Math.min(l1, l2), hi = Math.max(l1, l2);
      return (hi + 0.05) / (lo + 0.05);
    }
    function parseRgb(s) {
      const m = s && s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [+m[1], +m[2], +m[3]] : null;
    }
    function resolvedBg(el) {
      let node = el;
      while (node && node.nodeType === 1) {
        const bg = window.getComputedStyle(node).backgroundColor;
        const m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (m && (m[4] === undefined || +m[4] > 0.1)) return bg;
        node = node.parentElement;
      }
      return 'rgb(255,255,255)';
    }

    const issues = [], seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && issues.length < 40) {
      const text = (node.textContent || '').trim();
      if (text.length < 2) continue;
      const el = node.parentElement;
      if (!el) continue;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) < 0.1) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;

      const fgStr = style.color;
      const bgStr = resolvedBg(el);
      const key   = fgStr + '|' + bgStr + '|' + el.tagName;
      if (seen.has(key)) continue;
      seen.add(key);

      const fg = parseRgb(fgStr), bg = parseRgb(bgStr);
      if (!fg || !bg) continue;

      const r   = ratio(luminance(...fg), luminance(...bg));
      const fs  = parseFloat(style.fontSize);
      const fw  = parseInt(style.fontWeight, 10);
      const big = fs >= 18 || (fw >= 700 && fs >= 14);
      const threshold = big ? 3.0 : 4.5;

      if (r < threshold - 0.05) {
        issues.push({ type: 'contrast', tag: el.tagName,
          text: text.slice(0, 40), ratio: +r.toFixed(2), threshold,
          fg: fgStr, bg: bgStr, fontSize: +fs.toFixed(0), bold: fw >= 700 });
      }
    }
    return issues;
  });
}

// ── Fingerprint for baseline comparison ───────────────────────────────────────
// Stable key per issue that doesn't depend on pixel measurements that vary.

function fingerprint(href, vp, theme, issue) {
  const parts = [href, vp, theme, issue.type];
  if (issue.type === 'contrast')          parts.push(issue.fg, issue.bg, issue.tag);
  else if (issue.type === 'broken_image') parts.push(new URL(issue.src, baseUrl).pathname);
  else if (issue.type === 'text_clip')    parts.push(issue.tag, (issue.text || '').slice(0, 20));
  // horizontal_scroll: page+viewport+theme is the full key
  return parts.join('|');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const baseline = new Set(
  fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : []
);

const pages = [
  ...NAV_ITEMS.map(n => ({ href: n.href, label: n.label })),
  { href: '/', label: 'Homepage (public)', public: true },
];

console.log(`\nVisual QA  →  user=${userArg}  pages=${pages.length}  viewports=390,1440  themes=dark,light`);
if (UPDATE) console.log('  --update-baseline: all findings will be saved as known issues\n');
else console.log(`  baseline: ${baseline.size} known fingerprints\n`);

const { browser, page } = await signInTestUser({ headless: !headed, baseUrl, userId });
await sleep(1000);

const allIssues   = [];  // { href, vp, theme, ...issue }
const newIssues   = [];
const knownIssues = [];

try {
  for (const pg of pages) {
    for (const theme of THEMES) {
      // Navigate (reload with correct theme set).
      await page.setViewport({ width: VIEWPORTS[0].w, height: VIEWPORTS[0].h, deviceScaleFactor: 1 });
      try {
        await page.goto(`${baseUrl}${pg.href}`, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
      } catch { /* timeout on slow pages — still check what loaded */ }
      // Apply theme by setting the attribute the CSS targets.
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await sleep(SETTLE_MS);

      for (const vp of VIEWPORTS) {
        await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
        await sleep(300);  // let layout reflow

        const slug = pg.href.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
        const shotName = `${slug}_${vp.label}_${theme}.png`;
        try {
          await page.screenshot({ path: path.join(OUT_DIR, shotName), fullPage: true });
        } catch { /* ignore screenshot errors */ }

        const checks = [
          ...await checkHorizontalScroll(page),
          ...await checkBrokenImages(page),
          ...await checkTextClipping(page),
          ...await checkContrast(page),
        ];

        for (const issue of checks) {
          const fp = fingerprint(pg.href, vp.label, theme, issue);
          const entry = { href: pg.href, vp: vp.label, theme, fp, ...issue };
          allIssues.push(entry);
          if (baseline.has(fp)) knownIssues.push(entry);
          else                   newIssues.push(entry);
        }
      }
    }
    process.stdout.write(`  ${pg.href.padEnd(24)} dark+light×390,1440  issues: ${allIssues.filter(i=>i.href===pg.href).length}\n`);
  }
} finally {
  await browser.close();
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════ VISUAL QA RESULTS ═══════════════════════');
if (newIssues.length === 0 && !UPDATE) {
  console.log('  ✓ No new issues (all findings are in the baseline)\n');
} else if (newIssues.length > 0) {
  console.log(`  ✗ ${newIssues.length} NEW issue(s) not in baseline:\n`);
  for (const i of newIssues) {
    const loc = `[${i.href}  ${i.vp}px  ${i.theme}]`;
    if (i.type === 'horizontal_scroll')
      console.log(`    HORIZ_SCROLL  ${loc}  body ${i.scrollWidth}px > viewport ${i.clientWidth}px`);
    else if (i.type === 'broken_image')
      console.log(`    BROKEN_IMG    ${loc}  src="${i.src}"  alt="${i.alt}"`);
    else if (i.type === 'text_clip')
      console.log(`    TEXT_CLIP     ${loc}  <${i.tag}> "${i.text}"  (${i.scrollWidth}>${i.clientWidth}px)`);
    else if (i.type === 'contrast')
      console.log(`    CONTRAST      ${loc}  <${i.tag}> "${i.text}"  ratio=${i.ratio}:1 (need ${i.threshold}:1)  fg=${i.fg} bg=${i.bg}`);
  }
}
if (knownIssues.length > 0) {
  console.log(`\n  ℹ ${knownIssues.length} known issue(s) (in baseline — listed for awareness):`);
  const byPage = new Map();
  for (const i of knownIssues) {
    const k = i.href;
    if (!byPage.has(k)) byPage.set(k, []);
    byPage.get(k).push(i);
  }
  for (const [href, issues] of byPage) {
    console.log(`    ${href}: ${issues.map(i => `${i.type}@${i.vp}/${i.theme}`).join(', ')}`);
  }
}

console.log(`\n  Total issues found: ${allIssues.length}  (${newIssues.length} new, ${knownIssues.length} known)`);
console.log(`  Screenshots: ${OUT_DIR}/`);

// ── Baseline update ───────────────────────────────────────────────────────────

if (UPDATE) {
  // Merge new findings into any pre-existing baseline from other users.
  const existing = fs.existsSync(BASELINE_FILE)
    ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
    : [];
  const merged = [...new Set([...existing, ...allIssues.map(i => i.fp)])].sort();
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\n  Baseline updated: ${merged.length} fingerprints → ${BASELINE_FILE}`);
}

console.log('');
process.exit((!UPDATE && newIssues.length > 0) ? 1 : 0);
