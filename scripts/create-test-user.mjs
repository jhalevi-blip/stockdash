// Create (or reuse) the automated test user in the DEV Clerk instance ONLY.
//
//   node --env-file=.env.local scripts/create-test-user.mjs
//
// - Uses a Clerk `+clerk_test` email → no verification email is ever sent and it
//   can be verified with the fixed dev code 424242 (we use a password instead).
// - Idempotent: if the user already exists it is reused; the password is (re)set
//   to the one in .env.local so browser sign-in is always deterministic.
// - Writes TEST_USER_EMAIL / TEST_USER_PASSWORD / TEST_USER_ID back into
//   .env.local (which is gitignored) so nothing lands in git.
//
// Refuses to run against a LIVE Clerk instance (see scripts/lib/devGuard.mjs).

import fs from 'fs';
import crypto from 'crypto';
import { createClerkClient } from '@clerk/backend';
import { assertDevEnv } from './lib/devGuard.mjs';

assertDevEnv({ supabase: false, clerk: true });

const ENV_PATH = '.env.local';
const EMAIL = process.env.TEST_USER_EMAIL || 'stockdash-agent+clerk_test@example.com';
if (!EMAIL.includes('+clerk_test')) {
  console.error(`\n✖ TEST_USER_EMAIL must be a Clerk test address (contain "+clerk_test"). Got: ${EMAIL}\n`);
  process.exit(1);
}
// Reuse an existing password so re-runs stay deterministic; else generate one.
const PASSWORD = process.env.TEST_USER_PASSWORD || `Td-${crypto.randomBytes(18).toString('base64url')}`;

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

/** Upsert `KEY=value` lines into .env.local, preserving everything else. */
function upsertEnvLocal(pairs) {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const hasTrailingNl = text.length === 0 || text.endsWith('\n');
  for (const [key, value] of Object.entries(pairs)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(text)) {
      text = text.replace(re, line);
    } else {
      if (!text.endsWith('\n') && text.length) text += '\n';
      text += `${line}\n`;
    }
  }
  if (hasTrailingNl && !text.endsWith('\n')) text += '\n';
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
  console.log(`• Test user already exists: ${existing.id} (${EMAIL}) — resetting password.`);
  user = await clerk.users.updateUser(existing.id, { password: PASSWORD, skipPasswordChecks: true });
} else {
  console.log(`• Creating test user ${EMAIL} in DEV Clerk…`);
  user = await clerk.users.createUser({
    emailAddress: [EMAIL],
    password: PASSWORD,
    firstName: 'Stockdash',
    lastName: 'TestAgent',
    skipPasswordChecks: true,
    skipPasswordRequirement: false,
  });
  console.log(`  ✓ created ${user.id}`);
}

upsertEnvLocal({
  TEST_USER_EMAIL: EMAIL,
  TEST_USER_PASSWORD: PASSWORD,
  TEST_USER_ID: user.id,
});

console.log(`\n✓ Test user ready.`);
console.log(`  TEST_USER_ID=${user.id}`);
console.log(`  TEST_USER_EMAIL=${EMAIL}`);
console.log(`  (password written to ${ENV_PATH}, which is gitignored)\n`);
console.log(`Next: node --env-file=.env.local scripts/seed-test-user.mjs --replace\n`);
