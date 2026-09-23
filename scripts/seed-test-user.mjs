// Seed the DEV test user with a re-keyed copy of the source dev user's data.
//
//   node --env-file=.env.local scripts/seed-test-user.mjs [--replace]
//
// Source  = SEED_SOURCE_USER_ID (defaults to the re-keyed dev account that already
//           mirrors production holdings + watchlist as of 2026-09-18).
// Target  = TEST_USER_ID (the automated test user; created by create-test-user.mjs).
//
// Copies, re-keyed to the target user_id:
//   • portfolios              (holdings jsonb + settings)   → dashboard holdings + hero chart
//   • portfolio_transactions  (data jsonb: tradeLegs, …)    → /performance
//   • watchlist_sections + watchlist_items                  → /watchlist
//
// Re-runnable. With --replace it first clears the target's rows, so the seed can be
// reset at any time. Never reads or writes production (see scripts/lib/devGuard.mjs).

import { getSupabaseAdmin } from '../lib/supabase.js';
import { assertDevEnv } from './lib/devGuard.mjs';

assertDevEnv({ supabase: true, clerk: false });

const SOURCE = process.env.SEED_SOURCE_USER_ID || 'user_3BkfTyibtC3w4zkFLAnj7i9JJ1m';
const TARGET = process.env.TEST_USER_ID;
const replace = process.argv.includes('--replace');

function fail(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }

if (!TARGET) fail('TEST_USER_ID is not set — run create-test-user.mjs first (writes it to .env.local).');
if (!TARGET.startsWith('user_')) fail(`TEST_USER_ID does not look like a Clerk id: ${TARGET}`);
if (TARGET === SOURCE) fail('TEST_USER_ID equals the source user — refusing to overwrite the source account.');

const sb = getSupabaseAdmin();
if (!sb) fail('Supabase admin client not configured.');

async function pick(table, cols) {
  const { data, error } = await sb.from(table).select(cols).eq('user_id', SOURCE);
  if (error) fail(`read ${table}: ${error.message}`);
  return data || [];
}

console.log(`Seeding DEV test user\n  source: ${SOURCE}\n  target: ${TARGET}\n`);

// ── optional reset ───────────────────────────────────────────────────────────
if (replace) {
  console.log('--replace: clearing target rows…');
  // items before sections (FK), then the single-row tables.
  for (const [t] of [['watchlist_items'], ['watchlist_sections'], ['portfolios'], ['portfolio_transactions']]) {
    const { error } = await sb.from(t).delete().eq('user_id', TARGET);
    if (error) fail(`clearing ${t}: ${error.message}`);
  }
}

// ── portfolios (holdings + settings) ─────────────────────────────────────────
{
  const rows = await pick('portfolios', 'holdings, settings');
  if (!rows.length) fail(`source has no portfolios row (${SOURCE}).`);
  const { holdings, settings } = rows[0];
  const { error } = await sb.from('portfolios').upsert({
    user_id: TARGET,
    holdings: holdings ?? [],
    settings: settings ?? {},
    updated_at: new Date().toISOString(),
  });
  if (error) fail(`write portfolios: ${error.message}`);
  const positions = (holdings || []).filter((h) => h?.t !== '__CASH__').length;
  const cash = (holdings || []).find((h) => h?.t === '__CASH__');
  console.log(`✓ portfolios: ${positions} position(s)${cash ? `, cash ${cash.amount} ${cash.currency}` : ''}`);
}

// ── portfolio_transactions (data blob) ───────────────────────────────────────
{
  const rows = await pick('portfolio_transactions', 'data');
  if (rows.length) {
    const { error } = await sb.from('portfolio_transactions').upsert({
      user_id: TARGET,
      data: rows[0].data ?? {},
      updated_at: new Date().toISOString(),
    });
    if (error) fail(`write portfolio_transactions: ${error.message}`);
    console.log('✓ portfolio_transactions: copied');
  } else {
    console.log('· portfolio_transactions: source has none, skipped');
  }
}

// ── watchlist (sections + items, remap section ids) ──────────────────────────
{
  const secs = await pick('watchlist_sections', 'id, name, sort_order, created_at');
  const idMap = new Map();
  for (const s of secs) {
    const { data, error } = await sb.from('watchlist_sections')
      .insert({ user_id: TARGET, name: s.name, sort_order: s.sort_order })
      .select('id').single();
    if (error) fail(`insert section "${s.name}": ${error.message}`);
    idMap.set(s.id, data.id);
  }

  const items = await pick('watchlist_items',
    'section_id, display_symbol, provider_symbol, asset_class, exchange, resolved, role, origin, target_price, theme_slug, thesis, screen_notes, sort_order');
  let n = 0;
  for (const it of items) {
    const { id: _drop, ...rest } = it; // id absent from select anyway; defensive
    const row = { ...rest, user_id: TARGET, section_id: it.section_id ? idMap.get(it.section_id) ?? null : null };
    const { error } = await sb.from('watchlist_items').insert(row);
    if (error) fail(`insert item ${it.display_symbol}: ${error.message}`);
    n++;
  }
  console.log(`✓ watchlist: ${secs.length} section(s), ${n} item(s)`);
}

console.log('\n✓ Seed complete.\n');
