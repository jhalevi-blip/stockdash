// Test harness for the Gate 3 theme-extraction route logic.
//
// Runs the SAME core the API route runs (lib/themeExtract.js) directly against
// your Supabase, bypassing Clerk auth and the 5/hour rate limit so you can
// iterate on the prompt freely. Pretty-prints each reconciled theme and a diff
// vs. the pre-call state (unchanged / renamed / version-bumped / retired /
// reactivated / new).
//
// Run:
//   node --env-file=.env.local scripts/test-theme-extract.mjs            # writes
//   node --env-file=.env.local scripts/test-theme-extract.mjs --dry      # no write
//   node --env-file=.env.local scripts/test-theme-extract.mjs --user=user_123
//
// User resolution: --user=<id>, else THEME_EXTRACT_USER_ID, else the single
// user_id found in user_settings (errors if there are several).

import { createClient } from '@supabase/supabase-js';
import { extractThemesForUser } from '../lib/themeExtract.js';

const argUser = process.argv.find(a => a.startsWith('--user='))?.slice('--user='.length);
const DRY = process.argv.includes('--dry');
const VERBOSE = process.argv.includes('--verbose');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const apiKey = process.env.ANTHROPIC_API_KEY;

function die(msg) { console.error(`\n✗ ${msg}\n`); process.exit(1); }

if (!url || !key) die('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY missing (run with --env-file=.env.local).');
if (!apiKey) die('ANTHROPIC_API_KEY missing (run with --env-file=.env.local).');

const sb = createClient(url, key);

async function resolveUserId() {
  if (argUser) return argUser;
  if (process.env.THEME_EXTRACT_USER_ID) return process.env.THEME_EXTRACT_USER_ID;
  const { data, error } = await sb.from('user_settings').select('user_id');
  if (error) die(`could not read user_settings: ${error.message}`);
  const ids = [...new Set((data ?? []).map(r => r.user_id))];
  if (ids.length === 1) return ids[0];
  if (ids.length === 0) die('no rows in user_settings — save a worldview first, or pass --user=<id>.');
  die(`multiple users in user_settings; pass --user=<id>. Found:\n  ${ids.join('\n  ')}`);
}

function classify(t, beforeById) {
  const b = beforeById.get(t.theme_id);
  if (!b) return 'NEW';
  if (b.status === 'active'  && t.status === 'retired') return 'RETIRED';
  if (b.status === 'retired' && t.status === 'active')  return 'REACTIVATED';
  if (t.version > b.version) return 'VERSION-BUMPED';
  if (t.name !== b.name) return 'RENAMED';
  if (t.description !== b.description || t.guidance !== b.guidance) return 'EDITED';
  if (t.priority !== b.priority) return 'REORDERED';
  return 'UNCHANGED';
}

const pad = (s, n) => String(s).padEnd(n).slice(0, n);

async function main() {
  const userId = await resolveUserId();
  console.log(`\n=== theme-extract test harness ===`);
  console.log(`user: ${userId}${DRY ? '   (DRY RUN — no write)' : ''}\n`);

  let result;
  try {
    result = await extractThemesForUser(sb, userId, { apiKey, dryRun: DRY });
  } catch (e) {
    if (e?.code === 'validation_failed') die(`VALIDATION FAILED: ${e.message}\n(raw model output was logged above)`);
    if (e?.code === 'no_worldview')      die(`NO WORLDVIEW: ${e.message}`);
    if (e?.code === 'generation_failed') die(`GENERATION FAILED: ${e.message}`);
    die(`ERROR${e?.code ? ` [${e.code}]` : ''}: ${e?.message ?? e}`);
  }

  const { worldview, before, reconciled } = result;
  console.log(`worldview:\n  "${worldview}"\n`);

  const beforeById = new Map(before.map(t => [t.theme_id, t]));

  // Sort: active first (by priority), then retired (by priority).
  const ordered = reconciled.slice().sort((a, b) =>
    (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1) ||
    a.priority - b.priority ||
    a.theme_id.localeCompare(b.theme_id),
  );

  console.log(`${pad('DIFF', 14)} ${pad('STATUS', 8)} ${pad('SRC', 10)} ${pad('THEME_ID', 20)} ${pad('NAME', 26)} ${pad('VER', 4)} PRIO`);
  console.log('-'.repeat(96));
  const counts = {};
  for (const t of ordered) {
    const diff = classify(t, beforeById);
    counts[diff] = (counts[diff] ?? 0) + 1;
    console.log(`${pad(diff, 14)} ${pad(t.status, 8)} ${pad(t.source, 10)} ${pad(t.theme_id, 20)} ${pad(t.name, 26)} ${pad('v' + t.version, 4)} ${t.priority}`);
  }

  // Any existing id missing from the response would be a bug (validation blocks it).
  const returnedIds = new Set(reconciled.map(t => t.theme_id));
  const dropped = before.filter(b => !returnedIds.has(b.theme_id)).map(b => b.theme_id);
  if (dropped.length) console.log(`\n⚠ DROPPED (should never happen): ${dropped.join(', ')}`);

  const activeCount = reconciled.filter(t => t.status === 'active').length;
  console.log('-'.repeat(96));
  console.log(`summary: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log(`active themes: ${activeCount}   total rows: ${reconciled.length}   ${DRY ? '(not persisted)' : '(persisted)'}`);

  if (VERBOSE) {
    console.log(`\n=== full text ===`);
    for (const t of ordered) {
      const b = beforeById.get(t.theme_id);
      console.log(`\n[${classify(t, beforeById)}] ${t.theme_id} — ${t.name}  (${t.status}, src=${t.source}, v${t.version}, p${t.priority})`);
      console.log(`  description: ${t.description}`);
      if (b && b.description !== t.description) console.log(`     was: ${b.description}`);
      console.log(`  guidance:    ${t.guidance}`);
      if (b && b.guidance !== t.guidance) console.log(`     was: ${b.guidance}`);
    }
  }
  console.log('');
}

main().catch(e => die(e?.stack ?? String(e)));
