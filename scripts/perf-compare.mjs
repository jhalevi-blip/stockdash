// Phase 0 compare harness — NEW daily-ledger model beside the OLD chart formula
// on real stored data. READ-ONLY (Supabase SELECT + FMP GET). No page changes.
// Run: node scripts/perf-compare.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import {
  carryForwardLookup, sharesAt, sharesGate, buildDailyLedger,
  twrSeries, spyTwrSeries, xirr,
  windowIntegrity, unpricedHeldTickers, negativeShareTickers,
} from '../lib/performance/ledger.js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
const FMP = env.FMP_API_KEY;
const DEFAULT_START = '2025-07-01';        // configured start date (page default)
const INCEPTION = '2024-06-12';            // first trade leg
const TODAY = new Date().toISOString().slice(0, 10);
const FETCH_FROM = '2024-05-01';           // covers inception
const pad = (s, n) => String(s).padStart(n);

// ── 1. Stored data ───────────────────────────────────────────────────────────
const { data: tx } = await sb.from('portfolio_transactions').select('data').limit(1);
const D = tx[0].data;
const legs = D.tradeLegs, holdings = (D.holdings || []).filter(h => h.t !== '__CASH__');
const deposits = D.deposits || [], dividends = D.dividends || [];
const currentCashEur = D.currentCash?.amountEur ?? 0;
const tradedTickers = [...new Set(legs.map(l => l.t))];   // ALL 41, for inception

// ── 2. FMP fetch ─────────────────────────────────────────────────────────────
async function fmpFull(symbol) {
  const url = `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&from=${FETCH_FROM}&to=${TODAY}&apikey=${FMP}`;
  try { const r = await fetch(url); const j = await r.json(); return Array.isArray(j) ? j.map(x => ({ date: x.date, close: +x.close })) : []; } catch { return []; }
}
async function fmpAdj(symbol) {
  const url = `https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted?symbol=${symbol}&from=${FETCH_FROM}&to=${TODAY}&apikey=${FMP}`;
  try { const r = await fetch(url); const j = await r.json(); return Array.isArray(j) ? j.map(x => ({ date: x.date, close: +x.adjClose })) : []; } catch { return []; }
}
async function pool(items, fn, n = 6) { const out = {}; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = items[i++]; out[k] = await fn(k); } })); return out; }

console.log(`Fetching FMP daily closes for ${tradedTickers.length} traded tickers + SPY + EURUSD (from ${FETCH_FROM})…`);
const raw = await pool(tradedTickers, fmpFull);
const spyAdj = await fmpAdj('SPY');
let eur = await fmpFull('EURUSD'); if (!eur.length) eur = await fmpFull('EURUSD=X');

const closeOf = {}; const firstDateOf = {};
for (const t of tradedTickers) { const s = (raw[t] || []).filter(r => r.close != null).sort((a, b) => a.date.localeCompare(b.date)); closeOf[t] = carryForwardLookup(s); firstDateOf[t] = s[0]?.date ?? null; }
const spyAdjOf = carryForwardLookup(spyAdj);
const fxOf = carryForwardLookup(eur);
const spineAll = spyAdj.map(r => r.date).sort();
const noData = tradedTickers.filter(t => !firstDateOf[t]);
console.log(`Tickers with NO FMP data at all: ${noData.length ? noData.join(', ') : 'none'}`);

// ── 3. Shares gate (window-independent) ──────────────────────────────────────
const gate = sharesGate(legs, holdings, TODAY);
console.log(`SHARES GATE: ${gate.ok ? 'PASS' : 'FAIL — ' + gate.badTickers.map(b => `${b.t}(${b.recon}/${b.held})`).join(', ')}`);

