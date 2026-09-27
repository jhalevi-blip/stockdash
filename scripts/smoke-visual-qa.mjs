// Visual QA smoke: visit every signed-in page + the public homepage at 390px and
// 1440px in both dark and light themes (toggled via data-theme attribute), screenshot
// each combination, and detect:
//   1. horizontal scroll    — body wider than the viewport
//   2. broken images        — img.naturalWidth === 0
//   3. text silently clipped — overflow:hidden without text-overflow:ellipsis
//   4. WCAG AA contrast     — < 4.5:1 normal text, < 3:1 large text (≥18px or ≥14px bold)
//
// FINGERPRINT STABILITY: each issue key is built from structural (never data-driven) parts:
//   contrast  → page|vp|theme|contrast|structural-selector|fg-css-var|own-bg-css-var
//   text_clip → page|vp|theme|text_clip|structural-selector
//   broken_image → page|vp|theme|broken_image|src-pathname
//   horizontal_scroll → page|vp|theme|horizontal_scroll
//
// "Structural selector" = tag + sorted non-hashed classes + role, 4 levels up the DOM.
// "fg-css-var" / "own-bg-css-var" = the CSS custom property name (--text-muted etc.),
//   resolved from the computed colour against :root. Using CSS-variable names instead of
//   computed RGB values means a new issue on the same pair is the same fingerprint
//   regardless of which ancestor supplies the background.
//   For the background specifically we use the element's OWN backgroundColor (transparent
//   if inherited) — not the DOM-walked ancestor value — so issues are stable even when
//   dynamic content changes which section an element lands in.
//
// First run: --update-baseline records all current findings as the known-issues file.
// Subsequent runs: issues NOT in baseline → exit 1. Known issues always listed.
//
//   node --env-file=.env.local scripts/smoke-visual-qa.mjs [--user seeded|empty] [--update-baseline]
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

// Known CSS custom properties to resolve computed colours back to semantic names.
// Matches the palette defined in app/globals.css (both dark and light theme values).
const KNOWN_CSS_VARS = [
  '--text-primary', '--text-secondary', '--text-muted',
  '--bg-primary', '--bg-card', '--bg-secondary', '--bg-input',
  '--bg-hover', '--bg-page-deep', '--bg-accent-subtle',
  '--accent', '--accent-cta', '--accent-cyan',
  '--positive', '--negative', '--warn',
  '--text-buy', '--text-sell', '--bg-buy', '--bg-sell',
  '--positive-bright', '--positive-soft', '--negative-soft',
  '--border-color', '--border-strong', '--border-accent',
];

// Shared browser-side helpers injected as a stringified block into each evaluate call.
// Avoids duplicating 80+ lines across four check functions.
const BROWSER_HELPERS = /* javascript */ `
  // normalise any colour string → "rgb(R, G, B)"
  function normRgb(s) {
    s = (s||'').trim();
    if (s.startsWith('#')) {
      const h = s.slice(1);
      const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
      return 'rgb('+r+', '+g+', '+b+')';
    }
    const m = s.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    return m ? 'rgb('+m[1]+', '+m[2]+', '+m[3]+')' : s;
  }

  // Build a map: normalised RGB → CSS variable name from the current :root style.
  function buildVarMap(knownVars) {
    const map = {}, style = getComputedStyle(document.documentElement);
    for (const v of knownVars) {
      const val = normRgb(style.getPropertyValue(v).trim());
      if (val) map[val] = v;
    }
    return map;
  }

  // Resolve a computed RGB string to a CSS variable name, or return the RGB as-is.
  function resolveVar(rgb, varMap) { return varMap[normRgb(rgb)] || rgb; }

  // Structural selector: tag + sorted non-hashed classes + role, up to 4 ancestor levels.
  // No text content, no position indices — stable across data-driven DOM changes.
  function structuralSel(el) {
    const parts = [];
    let node = el;
    for (let d = 0; node && node !== document.body && d < 4; d++) {
      const tag = node.tagName.toLowerCase();
      const cls = [...(node.classList||[])]
        .filter(c =>
          c.length < 50 &&
          !/^[a-f0-9]{7,}$/i.test(c) &&   // pure hex hash
          !/_[a-zA-Z0-9]{5,}$/.test(c)     // CSS-module suffix like _abc123
        )
        .sort().slice(0,3).join('.');
      const role = node.getAttribute?.('role')||'';
      parts.unshift(tag + (cls?'.'+cls:'') + (role?'['+role+']':''));
      node = node.parentElement;
    }
    return parts.join('>');
  }
`;

