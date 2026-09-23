// Anonymize a REAL Saxo transaction export into a fixture for the import-journey
// verification, and emit the ground-truth expectations alongside it.
//
//   node scripts/anonymize-saxo-export.mjs [inputXlsx] [outDir]
//     inputXlsx  default: $SAXO_EXPORT, else the newest .scratch/Transactions_*.xlsx
//     outDir     default: .scratch/fixtures
//
// Anonymization (per the agreed rules):
//   • strip Klant-id and Order-ID columns (identifiers)
//   • scale every monetary amount by ONE constant K — both `Boekingsbedrag`
//     (EUR cash movement) and the price inside `Acties` ("Koop 240 @ 15.50 USD")
//   • keep EVERYTHING else exactly: column layout, dates, currencies, FX rates,
//     share counts and tickers
// Because price and Boekingsbedrag scale by the same K and shares are untouched,
// the file stays internally consistent: holdings (share counts) are unchanged and
// cash is exactly K × the original.
//
// The repo is PUBLIC, so the output lives in the gitignored `.scratch/fixtures/`
// and is never committed. The journey script reads it from there and skips cleanly
// if it is absent.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const SCALE = 0.4137; // one constant applied to all monetary amounts

// Input: explicit path arg, else $SAXO_EXPORT, else the newest Saxo-style
// `Transactions_*.xlsx` dropped in .scratch/ (kept out of git; no account number
// is hardcoded here).
function discoverInput() {
  if (process.argv[2]) return process.argv[2];
  if (process.env.SAXO_EXPORT) return process.env.SAXO_EXPORT;
  const dir = '.scratch';
  const hit = existsSync(dir) && readdirSync(dir)
    .filter((f) => /^Transactions_.*\.xlsx$/i.test(f))
    .map((f) => path.join(dir, f))
    .sort()
    .pop();
  return hit || null;
}

const input = discoverInput();
if (!input || !existsSync(input)) {
  console.error('✖ No Saxo export found. Pass a path, set $SAXO_EXPORT, or drop Transactions_*.xlsx in .scratch/');
  process.exit(1);
}
const outDir = process.argv[3] || '.scratch/fixtures';
const outXlsx = path.join(outDir, 'saxo-real-anon.xlsx');
const outJson = path.join(outDir, 'saxo-real-anon.expected.json');

const wb = XLSX.read(readFileSync(input), { type: 'buffer' });
const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'transacties');
if (!sheetName) { console.error('✖ No "Transacties" sheet — is this a Saxo export?'); process.exit(1); }
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
const H = rows[0];
const col = (name) => H.findIndex((h) => String(h).trim().toLowerCase() === name.toLowerCase());
const ci = {
  kid: col('Klant-id'), type: col('Type'), sym: col('Instrumentsymbool'),
  act: col('Acties'), val: col('Instrumentvaluta'), amt: col('Boekingsbedrag'), oid: col('Order-ID'),
};

const round2 = (n) => Math.round(n * 100) / 100;
// Scale the price inside "Koop 240 @ 15.50 USD" (keep shares + everything else).
function scaleActies(s) {
  return String(s).replace(/(@\s*)(-?\d+(?:\.\d+)?)/, (_, at, price) => at + round2(parseFloat(price) * SCALE));
}

// Independent, CORRECT file-derived facts:
//   • cashEur          — Σ Boekingsbedrag (EUR); exact, no parser logic needed
//   • perTickerCurrency — each traded ticker's instrument currency (Instrumentvaluta)
// We deliberately do NOT reconstruct remaining share counts here: that requires the
// same FIFO / split / corporate-action logic the app parser owns, and a naive
// "Σ Koop − Σ Verkoop" is wrong (it misses sells/splits). Holdings are instead
// verified end-to-end via parse→persist integrity in the journey script.
const perTickerCurrency = new Map(); // ticker -> currency
let cashEur = 0;

const outRows = [H.slice()];
for (const r0 of rows.slice(1)) {
  const r = r0.slice();
  if (ci.kid >= 0) r[ci.kid] = ''; // strip identifier
  if (ci.oid >= 0) r[ci.oid] = ''; // strip order id
  if (ci.amt >= 0 && r[ci.amt] !== '') r[ci.amt] = round2(parseFloat(r[ci.amt]) * SCALE);
  if (ci.act >= 0 && /@/.test(String(r[ci.act]))) r[ci.act] = scaleActies(r[ci.act]);
  outRows.push(r);

  // ── expectations, computed from the anonymized values ──
  if (ci.amt >= 0 && r[ci.amt] !== '' && !Number.isNaN(parseFloat(r[ci.amt]))) cashEur += parseFloat(r[ci.amt]);

  if (String(r[ci.type]).trim().toLowerCase() === 'transactie') {
    const sym = String(r[ci.sym] ?? '');
    if (sym.includes('/')) continue; // options — parser skips these
    if (!/^(Koop|Verkoop)\b/i.test(String(r[ci.act]))) continue;
    const ticker = sym.split(':')[0].toUpperCase();
    if (!ticker) continue;
    const m = String(r[ci.act]).match(/([A-Z]{3})\s*$/);
    const currency = (m?.[1] || r[ci.val] || 'USD').toUpperCase();
    perTickerCurrency.set(ticker, currency);
  }
}

const currencyByTicker = Object.fromEntries([...perTickerCurrency.entries()].sort());

mkdirSync(outDir, { recursive: true });
const outWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(outWb, XLSX.utils.aoa_to_sheet(outRows), 'Transacties');
writeFileSync(outXlsx, XLSX.write(outWb, { type: 'buffer', bookType: 'xlsx' }));

const expected = {
  source: 'Saxo real export (anonymized: ids stripped, amounts scaled)',
  broker: 'saxo',
  scaleConstant: SCALE,
  cashEur: round2(cashEur),
  cashCurrency: 'EUR',
  currencyByTicker,
  tradedTickers: Object.keys(currencyByTicker).length,
  generatedAt: new Date().toISOString(),
};
writeFileSync(outJson, JSON.stringify(expected, null, 2));

console.log(`✓ Wrote ${outXlsx}`);
console.log(`✓ Wrote ${outJson}`);
console.log(`  scale K=${SCALE} | traded tickers=${expected.tradedTickers} | expected cash €${expected.cashEur} (Σ Boekingsbedrag)`);
