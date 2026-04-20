# StockDashes — End-of-Session Summary (April 20, 2026, afternoon)

## Product Context
StockDashes (stockdashes.com) — free stock research + portfolio tracking platform for retail investors. Solo-dev by Jonathan (Netherlands). Built on Next.js App Router, deployed on Vercel (project `stockdash-app`, Hobby plan). Stack: Clerk auth, Supabase (JSONB `portfolios` table + row-per-ticker `holdings` table), Finnhub/Yahoo/FMP Starter APIs. Code at `C:\Users\jhale\stockdash`. Dev workflow: Claude Code in PowerShell.

**Original goal this session:** start GTM planning (€3–5k over 3 months). Goal was diverted by discovery of two critical bugs that blocked any paid acquisition.

## What Got Accomplished

Two production bugs identified, diagnosed, fixed, shipped, and verified. Both were found by running Path 1 of the test plan from yesterday's session and hitting a failure that revealed the second, deeper issue.

### Bug 1 — localStorage ownership race on sign-in (commit 65d5269)

**Symptom:** Brand-new Clerk signup showed stale AMD placeholder `{c:1, s:1, t:"AMD"}` on the dashboard without the user ever saving a portfolio.

**Root cause:** `fetchDashboard` captured stale localStorage into a closure at mount, re-wrote it under `'anonymous'` ownership at T2 when the first API response returned, then at T4 promoted that re-written cache to a trusted scoped key stamped with the real Clerk userId. NavBar's sign-in clear at T1 fired correctly but was undone by the in-flight `fetchDashboard` fetch that had captured the polluted localStorage before the clear.

**Fix:**
- `localIsValid` tightened to `cacheOwner === userId && !!userId` — `'anonymous'` is no longer trusted
- `fetchDashboard` re-reads localStorage inside `.then()` instead of at function-start, eliminating the stale closure
- `saveUserHoldings` guards: refuses to write when `userId` is null, `'anonymous'`, or `'demo'`
- NavBar sign-in effect now uses `migrateIfNeeded` as canonical migration path (was dead code, now wired)
- One-shot cleanup in NavBar matches exact `[{"c":1,"s":1,"t":"AMD"}]` JSON string and clears it when Supabase is empty
- `getDemoTickers()` in `lib/startDemo.js` now only reads unscoped cache when `owner === 'demo'`
- 13 files that read `stockdash_holdings` directly marked with TODO comments for future consolidation

Commit message: `fix(auth): eliminate anonymous-cache race in sign-in flow; consolidate migration through migrateIfNeeded (closes ghost-AMD bug)`

### Bug 2 — Vercel edge-cache auth-data leak (commit d6f4238)

**Symptom:** After Bug 1's fix deployed, Path 1 test with test20 still failed — the dashboard showed Jonathan's full 12-position portfolio ($395k, AMD/ETOR/SOFI/AMZN/etc.) to a brand-new Clerk account that had never saved anything.

**Root cause:** `/api/portfolio` was being edge-cached by Vercel (`x-vercel-cache: HIT`, `age: 2814`, `cache-control: s-maxage=14400, stale-while-revalidate=3600`). Jonathan's authenticated response was cached at the edge under the route's URL and served to every subsequent request for up to 4 hours, regardless of who was signed in. The route was missing `export const dynamic = 'force-dynamic'`.

**Fix applied to 3 files:**
- `app/api/portfolio/route.ts`: added `dynamic = 'force-dynamic'`, `revalidate = 0`, `fetchCache = 'force-no-store'`
- `app/api/holdings/route.js`: same three directives (also user-scoped via Clerk auth)
- `app/api/financials/route.js`: cleaned up dead `revalidate = 86400` (was already overridden by force-dynamic)

**Blast radius:** Zero real users affected. Microsoft Clarity confirmed only one non-Jonathan session in the 4-hour cache window (US / Chrome / PC), and that session never navigated to `/dashboard`, so it never triggered the cached route.

**Full route audit:** All 24 routes in `app/api/` reviewed. User-scoped routes now all protected. Ticker-scoped routes (`research`, `institutional`, `short-interest`, `peers`, `chart`, `macro`, `financials`) intentionally retain edge caching for FMP/Finnhub quota savings. `transactions` is POST-only and unaffected.

Commit message: `fix(api): close edge-cache auth leak on /api/portfolio and /api/holdings`

## Final Verified State (end of session)

- Edge-cache bug closed: `/api/portfolio` now returns `{signedIn: true, holdings: []}` for test20 (correct — test20 has no Supabase row). Response headers show no `x-vercel-cache: HIT`.
- localStorage race fix holds: after clearing test20's polluted localStorage, dashboard renders welcome card correctly.
- Clean-browser signup flow not yet verified end-to-end — deferred to tomorrow's fresh test with test21.