// Evaluate a block in page context, injecting the shared helpers.
async function evalWithHelpers(page, knownVars, body) {
  return page.evaluate(
    new Function('KNOWN_CSS_VARS', `${BROWSER_HELPERS}\nreturn (async()=>{\n${body}\n})();`),
    knownVars,
  );
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Check functions ───────────────────────────────────────────────────────────

async function checkHorizontalScroll(page) {
  return page.evaluate(() => {
    const sw = document.documentElement.scrollWidth;
    const cw = document.documentElement.clientWidth;
    return sw > cw + 2
      ? [{ type: 'horizontal_scroll', scrollWidth: sw, clientWidth: cw }]
      : [];
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
  return evalWithHelpers(page, KNOWN_CSS_VARS, `
    const issues = [], seen = new Set();
    for (const el of document.querySelectorAll('*')) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (!['hidden','clip'].includes(style.overflow) && !['hidden','clip'].includes(style.overflowX)) continue;
      if (style.textOverflow === 'ellipsis') continue;
      if (el.scrollWidth <= el.clientWidth + 5) continue;
      if (!(el.textContent||'').trim()) continue;
      const sel = structuralSel(el);
      if (seen.has(sel)) continue;
      seen.add(sel);
      issues.push({ type:'text_clip', selector:sel, tag:el.tagName,
        scrollWidth:el.scrollWidth, clientWidth:el.clientWidth });
    }
    return issues.slice(0, 20);
  `);
}

async function checkContrast(page) {
  return evalWithHelpers(page, KNOWN_CSS_VARS, `
    const varMap = buildVarMap(KNOWN_CSS_VARS);

    // sRGB → linear; luminance; contrast ratio
    const lin = c => { c/=255; return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4); };
    const lum = (r,g,b) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
    const ratio = (l1,l2) => { const lo=Math.min(l1,l2),hi=Math.max(l1,l2); return (hi+0.05)/(lo+0.05); };
    const parseRgb = s => { const m=s&&s.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/); return m?[+m[1],+m[2],+m[3]]:null; };

    // Walk ancestor chain to find effective background for ratio calculation.
    function resolvedBg(el) {
      let n = el;
      while (n && n.nodeType===1) {
        const bg = getComputedStyle(n).backgroundColor;
        const m  = bg && bg.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
        if (m && (m[4]===undefined || +m[4]>0.1)) return bg;
        n = n.parentElement;
      }
      return 'rgb(255,255,255)';
    }

    const issues = [], seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && issues.length < 40) {
      if ((node.textContent||'').trim().length < 2) continue;
      const el = node.parentElement;
      if (!el) continue;
      const style = getComputedStyle(el);
      if (style.visibility==='hidden' || style.display==='none' || parseFloat(style.opacity)<0.1) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;

      const fgStr = style.color;
      const fgVar = resolveVar(fgStr, varMap);

      // OWN background (not ancestor-resolved) for the fingerprint — stable when
      // dynamic content shifts which section an element lands in.
      const ownBg = style.backgroundColor;
      const ownTransparent = !ownBg || /rgba?\\([^)]+,\\s*0\\)/.test(ownBg) || ownBg==='transparent';
      const bgVarFP = ownTransparent ? 'transparent' : (varMap[normRgb(ownBg)] || normRgb(ownBg));

      const sel = structuralSel(el);
      const dedupKey = sel+'|'+fgVar+'|'+bgVarFP;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      // Ratio calculation uses the fully-resolved (ancestor-walked) background.
      const bgStr = resolvedBg(el);
      const bgVarDisplay = resolveVar(bgStr, varMap);
      const fg = parseRgb(fgStr), bg = parseRgb(bgStr);
      if (!fg || !bg) continue;
      const r  = ratio(lum(...fg), lum(...bg));
      const fs = parseFloat(style.fontSize);
      const fw = parseInt(style.fontWeight, 10);
      const big = fs >= 18 || (fw >= 700 && fs >= 14);
      const threshold = big ? 3.0 : 4.5;

      if (r < threshold - 0.05) {
        issues.push({
          type:'contrast', selector:sel, tag:el.tagName,
          fgVar, bgVarFP,                   // used for stable fingerprint
          fg:fgStr, bgDisplay:bgVarDisplay,  // used for display only
          ratio:+r.toFixed(2), threshold,
          fontSize:+fs.toFixed(0), bold:fw>=700,
        });
      }
    }
    return issues;
  `);
}

// ── Fingerprint (stable, structural) ─────────────────────────────────────────

function fingerprint(href, vp, theme, issue) {
  switch (issue.type) {
    case 'contrast':
      return [href, vp, theme, 'contrast', issue.selector, issue.fgVar, issue.bgVarFP].join('|');
    case 'text_clip':
      return [href, vp, theme, 'text_clip', issue.selector].join('|');
    case 'broken_image':
      return [href, vp, theme, 'broken_image', new URL(issue.src, baseUrl).pathname].join('|');
    case 'horizontal_scroll':
      return [href, vp, theme, 'horizontal_scroll'].join('|');
    default:
      return [href, vp, theme, issue.type].join('|');
  }
}

// ── Root-cause summary ────────────────────────────────────────────────────────

function printRootCauseSummary(allIssues) {
  console.log('\n─── Root-cause summary ─────────────────────────────────────────────');

  // Contrast: group by (theme, fgVar, bgDisplay) — use worst ratio per group.
  const cg = new Map();
  for (const i of allIssues.filter(x => x.type === 'contrast')) {
    const k = `${i.theme}|${i.fgVar}|${i.bgDisplay}`;
    const g = cg.get(k) || { theme:i.theme, fg:i.fgVar, bg:i.bgDisplay,
      ratio:i.ratio, threshold:i.threshold, pages:new Set(), count:0 };
    g.pages.add(i.href); g.count++;
    if (i.ratio < g.ratio) g.ratio = i.ratio;
    cg.set(k, g);
  }
  const contrast = [...cg.values()].sort((a,b) => a.ratio - b.ratio);

  if (contrast.length) {
    console.log(`\nCONTRAST — ${contrast.length} unique fg/bg pair × theme combos:\n`);
    for (const g of contrast) {
      const pages = g.pages.size === 1 ? [...g.pages][0] : `${g.pages.size} pages`;
      console.log(`  ${g.fg}  on  ${g.bg}  (${g.theme})`);
      console.log(`    worst ratio ${g.ratio}:1  need ${g.threshold}:1  —  ${g.count} occurrence${g.count===1?'':'s'} on ${pages}`);
    }
  } else {
    console.log('\nCONTRAST — none');
  }

  const hscroll = allIssues.filter(x => x.type === 'horizontal_scroll');
  const broken  = allIssues.filter(x => x.type === 'broken_image');
  const clips   = allIssues.filter(x => x.type === 'text_clip');

  if (hscroll.length) {
    console.log(`\nHORIZONTAL SCROLL — ${hscroll.length} occurrence(s):`);
    for (const i of hscroll)
      console.log(`  ${i.href}  ${i.vp}px  ${i.theme}  (body ${i.scrollWidth}px > ${i.clientWidth}px)`);
  }
  if (broken.length) {
    console.log(`\nBROKEN IMAGES — ${broken.length}:`);
    for (const i of broken) console.log(`  ${i.href}  ${i.vp}px  ${i.theme}: ${i.src}`);
  }
  if (clips.length) {
    console.log(`\nTEXT CLIPPING — ${clips.length}:`);
    for (const i of clips)
      console.log(`  ${i.href}  ${i.vp}px  ${i.theme}: ${i.selector}  (${i.scrollWidth}>${i.clientWidth}px)`);
  }
  if (!hscroll.length && !broken.length && !clips.length && !contrast.length)
    console.log('\n  (no issues found)');
}

// ── Main ──────────────────────────────────────────────────────────────────────

const baseline = new Set(
  fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : []
);

const pages = [
  ...NAV_ITEMS.map(n => ({ href: n.href, label: n.label })),
  { href: '/', label: 'Homepage (public)' },
];

console.log(`\nVisual QA  →  user=${userArg}  pages=${pages.length}  viewports=390,1440  themes=dark,light`);
if (UPDATE) console.log('  --update-baseline: all findings will be saved as known issues\n');
else        console.log(`  baseline: ${baseline.size} known fingerprints\n`);

const { browser, page } = await signInTestUser({ headless: !headed, baseUrl, userId });
await sleep(1000);

const allIssues   = [];
const newIssues   = [];
const knownIssues = [];

try {
  for (const pg of pages) {
    for (const theme of THEMES) {
      await page.setViewport({ width: VIEWPORTS[0].w, height: VIEWPORTS[0].h, deviceScaleFactor: 1 });
      try {
        await page.goto(`${baseUrl}${pg.href}`, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
      } catch { /* carry on with what loaded */ }
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      await sleep(SETTLE_MS);

      for (const vp of VIEWPORTS) {
        await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
        await sleep(300);

        const slug = pg.href.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
        try {
          await page.screenshot({ path: path.join(OUT_DIR, `${slug}_${vp.label}_${theme}.png`), fullPage: true });
        } catch { /* non-fatal */ }

        const checks = [
          ...await checkHorizontalScroll(page),
          ...await checkBrokenImages(page),
          ...await checkTextClipping(page),
          ...await checkContrast(page),
        ];

        for (const issue of checks) {
          const fp    = fingerprint(pg.href, vp.label, theme, issue);
          const entry = { href: pg.href, vp: vp.label, theme, fp, ...issue };
          allIssues.push(entry);
          if (baseline.has(fp)) knownIssues.push(entry);
          else                   newIssues.push(entry);
        }
      }
    }
    const pageTotal = allIssues.filter(i => i.href === pg.href).length;
    process.stdout.write(`  ${pg.href.padEnd(24)} dark+light×390,1440  issues: ${pageTotal}\n`);
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
      console.log(`    BROKEN_IMG    ${loc}  src="${i.src}"`);
    else if (i.type === 'text_clip')
      console.log(`    TEXT_CLIP     ${loc}  ${i.selector}  (${i.scrollWidth}>${i.clientWidth}px)`);
    else if (i.type === 'contrast')
      console.log(`    CONTRAST      ${loc}  ${i.selector}  fg=${i.fgVar} bg=${i.bgDisplay}  ratio=${i.ratio}:1 (need ${i.threshold}:1)`);
  }
}

if (knownIssues.length > 0) {
  const byPage = new Map();
  for (const i of knownIssues) {
    if (!byPage.has(i.href)) byPage.set(i.href, []);
    byPage.get(i.href).push(i);
  }
  console.log(`\n  ℹ ${knownIssues.length} known issue(s) (in baseline — for awareness):`);
  for (const [href, issues] of byPage)
    console.log(`    ${href}: ${issues.map(i => `${i.type}@${i.vp}/${i.theme}`).slice(0,6).join(', ')}${issues.length>6?` +${issues.length-6} more`:''}`);
}

printRootCauseSummary(allIssues);
console.log(`\n  Total: ${allIssues.length}  (${newIssues.length} new, ${knownIssues.length} known)`);
console.log(`  Screenshots: ${OUT_DIR}/`);

// ── Baseline update ───────────────────────────────────────────────────────────

if (UPDATE) {
  const existing = fs.existsSync(BASELINE_FILE)
    ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
    : [];
  const merged = [...new Set([...existing, ...allIssues.map(i => i.fp)])].sort();
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\n  Baseline updated: ${merged.length} fingerprints → ${path.relative(process.cwd(), BASELINE_FILE)}`);
}

console.log('');
process.exit((!UPDATE && newIssues.length > 0) ? 1 : 0);
