// Reconciliation + worked example for the per-lot Currency Impact attribution.
//   (npm run dev must be running)
//   node --env-file=.env.local scripts/recon-currency-impact.mjs
//
// For each test user: reads the LIVE card (value + split + window D0) via the UI, then
// INDEPENDENTLY recomputes the attribution from the same APIs and verifies, per lot,
// the identity  ΔEUR == localResult + currencyEffect  (within rounding). Prints a
// seeded worked example: a lot bought before the window, one bought mid-window, and a
// lot sold in the window — shares, dates, FX used, effect, and the total.
import { signInTestUser } from './lib/signInTestUser.mjs';
import { carryForwardLookup } from '../lib/performance/ledger.js';
import { computeCurrencyAttribution, eurValue, normCurrency, isPence } from '../lib/performance/currencyAttribution.js';

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const r2 = (n) => Math.round(n * 100) / 100;

async function forUser(label, userId) {
  const { browser, page } = await signInTestUser({ headless: true, baseUrl, userId });
  try {
    await page.goto(`${baseUrl}/performance`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction(() => {
      const el = [...document.querySelectorAll('div')].find(d => d.textContent?.startsWith('EUR/USD Rate'));
      return el && /\d\.\d{4}/.test(el.textContent);
    }, { timeout: 90000 }).catch(() => {});
    await sleep(1500);

    const ui = await page.evaluate(() => {
      const card = [...document.querySelectorAll('div')].find(d => d.textContent?.startsWith('Currency Impact'));
      const sinceBtn = [...document.querySelectorAll('button')].find(b => /^Since\s+\d{4}-\d{2}-\d{2}/.test(b.textContent || ''));
      return {
        card: card ? card.innerText.replace(/\n/g, ' | ') : null,
        d0: sinceBtn ? (sinceBtn.textContent.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null) : null,
      };
    });

    const raw = await page.evaluate(async () => {
      const rd = await (await fetch('/api/realized-data')).json();
      const legs = rd?.transactions?.tradeLegs ?? [];
      const holdings = (rd?.transactions?.holdings ?? []).filter(h => (h.t ?? h.ticker) !== '__CASH__');
      const tickers = [...new Set(legs.map(l => l.t))];
      const prices = await (await fetch(`/api/prices?tickers=${tickers.join(',')}`)).json();
      const hp = async (syms) => {
        const out = {};
        for (let i = 0; i < syms.length; i += 20) {
          const b = syms.slice(i, i + 20);
          const j = await (await fetch(`/api/historical-prices?tickers=${b.join(',')}&years=5`)).json();
          for (const d of j?.data ?? []) out[d.ticker] = d.prices ?? [];
        }
        return out;
      };
      const fx = await hp(['EURUSD', 'GBPUSD']);
      const closes = await hp(tickers);
      // Current FX from the SAME source the page uses for the EUR/USD Rate card + the
      // portfolio value (chart last-close), so recompute "now" matches the card exactly.
      const chartEur = await (await fetch('/api/chart?symbol=EURUSD%3DX')).json();
      const chartGbp = await (await fetch('/api/chart?symbol=GBPUSD%3DX')).json();
      return {
        legs, holdings, prices, eur: fx.EURUSD ?? [], gbp: fx.GBPUSD ?? [], closes,
        eurNowChart: (chartEur.candles ?? []).at(-1)?.close ?? null,
        gbpNowChart: (chartGbp.candles ?? []).at(-1)?.close ?? null,
      };
    });

    const D0 = ui.d0;
    const fxOf = carryForwardLookup(raw.eur);
    const gbpOf = carryForwardLookup(raw.gbp);
    const closeOf = {}; for (const t of Object.keys(raw.closes)) closeOf[t] = carryForwardLookup(raw.closes[t]);
    const fxAt = (iso) => ({ eurUsd: fxOf(iso), gbpUsd: gbpOf(iso) });
    const lastEurDate = (raw.eur.at(-1)?.date) ?? new Date().toISOString().slice(0, 10);
    // Match the page: current FX = chart last-close (falls back to daily historical).
    const fxNow = {
      eurUsd: raw.eurNowChart ?? fxOf(lastEurDate),
      gbpUsd: raw.gbpNowChart ?? gbpOf(lastEurDate),
    };
    const quotes = {}; for (const p of raw.prices || []) if (p.ticker) quotes[p.ticker] = { price: p.price, currency: p.currency };

    const res = computeCurrencyAttribution({ legs: raw.legs, holdings: raw.holdings, quotes, fxNow, fxAt, closeAt: closeOf, windowStart: D0 });

    console.log(`\n══════════ ${label} (D0=${D0}) ══════════`);
    console.log('LIVE card :', ui.card);
    console.log(`RECOMPUTE : total €${res.total}  (open €${res.open} · realised €${res.realised} · estimated €${res.estimatedEur})  available=${res.available}  sources=${JSON.stringify(res.sources)}`);

    // ── Reconciliation: per lot, ΔEUR == localResult + currencyEffect ───────────
    const perPos = {};
    let worst = 0;
    for (const lot of res.byLot) {
      if (lot.kind === 'estimate' || lot.effect == null) continue;
      const ccy = normCurrency(lot.ccy);
      let dEur, localResult;
      if (lot.kind === 'open') {
        const localNow = lot.localVal;                      // normalised-local
        const cT0 = closeOf[lot.t]?.(lot.t0);
        const cT0n = cT0 == null ? null : (isPence(quotes[lot.t]?.currency) ? cT0 / 100 : cT0);
        if (cT0n == null) continue;
        const localT0 = lot.shares * cT0n;
        const eurNow = eurValue(localNow, ccy, fxNow);
        const eurT0  = eurValue(localT0, ccy, fxAt(lot.t0));
        dEur = eurNow - eurT0;
        localResult = (localNow - localT0) * lot.eT0;
      } else { // sold
        const proceeds = lot.proceeds;
        const cT0 = closeOf[lot.t]?.(lot.t0);
        const cT0n = cT0 == null ? null : (isPence(quotes[lot.t]?.currency) ? cT0 / 100 : cT0);
        if (cT0n == null) continue;
        const localT0 = lot.shares * cT0n;                  // basis value at t0 (market)
        const eurSale = eurValue(proceeds, ccy, fxAt(lot.saleDate));
        const eurT0   = eurValue(localT0, ccy, fxAt(lot.t0));
        dEur = eurSale - eurT0;
        localResult = (proceeds - localT0) * lot.eT0;
      }
      const residual = dEur - (localResult + lot.effect);
      worst = Math.max(worst, Math.abs(residual));
      (perPos[lot.t] ??= { dEur: 0, local: 0, fx: 0, resid: 0 });
      perPos[lot.t].dEur += dEur; perPos[lot.t].local += localResult; perPos[lot.t].fx += lot.effect; perPos[lot.t].resid += residual;
    }
    const bad = Object.entries(perPos).filter(([, v]) => Math.abs(v.resid) > 0.5);
    console.log(`Reconciliation: ${Object.keys(perPos).length} positions checked · worst per-lot residual €${r2(worst)} · ${bad.length ? 'FAIL' : 'all reconcile (ΔEUR = local + currency, within rounding)'}`);
    for (const [t, v] of bad) console.log(`  ✗ ${t}: ΔEUR €${r2(v.dEur)} vs local €${r2(v.local)} + fx €${r2(v.fx)} (residual €${r2(v.resid)})`);

    // ── Worked example (seeded): before-window open, mid-window open, sold-in-window ──
    if (label === 'SEEDED') {
      const beforeOpen = res.byLot.find(l => l.kind === 'open' && l.t0 === D0);
      const midOpen    = res.byLot.find(l => l.kind === 'open' && l.t0 !== D0);
      const sold       = res.byLot.find(l => l.kind === 'sold');
      console.log('\n── WORKED EXAMPLE (seeded) ─────────────────────────────────────');
      const show = (title, l, extra) => {
        if (!l) { console.log(`  ${title}: (none found)`); return; }
        console.log(`  ${title}: ${l.t} — ${l.shares} sh, ccy ${l.ccy}, t0 ${l.t0}${extra ? ', ' + extra : ''}`);
        console.log(`      eT0=${l.eT0?.toFixed(6)} EUR/${l.ccy} (src ${l.src})  ${l.eNow != null ? `eNow=${l.eNow.toFixed(6)}` : `eSale=${l.eSale?.toFixed(6)}`}`);
        console.log(`      ${l.kind === 'open' ? `localVal=${r2(l.localVal)} ${l.ccy}` : `proceeds=${r2(l.proceeds)} ${l.ccy}`}  →  effect €${r2(l.effect)}`);
      };
      show('bought BEFORE window (t0 clamped to D0)', beforeOpen);
      show('bought MID-window (t0 = purchase date)', midOpen);
      show('SOLD in window', sold, sold ? `saleDate ${sold.saleDate}` : '');
      console.log(`  ─ TOTAL card = €${res.total} (open €${res.open} + realised €${res.realised} + estimated €${res.estimatedEur})`);
    }
    return res;
  } finally { await browser.close(); }
}

await forUser('SEEDED', process.env.TEST_USER_ID);
await forUser('EMPTY', process.env.TEST_EMPTY_USER_ID);
process.exit(0);
