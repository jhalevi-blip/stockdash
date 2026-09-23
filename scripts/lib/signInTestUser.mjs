// Reusable helper: sign the DEV test user into localhost in a REAL Chrome and hand
// back the authenticated { browser, page } so verification scripts can drive the app.
//
//   import { signInTestUser } from './lib/signInTestUser.mjs';
//   const { browser, page } = await signInTestUser();       // headless by default
//   ... use page ...
//   await browser.close();
//
// Run directly for a smoke test:
//   node --env-file=.env.local scripts/lib/signInTestUser.mjs [--headed]
//
// HOW IT SIGNS IN
// ---------------
// It mints a short-lived Clerk **sign-in token** with the DEV secret key and has
// ClerkJS consume it in the page (strategy:'ticket'), then setActive(). This is the
// robust automation path: no password typed, no email OTP, no brittle form DOM, and
// it is immune to Clerk's brute-force throttling on the password factor.
//
// Why not email + password in the browser? Every fresh browser profile is a "new
// device", so Clerk demands an email verification code as a *second* factor on top
// of the password — password alone can never complete headlessly. The password is
// still set on the account (create-test-user.mjs) for manual human login; automation
// uses the token instead. The user id comes from TEST_USER_ID in .env.local
// (gitignored). Refuses to run against a LIVE Clerk instance (see devGuard.mjs).

import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { createClerkClient } from '@clerk/backend';
import { assertDevEnv } from './devGuard.mjs';

const CHROME = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => p && fs.existsSync(p));

/**
 * @param {object} [opts]
 * @param {boolean} [opts.headless=true]
 * @param {string}  [opts.baseUrl='http://localhost:3000']
 * @param {number}  [opts.timeout=30000]
 * @param {string}  [opts.userId] Clerk user id to sign in as. Defaults to TEST_USER_ID
 *                  (the seeded user). Pass TEST_EMPTY_USER_ID to drive the fresh-user flow.
 * @returns {Promise<{ browser: import('puppeteer-core').Browser, page: import('puppeteer-core').Page }>}
 */
export async function signInTestUser({ headless = true, baseUrl = 'http://localhost:3000', timeout = 30000, userId } = {}) {
  assertDevEnv({ supabase: false, clerk: true });

  userId = userId || process.env.TEST_USER_ID;
  if (!userId) throw new Error('No user id — pass { userId } or set TEST_USER_ID (run scripts/create-test-user.mjs).');
  if (!CHROME) throw new Error('Could not find Chrome. Set PUPPETEER_EXECUTABLE_PATH to your chrome.exe.');

  // 1) Mint a short-lived sign-in token for the test user (DEV secret key).
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const { token } = await clerk.signInTokens.createSignInToken({ userId, expiresInSeconds: 600 });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-first-run', '--no-default-browser-check'],
  });

  try {
    const page = await browser.newPage();
    // 2) Load the app so ClerkJS initialises, then consume the ticket in-page.
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout });
    await page.waitForFunction(() => window.Clerk && window.Clerk.loaded, { timeout });

    const result = await page.evaluate(async (tok) => {
      try {
        const si = await window.Clerk.client.signIn.create({ strategy: 'ticket', ticket: tok });
        if (si.status !== 'complete') return { ok: false, err: `sign-in status ${si.status}` };
        await window.Clerk.setActive({ session: si.createdSessionId });
        return { ok: true };
      } catch (e) {
        return { ok: false, err: e?.errors?.[0]?.message || e?.message || 'ticket sign-in failed' };
      }
    }, token);

    if (!result.ok) throw new Error(`Clerk ticket sign-in failed: ${result.err}`);

    // 3) Confirm an authenticated ClerkJS session before handing the page back.
    await page.waitForFunction(() => !!(window.Clerk && window.Clerk.user), { timeout });
    return { browser, page };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

// ── Direct run: smoke test ───────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const headed = process.argv.includes('--headed');
  const { browser, page } = await signInTestUser({ headless: !headed });
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle2' });
  console.log('✓ Signed in. URL:', page.url());
  await browser.close();
}
