// Create (or reuse) a SECOND dev test user that is deliberately EMPTY — no seeded
// portfolio — so the brand-new-user import journey can be verified from scratch.
// Separate identity from the seeded test user (create-test-user.mjs).
//
//   node --env-file=.env.local scripts/create-empty-test-user.mjs
//
// - `+clerk_test` email → no verification email; deterministic password login.
// - Idempotent: reuse if it exists, (re)set the password to the .env.local value.
// - Writes TEST_EMPTY_USER_EMAIL / _PASSWORD / _ID into .env.local (gitignored).
//
// DEV Clerk only — refuses to run against a LIVE instance (scripts/lib/devGuard.mjs).

import fs from 'fs';
import crypto from 'crypto';
import { createClerkClient } from '@clerk/backend';
import { assertDevEnv } from './lib/devGuard.mjs';

assertDevEnv({ supabase: false, clerk: true });

const ENV_PATH = '.env.local';
const EMAIL = process.env.TEST_EMPTY_USER_EMAIL || 'stockdash-empty+clerk_test@example.com';
if (!EMAIL.includes('+clerk_test')) {
  console.error(`\n✖ TEST_EMPTY_USER_EMAIL must be a Clerk test address (contain "+clerk_test"). Got: ${EMAIL}\n`);
  process.exit(1);
}
const PASSWORD = process.env.TEST_EMPTY_USER_PASSWORD || `Te-${crypto.randomBytes(18).toString('base64url')}`;

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

function upsertEnvLocal(pairs) {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const hadTrailingNl = text.length === 0 || text.endsWith('\n');
  for (const [key, value] of Object.entries(pairs)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, line);
    else { if (!text.endsWith('\n') && text.length) text += '\n'; text += `${line}\n`; }
  }
  if (hadTrailingNl && !text.endsWith('\n')) text += '\n';
  fs.writeFileSync(ENV_PATH, text);
}

async function findByEmail(email) {
  const res = await clerk.users.getUserList({ emailAddress: [email] });
  const list = Array.isArray(res) ? res : (res?.data ?? []);
  return list[0] || null;
}

const existing = await findByEmail(EMAIL);
let user;
if (existing) {
  console.log(`• Empty test user already exists: ${existing.id} (${EMAIL}) — resetting password.`);
  user = await clerk.users.updateUser(existing.id, { password: PASSWORD, skipPasswordChecks: true });
} else {
  console.log(`• Creating empty test user ${EMAIL} in DEV Clerk…`);
  user = await clerk.users.createUser({
    emailAddress: [EMAIL], password: PASSWORD,
    firstName: 'Stockdash', lastName: 'EmptyAgent', skipPasswordChecks: true,
  });
  console.log(`  ✓ created ${user.id}`);
}

upsertEnvLocal({
  TEST_EMPTY_USER_EMAIL: EMAIL,
  TEST_EMPTY_USER_PASSWORD: PASSWORD,
  TEST_EMPTY_USER_ID: user.id,
});

console.log(`\n✓ Empty test user ready.`);
console.log(`  TEST_EMPTY_USER_ID=${user.id}`);
console.log(`  (password written to ${ENV_PATH}, gitignored)`);
console.log(`\nReset it to empty at any time: node --env-file=.env.local scripts/reset-empty-test-user.mjs\n`);