// ── 4. Window runner ─────────────────────────────────────────────────────────
function tickersHeldFrom(D0) {
  return tradedTickers.filter(t => sharesAt(legs, t, D0) > 0 || legs.some(l => l.t === t && l.d >= D0 && l.d <= TODAY));
}
function runWindow(D0, label, { showOld = false } = {}) {
  const dates = spineAll.filter(d => d >= D0 && d <= TODAY);
  const tickers = tickersHeldFrom(D0);
  const rows = buildDailyLedger({ dates, tickers, legs, closeOf, fxOf, dividends });
  const integ = windowIntegrity(rows, {
    unpricedTickers: unpricedHeldTickers(dates, tickers, legs, closeOf),
    negativeTickers: negativeShareTickers(dates, tickers, legs),
  });
  const twr = twrSeries(rows), spy = spyTwrSeries(dates, spyAdjOf, fxOf);
  const twrAt = Object.fromEntries(twr.map(x => [x.date, x.twrPct]));
  const spyAt = Object.fromEntries(spy.map(x => [x.date, x.twrPct]));
  const rowAt = Object.fromEntries(rows.map(r => [r.date, r]));

  // Thin-history degradation: held-but-unpriced days, and which tickers first price AFTER they're first held in-window
  const badPriced = rows.filter(r => !r.priced).length;
  const lateStart = tickers.filter(t => {
    const firstHeld = dates.find(d => sharesAt(legs, t, d) > 0);
    return firstHeld && firstDateOf[t] && firstDateOf[t] > firstHeld;
  }).map(t => `${t}(held ${dates.find(d => sharesAt(legs, t, d) > 0)} but priced from ${firstDateOf[t]})`);

  // MWR since D0
  const H0 = rowAt[D0]?.H ?? rows.find(r => r.H != null)?.H;
  const Hnow = [...rows].reverse().find(r => r.H != null)?.H ?? 0;
  const cf = [{ date: D0, amount: -H0 }];
  for (const dep of deposits) if (dep.date > D0 && dep.date <= TODAY && dep.amountEur) cf.push({ date: dep.date, amount: -dep.amountEur });
  cf.push({ date: TODAY, amount: Hnow + currentCashEur });
  const mwr = xirr(cf);

  // OLD replica (only meaningful for the configured start)
  let oldSeries = null, portReturn = null;
  if (showOld) {
    const eurUsdNow = fxOf(TODAY), eurStart = fxOf(D0);
    const totalCost = holdings.reduce((s, h) => s + h.s * h.c, 0);
    const startCashEur = (D.cashEvents || []).filter(e => e.date && e.date < D0).reduce((s, e) => s + (e.amountEur || 0), 0);
    const netCapital = Math.max(0, totalCost - startCashEur * eurStart) + (D.totalPnl || 0) * eurUsdNow;
    const pvOld = (d) => holdings.reduce((s, h) => s + h.s * (closeOf[h.t](d) ?? h.c), 0);
    const pv0 = pvOld(D0), portNow = pvOld(TODAY);
    portReturn = netCapital > 0 ? (portNow - netCapital) / netCapital * 100 : null;
    oldSeries = (d) => netCapital > 0 ? (pvOld(d) - pv0) / netCapital * 100 : null;
  }

  // sample ~12 evenly-spaced
  const sample = []; for (let i = 0; i <= 11; i++) sample.push(dates[Math.round(i * (dates.length - 1) / 11)]);
  console.log(`\n===== ${label}: ${D0} → ${TODAY} | ${dates.length} days | ${tickers.length} tickers | unpriced-day rows ${badPriced} =====`);
  console.log(`INTEGRITY GATE: ${integ.ok ? 'PASS — displayable' : 'DEGRADE → banner: "' + integ.reason + '"'}`);
  if (lateStart.length) console.log('⚠️ thin history:', lateStart.join('; '));
  console.log(`date        |${showOld ? ' OLD % |' : ''} NEW TWR % | SPY TWR % |    H(d) €`);
  for (const d of [...new Set(sample)]) {
    const r = rowAt[d] || {};
    console.log(`${d} |${showOld ? pad(oldSeries(d)?.toFixed(1) ?? '—', 6) + ' |' : ''}${pad(twrAt[d]?.toFixed(2) ?? '—', 9)} |${pad(spyAt[d]?.toFixed(2) ?? '—', 9)} |${pad(r.H?.toFixed(0) ?? '—', 11)}`);
  }
  console.log(`TWR(${D0})=${twrAt[D0]?.toFixed(3)}%  →  TWR(today)=${twrAt[TODAY]?.toFixed(2)}% | SPY=${spyAt[TODAY]?.toFixed(2)}% | vsSPY=${(twrAt[TODAY] - spyAt[TODAY]).toFixed(2)}% | MWR=${mwr != null ? (mwr * 100).toFixed(2) + '%' : '—'}`);
  if (showOld) console.log(`OLD pinned endpoint=${portReturn?.toFixed(2)}% vs OLD interior=${oldSeries(TODAY).toFixed(2)}% (pin hides the gap)`);
  return { rows, rowAt, twrAt, dates };
}

