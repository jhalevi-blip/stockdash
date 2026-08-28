// Import a TradingView watchlist export into watchlist_sections / watchlist_items
// (build-order step 1, spec §2).
//
// Usage:
//   node --env-file=.env.local scripts/import-watchlist.mjs <export-file> <clerkUserId> [--replace]
//
//   <export-file>   path to the TradingView .txt export
//   <clerkUserId>   the Clerk user id these rows belong to (e.g. user_2abc...)
//   --replace       delete this user's existing watchlist rows first (idempotent re-import)
//
// Behaviour (spec §2): section headers → watchlist_sections, symbols → watchlist_items.
// provider_symbol is resolved once via FMP symbol search. Rows that don't resolve are
// written with resolved=false / provider_symbol=null — NEVER dropped, NEVER guessed.
// A failed resolution CALL (network/HTTP) is reported separately and makes the script
// exit non-zero so you know to re-run rather than trust a false "no coverage".

import fs from 'fs';
import { parseTvExport } from '../lib/watchlist/parseTvExport.js';
import { resolveSymbol } from '../lib/watchlist/resolveSymbol.js';
import { getSupabaseAdmin } from '../lib/supabase.js';

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const [, , filePath, clerkUserId, ...rest] = process.argv;
const replace = rest.includes('--replace');

if (!filePath || !clerkUserId) {
  fail('Usage: node --env-file=.env.local scripts/import-watchlist.mjs <export-file> <clerkUserId> [--replace]');
}
if (!fs.existsSync(filePath)) fail(`Export file not found: ${filePath}`);

const fmpKey = process.env.FMP_API_KEY;
if (!fmpKey) fail('FMP_API_KEY is missing — run with `node --env-file=.env.local`.');

const sb = getSupabaseAdmin();
if (!sb) fail('Supabase admin client not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY).');

const text = fs.readFileSync(filePath, 'utf8');
const { sections } = parseTvExport(text);
if (!sections.length) fail('No sections/symbols parsed — check the export format against scripts/watchlist.sample.tv.txt.');

const totalSymbols = sections.reduce((n, s) => n + s.items.length, 0);
console.log(`\nParsed ${sections.length} section(s), ${totalSymbols} symbol(s) for user ${clerkUserId}.`);

if (replace) {
  console.log('--replace: clearing existing watchlist rows for this user…');
  // Items first (FK → sections). Both errors surface; we don't proceed on failure.
  const delItems = await sb.from('watchlist_items').delete().eq('user_id', clerkUserId);
  if (delItems.error) fail(`Failed clearing watchlist_items: ${delItems.error.message}`);
  const delSecs = await sb.from('watchlist_sections').delete().eq('user_id', clerkUserId);
  if (delSecs.error) fail(`Failed clearing watchlist_sections: ${delSecs.error.message}`);
}

const summary = { resolved: 0, unresolved: 0, errored: 0 };
const unresolvedList = [];
const erroredList = [];

for (let si = 0; si < sections.length; si++) {
  const section = sections[si];

  const secIns = await sb
    .from('watchlist_sections')
    .insert({ user_id: clerkUserId, name: section.name, sort_order: si })
    .select('id')
    .single();
  if (secIns.error) fail(`Failed inserting section "${section.name}": ${secIns.error.message}`);
  const sectionId = secIns.data.id;

  console.log(`\n▸ ${section.name}  (role=${section.role}, ${section.items.length} symbols)`);

  for (let ii = 0; ii < section.items.length; ii++) {
    const item = section.items[ii];
    const r = await resolveSymbol({
      displaySymbol: item.displaySymbol,
      assetClass: item.assetClass,
      fmpKey,
    });

    if (r.error) {
      summary.errored += 1;
      erroredList.push(`${item.raw} → ${r.error}`);
    } else if (r.resolved) {
      summary.resolved += 1;
    } else {
      summary.unresolved += 1;
      unresolvedList.push(`${item.raw} → ${r.note || 'unresolved'}`);
    }

    const row = {
      user_id: clerkUserId,
      section_id: sectionId,
      display_symbol: item.displaySymbol,
      provider_symbol: r.providerSymbol,           // null when unresolved — never guessed
      asset_class: item.assetClass,
      exchange: r.resolved ? r.exchange : (item.tvExchange || null),
      resolved: r.resolved,
      role: section.role,
      origin: 'manual',
      sort_order: ii,
    };

    const itemIns = await sb.from('watchlist_items').insert(row);
    if (itemIns.error) fail(`Failed inserting item ${item.raw}: ${itemIns.error.message}`);

    const mark = r.error ? '⚠' : (r.resolved ? '✓' : '·');
    const detail = r.resolved
      ? `→ ${r.providerSymbol} (${r.exchange})`
      : `→ ${r.error || r.note}`;
    console.log(`   ${mark} ${item.displaySymbol.padEnd(10)} ${detail}`);
  }
}

console.log('\n─────────────────────────────────────────────');
console.log(`Resolved:   ${summary.resolved}`);
console.log(`Unresolved: ${summary.unresolved}  (written resolved=false, provider_symbol=null)`);
console.log(`Errored:    ${summary.errored}  (resolution call failed — retry these)`);

if (unresolvedList.length) {
  console.log('\nUnresolved (no coverage on current plan — greyed in the UI):');
  for (const u of unresolvedList) console.log(`  · ${u}`);
}
if (erroredList.length) {
  console.log('\n⚠ Resolution errors — re-run to retry (rows written as unresolved for now):');
  for (const e of erroredList) console.log(`  ⚠ ${e}`);
}
console.log('');

// Non-zero exit if any resolution CALL failed, so a false "no coverage" is never
// silently accepted (spec §2: do not fail silently).
process.exit(summary.errored > 0 ? 2 : 0);
