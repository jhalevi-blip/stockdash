@AGENTS.md

# AI model IDs

All Claude model IDs live in `lib/aiModels.js` (`CLAUDE_MODELS`). Import from there — never hardcode a model string in a route (a retired ID returns a hard 404 and silently breaks the feature; that is how the /research quick-action chips broke).

Tiers:
- `flagship` — deep analysis (theses, portfolio/stock summaries, theme classification).
- `quick` — the /research quick-action chips (`app/api/stock-quick-action`). **Deliberately Sonnet, not Opus, for cost:** these are short (`max_tokens ~400`), highest-volume, and fireable by anonymous visitors, so Opus here is the single biggest cost exposure on the site.
- `fast` — cheap classification / preview tasks.

⚠️ A blanket "upgrade everything to the newest Opus" must NOT touch `quick`. Bumping `flagship` is fine; re-inflating `quick` to an Opus tier is a deliberate cost decision that needs sign-off.

# Performance page — cashEvents caveat

`cashEvents` (from the broker parsers / `portfolio_transactions.data`) does **NOT** reconcile to a cash balance for multi-currency DeGiro accounts (non-EUR rows are skipped upstream in `lib/brokers/degiro.ts`) — verified Aug 2026, Σ €124,007 vs actual €876. Do **not** use it as a cash-balance source. Use the `deposits` array for external flows and `currentCash` for the terminal balance. The shares ledger (`tradeLegs`) IS exact and reconciles to current holdings; build `/performance` reconstruction on tradeLegs + deposits + currentCash.

# Verifying signed-in behaviour

Signed-in pages (dashboard, /performance, /research, watchlist) **must** be verified on localhost with the dev test user — do **not** skip a signed-in change as "not reproducible locally". There is a dedicated dev Clerk test user with a re-keyed copy of real holdings + watchlist for exactly this.

```
node --env-file=.env.local scripts/create-test-user.mjs        # once: creates the +clerk_test user, writes TEST_USER_* to .env.local
node --env-file=.env.local scripts/seed-test-user.mjs --replace # re-runnable: seeds holdings/transactions/watchlist
node --env-file=.env.local scripts/verify-test-user-dashboard.mjs   # signs in (npm run dev must be running) and screenshots the dashboard
```

For your own verification script, import the sign-in helper — it returns an authenticated real-Chrome page:

```js
import { signInTestUser } from './scripts/lib/signInTestUser.mjs';
const { browser, page } = await signInTestUser();   // headless by default; { headless: false } to watch
```

These scripts are **dev-only and guarded**: `scripts/lib/devGuard.mjs` aborts unless the env is the dev Supabase project + `pk_test`/`sk_test` Clerk, so they can never touch production. Credentials live in `.env.local` (gitignored) only. The helper signs in via a backend-minted Clerk sign-in token (`strategy:'ticket'`), because Clerk gates the email+password form behind a new-device email code on every fresh browser profile.

## Signed-in smoke test — required before every merge

`scripts/smoke-signed-in.mjs` signs in as the dev test user and visits every signed-in page (imported from the app's own `NAV_ITEMS`), recording console errors, non-2xx requests to our `/api` routes, visible error copy, and a screenshot per page (→ gitignored `.smoke-artifacts/`). It exits non-zero on any failure.

```
npm run dev &                                                        # must be running
node --env-file=.env.local scripts/smoke-signed-in.mjs               # seeded USD user
# Then the EU/DeGiro user: verify-import-journey runs every fixture present in
# .scratch/fixtures/ end-to-end and leaves the empty user holding the LAST one (DeGiro:
# ASML/SHEL/ADYEN/NVDA + the unresolved IWDA ISIN). Run it as-is — it self-paces: a fresh
# browser per fixture (no localStorage carryover) and a ~65s wait for the 60/min limiter
# window between fixtures, with any /api 429 auto-retried once as a test artifact. No
# moving fixtures aside or manual waits; two fixtures just take ~1 min longer.
node --env-file=.env.local scripts/verify-import-journey.mjs         # all fixtures → empty user ends on DeGiro
node --env-file=.env.local scripts/smoke-signed-in.mjs --user empty  # EU/DeGiro user (mixed currencies + unresolved ISIN)
```

**Both smoke runs must pass (exit 0) before any PR is merged** — the seeded USD user AND `--user empty` (the EU/DeGiro portfolio: EUR/GBX/no-price positions and an unresolved-ISIN "no price" position). A position keyed by an ISIN instead of a ticker must be skipped / shown as unavailable by any page or API that expects a ticker — never error. If a change introduces a page failure, call it out and justify it in the PR — do not merge past a red without an explanation. The test deliberately does **not** fail on `net::ERR_ABORTED` (intentional stale-fetch cancellation) or on the shared 60 req/min-per-IP limiter in `middleware.js` (it paces under the budget and retries once after a window reset).

# Scratch / temporary files

Temporary files — PR payload JSON, one-off debug scripts, ad-hoc screenshots — go in the gitignored `.scratch/` folder, **never** the project root (root-level scratch keeps leaking into `git status`). `.scratch/`, `.smoke-artifacts/`, and the dev-test-user artifacts are already in `.gitignore`. Clean up after yourself regardless.