const def = runWindow(DEFAULT_START, 'DEFAULT (configured 2025-07-01)', { showOld: true });
runWindow(INCEPTION, 'INCEPTION (first leg 2024-06-12)');

// ── 5. Single-interval hand-check: 2026-04-21 → 2026-05-29 (+35pp) ───────────
function handCheck(A, B) {
  console.log(`\n===== HAND-CHECK ${A} → ${B} (raw daily closes) =====`);
  const dates = def.dates.filter(d => d > A && d <= B);
  const startA = def.dates.filter(d => d <= A).at(-1);
  let cum = 1;
  console.log('date        |     H €   | F_trade € | divCr € | r_p day % | cum interval % | note');
  const bigDays = [];
  for (const d of dates) {
    const r = def.rowAt[d], prev = def.rowAt[def.dates[def.dates.indexOf(d) - 1]];
    const rp = (prev?.H > 1e-6) ? ((r.H - (r.F_trade ?? 0) + (r.divCr ?? 0)) / prev.H - 1) : 0;
    cum *= (1 + rp);
    const note = Math.abs(r.F_trade ?? 0) > 2000 ? 'TRADE' : (r.divCr ? 'DIV' : '');
    if (Math.abs(rp) > 0.03) bigDays.push({ d, rp: (rp * 100).toFixed(2), note });
    console.log(`${d} |${pad(r.H?.toFixed(0), 10)} |${pad(r.F_trade?.toFixed(0) ?? '0', 10)} |${pad(r.divCr?.toFixed(2) ?? '0', 8)} |${pad((rp * 100).toFixed(2), 10)} |${pad(((cum - 1) * 100).toFixed(2), 15)} | ${note}`);
  }
  const intervalTwr = (cum - 1) * 100;
  const fromSeries = ((1 + def.twrAt[B] / 100) / (1 + def.twrAt[startA] / 100) - 1) * 100;
  console.log(`\nInterval TWR (hand product)      : ${intervalTwr.toFixed(2)}%`);
  console.log(`Interval TWR (from full series)  : ${fromSeries.toFixed(2)}%   ${Math.abs(intervalTwr - fromSeries) < 0.01 ? '✓ match' : '✗ MISMATCH'}`);

  // Frozen-basket cross-check: shares held at A, valued A→B at raw closes (no flows)
  const heldAtA = tradedTickers.filter(t => sharesAt(legs, t, A) > 0);
  const val = (d) => heldAtA.reduce((s, t) => s + sharesAt(legs, t, A) * (closeOf[t](d) ?? 0), 0) / (fxOf(d) || 1);
  const frozen = (val(B) / val(A) - 1) * 100;
  console.log(`Frozen-basket price return A→B   : ${frozen.toFixed(2)}%   (shares held on ${A}, no trades/flows)`);
  console.log(`Biggest daily moves: ${bigDays.slice(0, 8).map(x => `${x.d} ${x.rp}%${x.note ? '(' + x.note + ')' : ''}`).join(', ')}`);
}
handCheck('2026-04-21', '2026-05-29');

