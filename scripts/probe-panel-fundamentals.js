// Probe the FMP endpoints the /watchlist DETAIL PANEL needs (STEP 2), against the
// Starter key. READ-ONLY. Additive — does not touch scripts/probe-fundamentals.js.
//
// Verifies field names + Starter-tier access for exactly the panel payload:
//   market cap, enterprise value, total debt, cash & equivalents, P/E, P/S,
//   next earnings date, last 5 quarters of revenue / gross profit / net income.
//
// Prints the actual response (first element, pretty) plus the extracted fields so
// we can confirm names before writing the route. Run: node scripts/probe-panel-fundamentals.js
const fs = require('fs');

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const FMP = env.FMP_API_KEY;
if (!FMP) { console.error('FMP_API_KEY missing from .env.local'); process.exit(1); }

const BASE = 'https://financialmodelingprep.com';
const SYMBOLS = ['MSFT', 'AAPL'];
const withKey = p => `${BASE}${p}${p.includes('?') ? '&' : '?'}apikey=${FMP}`;

async function hit(path) {
  try {
    const r = await fetch(withKey(path));
    const body = await r.text();
    let json = null; try { json = JSON.parse(body); } catch {}
    const errObj = json && !Array.isArray(json) && (json['Error Message'] || json.error);
    return { status: r.status, ok: r.status === 200 && !errObj, json, raw: body };
  } catch (e) {
    return { status: 0, ok: false, json: null, raw: `FETCH ERROR: ${e.message}` };
  }
}

const first = res => Array.isArray(res.json) ? res.json[0] : res.json;
const pick = (o, keys) => keys.map(k => `${k}=${o && o[k] !== undefined ? JSON.stringify(o[k]) : '∅'}`).join('  ');

(async () => {
  console.log(`FMP PANEL probe — ${new Date().toISOString()}  key ...${FMP.slice(-4)}\n`);

  for (const SYM of SYMBOLS) {
    console.log(`\n############## ${SYM} ##############`);

    // 1) Enterprise values — market cap + EV
    {
      const r = await hit(`/stable/enterprise-values?symbol=${SYM}&limit=1`);
      console.log(`\n--- enterprise-values  [${r.status} ${r.ok ? 'OK' : 'FAIL'}] ---`);
      console.log(JSON.stringify(first(r), null, 2)?.slice(0, 900));
      console.log('→', pick(first(r), ['date', 'marketCapitalization', 'enterpriseValue', 'addTotalDebt', 'minusCashAndCashEquivalents']));
    }

    // 2) ratios-ttm — P/E, P/S
    {
      const r = await hit(`/stable/ratios-ttm?symbol=${SYM}`);
      console.log(`\n--- ratios-ttm  [${r.status} ${r.ok ? 'OK' : 'FAIL'}] ---`);
      const o = first(r) || {};
      const peSales = Object.keys(o).filter(k => /priceToEarnings|priceEarnings|priceToSales|priceSales|peRatio|psRatio/i.test(k));
      console.log('PE/PS-ish keys:', peSales.length ? peSales.map(k => `${k}=${JSON.stringify(o[k])}`).join('  ') : '(none — dumping keys)');
      if (!peSales.length) console.log('all keys:', Object.keys(o).join(', '));
    }

    // 3) key-metrics-ttm — cross-check market cap + any PE
    {
      const r = await hit(`/stable/key-metrics-ttm?symbol=${SYM}`);
      console.log(`\n--- key-metrics-ttm  [${r.status} ${r.ok ? 'OK' : 'FAIL'}] ---`);
      const o = first(r) || {};
      console.log('→', pick(o, ['marketCap', 'enterpriseValueTTM', 'evToSalesTTM']));
      const peKeys = Object.keys(o).filter(k => /pe|earnings|sales/i.test(k));
      console.log('pe/sales-ish keys:', peKeys.join(', '));
    }

    // 4) balance-sheet QUARTERLY — total debt, cash & equivalents (Starter gating check)
    {
      const r = await hit(`/stable/balance-sheet-statement?symbol=${SYM}&period=quarter&limit=1`);
      console.log(`\n--- balance-sheet-statement period=quarter  [${r.status} ${r.ok ? 'OK' : 'FAIL'}] ---`);
      const o = first(r) || {};
      console.log('→', pick(o, ['date', 'period', 'fiscalYear', 'totalDebt', 'cashAndCashEquivalents', 'cashAndShortTermInvestments', 'netDebt']));
    }

    // 5) income QUARTERLY limit=5 — revenue / grossProfit / netIncome (Starter gating check)
    {
      const r = await hit(`/stable/income-statement?symbol=${SYM}&period=quarter&limit=5`);
      console.log(`\n--- income-statement period=quarter limit=5  [${r.status} ${r.ok ? 'OK' : 'FAIL'}] ---`);
      const arr = Array.isArray(r.json) ? r.json : [];
      console.log(`rows: ${arr.length}`);
      for (const q of arr) console.log('   ', pick(q, ['date', 'period', 'fiscalYear', 'revenue', 'grossProfit', 'netIncome']));
    }

    // 6) next earnings date — try /stable/earnings, then /stable/earnings-calendar
    {
      const today = new Date().toISOString().slice(0, 10);
      const rE = await hit(`/stable/earnings?symbol=${SYM}&limit=12`);
      console.log(`\n--- earnings  [${rE.status} ${rE.ok ? 'OK' : 'FAIL'}] ---`);
      if (rE.ok && Array.isArray(rE.json)) {
        console.log('sample row:', JSON.stringify(rE.json[0]));
        const future = rE.json.filter(e => e.date && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
        console.log(`next upcoming (date >= ${today}):`, future[0] ? JSON.stringify(future[0]) : '(none in window)');
      } else {
        console.log('body:', String(rE.raw).slice(0, 200));
      }
      const rC = await hit(`/stable/earnings-calendar?symbol=${SYM}&from=${today}&limit=5`);
      console.log(`--- earnings-calendar  [${rC.status} ${rC.ok ? 'OK' : 'FAIL'}] ---`);
      if (rC.ok && Array.isArray(rC.json)) console.log('sample row:', JSON.stringify(rC.json[0]));
      else console.log('body:', String(rC.raw).slice(0, 160));
    }
  }
})();