## Known Open Items

**Technical debt (non-urgent, for consolidation pass later this week):**
- Dual-table architecture still unresolved (`portfolios` JSONB vs `holdings` row-per-ticker). Both exist, new saves go to `portfolios`, `holdings` has stale data. Decide authoritative and consolidate.
- Dashboard trusts localStorage over API response when they disagree. Means existing polluted browsers won't self-heal unless the exact-match AMD cleanup branch catches them. For new clean browsers this is fine; for legacy polluted browsers it requires user-initiated clear.
- 13 files in `app/` read `stockdash_holdings` unscoped — all bypass ownership checks. Marked with TODO comments in this session. Needs consolidation behind a single ownership-aware getter.
- Cache policy is opt-in on a per-route basis. Error-prone. Consider middleware that defaults all `/api/*` routes requiring auth to `cache-control: private, no-store`. One source of truth.
- Brief flash of ghost data possible on legacy polluted browsers for ~200ms before Clerk resolves. Low-severity but a credibility concern for a privacy-positioned product. Gate initial render on Clerk-loaded state.
- Clerk `user.deleted` webhook still not implemented (cascade-delete Supabase rows on account deletion).

**Cleanup:**
- Delete test13–test20 Clerk accounts and any Supabase rows for them.

## Key Learnings & Meta-Lessons

- **"Data first, diagnosis second, fix third" caught real bugs today.** The first plausible-sounding diagnosis ("test browser has stale pre-fix data — just clear localStorage") was wrong because it couldn't explain test19 (a userId that didn't exist during the pre-fix era). The second ("email alias fallback in `/api/portfolio`") was wrong because the route code was clean. Only after the network tab showed `x-vercel-cache: HIT` on a 664 B response did the actual cause become visible.
- **When two bugs interact, fixing one can hide the other.** The localStorage race was real. The fix was correct. But the edge-cache bug was also active, and because the edge-cache was polluting localStorage upstream, the localStorage fix appeared to work in isolation but couldn't be verified end-to-end until Path 1 exposed the deeper issue. A passing unit-level fix is not a passing system-level fix. Running the full test plan even when a fix "obviously worked" is what caught the second bug.
- **Auth + edge caching is a structural hazard.** Next.js App Router routes are edge-cacheable by default unless opted out. Every user-scoped route that forgets `force-dynamic` is a latent auth-data leak. This can't be solved by "remembering to add the directive" — it needs to be defaulted at the framework boundary (middleware) or audited programmatically.
- **localStorage is untrusted state by default; ownership is proven, not assumed.** `'anonymous'` ownership tags are not a trust signal — they're the definition of untrusted. The right model: reject any localStorage that doesn't have a positive ownership proof matching the currently authenticated user.
- **The test browser methodology (`jhalevi+stockdashtestNN@gmail.com`) tests a different code path than real users take** because Gmail `+` aliases resolve to the same inbox. Worth considering whether any future bug hunts should use entirely separate email domains to match real user conditions.

## Tomorrow's Agenda (in order)

1. Verify Path 1 in a truly clean incognito + fresh test21 account. Expected to pass on the first try now that both fixes compose.
2. Paths 2–5 if Path 1 passes. Pass/fail report only, no screenshots unless something breaks.
3. Review Microsoft Clarity recordings for friction signal.
4. Return with three inputs to build the GTM plan:
   - **Clarity friction observation** (landing bounce / demo→signup drop / post-signup activation)
   - **Strongest owned channel** (Reddit / Twitter-X / LinkedIn / starting cold)
   - **Actual deployable budget** from the €3–5k (what can realistically be spent over 90 days, not aspirational)
5. Build GTM plan from those three data points. Start execution same day.

## File Locations (for next session context)

- Main code: `C:\Users\jhale\stockdash`
- Clerk auth pages: `app/sign-in/[[...sign-in]]/page.jsx`, `app/sign-up/[[...sign-up]]/page.jsx`
- Save path: `components/NavBar.jsx` (savePortfolio function, sign-in useEffect)
- Read path: `app/dashboard/page.jsx` (fetchDashboard function)
- Ownership keys: `lib/holdingsStorage.js`
- Demo logic: `lib/startDemo.js`
- API routes: `app/api/*/route.{js,ts}` — full audit in commit d6f4238
- Latest commits (newest first):
  - `d6f4238` — edge-cache fix
  - `65d5269` — localStorage race fix
  - `72c647a` — ownership key (April 19)