// ── € mirror diagnostic: same flows into SPY total-return ────────────────────
function mirrorDiag(D0) {
  const dates = spineAll.filter(d => d >= D0 && d <= TODAY);
  const tickers = tickersHeldFrom(D0);
  const rows = buildDailyLedger({ dates, tickers, legs, closeOf, fxOf, dividends });
  const H0 = rows.find(r => r.H != null)?.H ?? 0;
  const sCloseEur = (d) => { const s = spyAdjOf(d), fx = fxOf(d); return s != null && fx ? s / fx : null; };
  const s0 = sCloseEur(D0), sEnd = sCloseEur(dates.at(-1));

  console.log(`\n===== € MIRROR DIAG (${D0} → ${TODAY}) =====`);
  console.log(`fx(D0)=${fxOf(D0)?.toFixed(4)}  spyAdj(D0)=${spyAdjOf(D0)?.toFixed(2)}  => sCloseEur(D0)  = €${s0?.toFixed(2)}`);
  console.log(`fx(end)=${fxOf(dates.at(-1))?.toFixed(4)} spyAdj(end)=${spyAdjOf(dates.at(-1))?.toFixed(2)} => sCloseEur(end) = €${sEnd?.toFixed(2)}`);
  console.log(`SPY total return over window = ${((sEnd / s0 - 1) * 100).toFixed(2)}%`);

  const depAfter  = deposits.filter(d => d.date > D0 && d.amountEur);
  const depOnBefore = deposits.filter(d => d.date <= D0 && d.amountEur);
  const sumAfter  = depAfter.reduce((s, d) => s + d.amountEur, 0);
  const sumBefore = depOnBefore.reduce((s, d) => s + d.amountEur, 0);

  let units = 0;
  const u0 = s0 ? H0 / s0 : 0; units += u0;
  console.log(`\nH0 (holdings value at D0) = €${H0.toFixed(0)}  → ${u0.toFixed(2)} SPY units`);
  console.log(`deposits: total €${(sumAfter + sumBefore).toFixed(0)} (${deposits.length}) | after D0 €${sumAfter.toFixed(0)} (${depAfter.length}) | on/before D0 €${sumBefore.toFixed(0)} (${depOnBefore.length})`);

  const rowsOut = [];
  for (const dep of depAfter) { const sp = sCloseEur(dep.date); const u = sp ? dep.amountEur / sp : 0; units += u; rowsOut.push({ ...dep, sp, u }); }

  console.log('\nper-deposit unit additions (all, EUR into SPY total-return):');
  console.log('date        |  €dep  | sCloseEur | +units | value@end €');
  for (const r of rowsOut) console.log(`${r.date} |${String(r.amountEur).padStart(7)} |${(r.sp?.toFixed(2)??'—').padStart(10)} |${r.u.toFixed(2).padStart(7)} |${(r.u * sEnd).toFixed(0).padStart(11)}`);

  const mirrorEur = units * sEnd;
  console.log(`\ntotal units = ${units.toFixed(2)}  → mirrorEur = €${mirrorEur.toFixed(0)}`);
  console.log(`naive "all money earns full window return": (H0 €${H0.toFixed(0)} + depAfter €${sumAfter.toFixed(0)}) × ${(sEnd / s0).toFixed(3)} = €${((H0 + sumAfter) * sEnd / s0).toFixed(0)}`);
  console.log(`naive incl. pre-D0 deposits at face: (€${(H0 + sumAfter + sumBefore).toFixed(0)}) × ${(sEnd / s0).toFixed(3)} = €${((H0 + sumAfter + sumBefore) * sEnd / s0).toFixed(0)}`);
}
mirrorDiag(DEFAULT_START);
