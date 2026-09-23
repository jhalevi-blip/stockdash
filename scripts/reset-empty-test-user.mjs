// Reset the empty dev test user back to a truly EMPTY state by deleting all of its
// rows across the user-scoped tables. Re-runnable; run before each import-journey
// verification so it always starts from a blank portfolio.
//
//   node --env-file=.env.local scripts/reset-empty-test-user.mjs
//
// DEV Supabase only — refuses to run against production (scripts/lib/devGuard.mjs).

import { getSupabaseAdmin } from '../lib/supabase.js';
import { assertDevEnv } from './lib/devGuard.mjs';

assertDevEnv({ supabase: true, clerk: false });

const TARGET = process.env.TEST_EMPTY_USER_ID;
function fail(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }

if (!TARGET) fail('TEST_EMPTY_USER_ID not set — run create-empty-test-user.mjs first.');
if (!TARGET.startsWith('user_')) fail(`TEST_EMPTY_USER_ID does not look like a Clerk id: ${TARGET}`);
// Guard against nuking the seeded user by mistake.
if (TARGET === process.env.TEST_USER_ID) fail('TEST_EMPTY_USER_ID equals TEST_USER_ID (the seeded user) — refusing.');

const sb = getSupabaseAdmin();
if (!sb) fail('Supabase admin client not configured.');

console.log(`Resetting empty test user to blank: ${TARGET}`);
// watchlist_items before sections (FK), then the single-row tables.
for (const t of ['watchlist_items', 'watchlist_sections', 'portfolios', 'portfolio_transactions']) {
  const { error, count } = await sb.from(t).delete({ count: 'exact' }).eq('user_id', TARGET);
  if (error) fail(`clearing ${t}: ${error.message}`);
  console.log(`  ✓ ${t}: ${count ?? 0} row(s) removed`);
}
console.log('\n✓ Empty test user is blank.\n');
