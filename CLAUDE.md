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
