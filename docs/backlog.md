# StockDashes Roadmap

_Last updated: 2026-07-10_

## Conventions

- Status: `[ ]` not started, `[~]` in progress, `[!]` blocked, `[x]` shipped this week
- Now = max 5 items, this week's focus
- Recently Shipped = last 14 days, prune older entries when updating
- SEO post ships weekly at ~2000 words. Current week's titled post lives in Now. Next 2-3 topics queued in Next.
- Update the "Last updated" date when you edit

---

## Critical bugs to investigate

**Save without Import silently saves stale state (BUG — UX trap)**

Discovered 2026-05-28. In PortfolioModal, after files are parsed the summary shows "12 positions ready" with an Import button. If the user clicks Save Portfolio before clicking Import, Save persists the previous editable-rows state (e.g. the old saved portfolio), not the parsed upload. The parsed data is displayed but never applied. This caused the polluted-row-persistence incident on 2026-05-28 where Jonathan saved old/wrong data believing the upload had been applied.

Fix options (choose one):
- **Option 1 — Auto-apply (cleanest UX):** when upload completes successfully, immediately replace editable rows — no Import click needed. Save always reflects what's displayed. Risk: accidental overwrite if user opened upload by mistake.
- **Option 2 — Block Save (safest):** disable Save Portfolio button while an upload is pending apply. Tooltip on hover: "Import 12 positions first." No ambiguity about state.
- **Option 3 — Confirm on conflict (most explicit):** if Save is clicked with a pending unapplied upload, modal prompts: "You have 12 uploaded positions not yet imported. Save current rows (discards upload) or Import first?" Adds friction but makes the two-state situation legible.

Recommended: Option 2. Minimal code change (add a `hasUnimportedUpload` flag to PortfolioModal, disable Save when true), zero ambiguity, no accidental-overwrite risk.

---

**Edit Portfolio modal — single-file upload only (FEATURE)**

The Edit Portfolio modal (PortfolioModal.jsx → UploadPanel) currently accepts one file at a time. The /performance page already supports multi-file batch upload via app/(v2)/performance/page.jsx (TransactionUpload component) — selects multiple files, sends as FormData batch to /api/transactions, server deduplicates by Order ID, runs FIFO, returns unified result.

Replicating the /performance pattern in the Edit Portfolio modal doesn't translate cleanly because the modal holds holdings (ticker + shares + avg cost), not raw transactions. There are no Order IDs to dedup on. If two files both contain AAPL, the current "append" mode produces two AAPL rows in the grid, not one summed position.

Three approaches considered:
- A: Add `multiple` to the input, parse sequentially, no aggregation. Duplicate tickers appear as separate rows. Simplest, fragile UX.
- B: Client-side ticker merge — sum shares, weighted-average ACP. No backend changes. Loses lot-level history.
- C: Collect all files first, parse all, merge at the end, then confirm. Same UX as /performance but client-side. Matches user mental model. Requires UploadPanel refactor to accept a file list rather than processing immediately on pick.

Recommended: C. Deferred to a dedicated session — not a tail-end fix.

User-visible symptom: someone with positions across two brokers (e.g., Saxo + DeGiro, Jonathan's actual setup) cannot upload both at once in the Edit Portfolio modal. They have to upload one, save, re-open, switch to append mode, upload the second.

---

**AI thesis cache can store non-array shape (HARDENING — root cause of fixed white-screen)**

Discovered 2026-06-18. The `/research` white-screen crash (fixed by commit `3257343`, an `Array.isArray` guard on `BulletList` at `app/(v2)/research/page.jsx:503`) was triggered by a cached per-ticker thesis (`research_thesis_<TICKER>` in localStorage) holding `bull`/`bear`/`risks` in a non-array shape. The render is now crash-safe, but the source still allows bad shapes to be written.

Fix: validate/coerce `bull`/`bear`/`risks` to arrays in the `/api/stock-ai-summary` response, and at the localStorage cache write (~`app/(v2)/research/page.jsx:583`), so bad data is never stored.

Priority: low — crash already prevented; this stops silently-empty bullet lists.

---

**Peer-median column always blank (BUG — param typo, cosmetic)**

`app/(v2)/research/page.jsx:1454` (ValuationMetricsCard) fetches `/api/peers?tickers=${ticker}`, but the route reads `ticker` (singular) → 400 → the "Peer Med." column is always empty. Fix: change `tickers=` to `ticker=`. One-line, cosmetic.

---

**PostHog distinct_id not reset on shared-device sign-out (PRIVACY/ANALYTICS HYGIENE)**

Parked from the H2 privacy work (commit `4ad6026`). On the public site, signing out via a full page reload skips the in-app sign-out handler, so PostHog keeps the prior user's `distinct_id` (`user_…`) instead of going anonymous — guest browsing gets attributed to the previous account, and the id lingers in a shared browser. Not a holdings leak.

Fix: have the guest-guard call `resetPostHog()` only when it detects a leftover `user_*` distinct_id (so normal anonymous guests aren't reset, avoiding analytics fragmentation).

Priority: low–medium.

---

## Now (this week)

- [ ] **Audit pass** — production smoke test, FMP/Anthropic usage check, Search Console indexing, PostHog D1/D7, backlog hygiene, code health, dev environment.
- [ ] **SEO post: "How Much of Your Portfolio Should Be in One Stock?"** — concentration deep-dive; pairs with the live correlation post; ~2000 words.
- [ ] **Option-guard mechanism unverified (observability)** — QBTS/15F27P2 and SOFI/21F28C15 leaked into holdings before commits 11db31c (Unicode-slash regex) and 14967f8 (same-day FIFO sort), then disappeared after both shipped — but we never proved which fix (or what combination) actually catches them. The Saxo file's option rows use ASCII U+002F, so the original `includes('/')` guard should have worked but didn't. Could regress on a different broker file. To verify: on the next upload, capture `_debugHoldingsTickers` (deployed at 549563b) from `/api/upload`'s Network response and confirm no `/`-containing tickers reach holdings. If options reappear, the diagnostic narrows the cause. Low priority — modal review surfaces any leak before save — but worth resolving for peace of mind. Cleanup note: the temporary `_debugHoldingsTickers` field (549563b) must be removed from `/api/upload`'s response in the Stage 1 cleanup commit alongside the other `_debug*` fields. **[AUDIT-CONFIRMED 2026-06-17 · M2]** the 2026-06-17 audit verified `_debug`, `_debugTrades`, `_debugMergedAvgCostEcho`, and `_debugHoldingsTickers` all ship in the live `/api/upload` response (`app/api/upload/route.ts:483-487`) — strip all of them here.

---

## Next (this month)

**SEO post queue:**
- SEO post: "Sector Diversification: How to Actually Diversify Your Portfolio" — companion to the correlation post; practical retail-investor angle
- SEO post: "What Is Beta in Stocks? (And Why It Matters Less Than You Think)" — myth-busting angle; accessible, broad search appeal

**Fixes and hygiene:**
- **~~`realized_pnl_${user.id}` sign-out lifecycle (Stage 2)~~ — RESOLVED** — Scoped realized data written to `localStorage.setItem(`realized_pnl_${user.id}`, ...)` on import; previously had no cleanup on sign-out and accumulated per userId key indefinitely. Verified fixed July 2, 2026 — `clearAllForeignData`'s preserve-list (`holdingsStorage.js:117-142`) does not preserve the `realized_pnl_*` prefix, so `GuestDataGuard`'s eager `clearAllForeignData()` on anonymous mount (`GuestDataGuard.jsx:16-18`) now wipes it on guest load, closing the shared-device concern.
- **Extract realized-summary helper into `lib/realizedSummary.js` (Stage 2)** — `best`/`worst`/`allRealized`/label computation currently duplicated between `UnifiedUpload.jsx` and `performance/page.jsx`. Too small to warrant extraction at 2 callers. Extract when a third consumer appears or when the computation grows (win-rate, median, `totalPnlSinceStart` on the card).
- **`totalPnlSinceStart` filters on `firstBuy`, not `lastSell` (Stage 2)** — `positionsSinceStart` keeps positions where `firstBuy >= startDate`, which drops any position bought before the window but sold within it. That realized P&L happened in the window but is excluded. The correct filter for a "realized since X" figure is `lastSell >= startDate` (realization date). Pre-existing; low impact until date-range filtering becomes a first-class feature.
- **Multi-currency cost basis (Stage 2 — mostly shipped)** — The user-facing gap is closed via a display-layer FX conversion: dashboard + performance aggregates render in EUR (USD ÷ live EUR/USD), and cash is folded into Total Portfolio Value; the holdings table's per-share price and per-position cost are intentionally left in USD. The simple USD÷live-FX approach vs exact per-trade Boekingsbedrag differed by only ~0.2%, deemed negligible. 0b1e059, 4251a2b. Remaining scope (low priority): carry a per-position `currency` field through `rows` state, `handleSave`, and `POST /api/portfolio` only if per-position native-currency display is ever wanted.
- **`parseNum` integer-only assumption (Stage 2)** — `parseNum` in `degiro.ts` strips all dots as Dutch thousand separators before parsing. Safe for integer share quantities (`'1.000'` → 1000). If fractional shares are ever supported, a string quantity `'1.5'` would misparse as 15 (dot stripped). The `koers`/price parse deliberately does NOT use `parseNum` for this reason. Revisit `parseNum`'s quantity path before adding fractional-share support.
- **Wire CookieHub → GA4 consent update** — GCM defaults to `denied` but `gtag('consent','update',...)` never fires when the user accepts. GA4 is stuck in cookieless/modelled mode for all sessions. Fix: add consent update call in the CookieHub callback block in `lib/posthog.js`. ~15 min. Also remove unused `@next/third-parties` from `package.json` in the same PR.
- **AMD empty data cards** — On the Stock Intel page for AMD specifically, valuation, short interest, and insider activity cards sometimes render empty even though data is available. Persists across full page refreshes (unlike the data-race fix shipped 2026-04-28, which was session-level). Noticed during QA 2026-04-28. ⚠️ Production bug on a named stock page — promote to Now if it recurs or affects other tickers.
- **Supabase schema migrations** — Document `portfolios` and `api_usage` table schemas as versioned `.sql` files in `db/migrations/`. Currently schemas exist only as comments in `app/api/portfolio/route.ts` and `lib/apiUsage.ts`. `portfolio_correlations` already done (migration 001).
- **Supabase pg_dump backups** — Set up monthly `pg_dump` of the Supabase database. Options: cron job on any always-on machine, GitHub Actions scheduled workflow, or Supabase PITR. Belt-and-suspenders against data loss and vendor risk.
- **Fix malformed Cache-Control on `/api/institutional`** — `stale-while-revalidate` has no value (invalid header). 5-min fix.
- **Retention diagnostic re-evaluate** — Check PostHog D1/D7/WAU around 2026-05-05 when there are 10+ days of capture data and signed-up users have enough tenure to show a signal.
- **Rotate 3 vendor keys flagged by Vercel** — RESEND_API_KEY, CLERK_SECRET_KEY (Production), FINNHUB_API_KEY are stored as plain (non-Sensitive) env vars. Rotate each at its source dashboard (Resend / Clerk / Finnhub), save new value in Vercel as Sensitive type, redeploy, verify dependent routes. Low urgency (single-operator Vercel account), flagged 2026-07-02.
- **Old Vercel preview domain indexed** — stockdash-app.vercel.app is indexed by search engines alongside stockdashes.com (duplicate content, splits any SEO signal). Fix: permanent redirect from *.vercel.app to stockdashes.com (Next.js middleware or vercel.json redirect on host match), or at minimum canonical tags. Flagged 2026-07-02.
- **~~Unquoted YAML dates in two blog posts~~ — RESOLVED** — degiro-export-guide.md:4 and degiro-real-return.md:4 had unquoted dates parsed as JS Date objects; app/blog/[slug]/opengraph-image.tsx:26 formatDate calls .split() on them → TypeError when the OG route ships. Fixed 2026-07-02 in 2cdebde (same commit as the OG system) — both dates quoted, verified rendering 200/image/png on the previously-broken route before ship.

**Performance (from 2026-07-08 session — see docs/perf-audit.md):**
- **Perf fix 5: SW app-shell caching** — add a `fetch` handler to `public/sw.js`: cache-first for immutable `/_next/static/*`, stale-while-revalidate for the app shell. Requires a versioned cache name + kill-switch plan; bad SW caches stick on user devices. Deferred from the July 8 perf session; do this last, slowly. Ref: docs/perf-audit.md §4.

**Security & code-quality audit follow-ups (2026-06-17):**
- **[M1] `/api/usage` unauthenticated info disclosure** — `app/api/usage/route.ts:5` GET has no `auth()`; returns Finnhub/FMP consumption counts plus configured limits/alert thresholds (`lib/apiUsage.ts:75-90`) — recon for timing an abuse run against the AI routes. Gate behind `auth()` (ideally admin-only) or drop the public endpoint.
- **[M3] "EU-hosted, never sold" claim vs. third-party data flow** — storage is EU (Supabase; PostHog `eu.i.posthog.com`), but per-position holdings transit to Anthropic (US — `app/api/ai-summary/route.js:273` sends "User Position: N shares at avg cost…") and tickers to Finnhub/FMP/Yahoo (US). Tighten wording (e.g. "stored in the EU") or add a sub-processor disclosure. Claims-accuracy; no code change.
- **[M4] Sync-risk duplication (drift)** — portfolio value/P&L math now lives in both `app/(v2)/dashboard/page.jsx:258-288` and `app/api/cron/portfolio-summary/route.js`; the EURUSD fetch lives in both `app/api/chart/route.js` and the cron's `fetchEurUsd`. Extract a shared `lib/portfolioMath.js` + a `getEurUsd()` helper consumed by both (mirrors the `lib/push.js` extraction). Already caused the ~€423 FX gap this session.
- **[L1] `user-settings` GET missing `no-store`** — `app/api/user-settings/route.js:26` returns the per-user `worldview` with no `Cache-Control`, unlike the other user-scoped GETs. Add `private, no-store`.
- **[L2] `/api/prices` no per-fetch try/catch** — `app/api/prices/route.js:16-34`: a single malformed Finnhub response rejects the whole `Promise.all` and 500s the request. Guard per-ticker like the cron's `fetchQuotes` does.
- **[L3] Grids not using `minmax(0, 1fr)`** — plain `1fr`/`repeat(n,1fr)` can overflow on mobile: `app/(landing)/_components/` (`DTMidCards.jsx:23`, `DTStockIntel.jsx:121`, `DTSummaryStrip.jsx:15`, `DTCapabilityStrip.jsx:14`) and `app/(v2)/research/page.jsx:710,1104,2465,2471,2480`. Verify per-case (some have responsive wrappers), then switch the genuinely mobile-multi-column ones.
- **[L4] `theme-temperatures` recompute has no lock** — `app/api/theme-temperatures/route.js:13` is correctly unauth (global, non-user data), but a >24h-stale cache triggers a full FMP recompute with no in-flight lock (thundering herd). Add an advisory lock or cron-precompute if FMP spend matters. Low.
- **[L5] Cron GET performs side effects** — `/api/cron/portfolio-summary` GET sends pushes (non-idempotent; each manual hit re-sends). `CRON_SECRET`-gated, so a semantic nit, not a vuln.
- **Dead code — `StockIntelSummary` / `StockIntelAISummary`** — `StockIntelSummary` has zero JSX mounts anywhere; its only child `StockIntelAISummary` (the `/api/stock-ai-summary` caller, `components/StockIntelAISummary.jsx:175`) is therefore unreachable. Remove both (separate cleanup) — or wire intentionally; flagged as a latent anonymous-Opus path if ever mounted.

---

## Later (this quarter)

**Build 2 — Risk Profile**
User-selectable investing style (Conservative / Balanced / Aggressive) that changes how the AI prioritizes and frames its analysis. Phase 1: single 3-toggle in user settings, prompt parameterization on tone and prioritization, meta-transparency in output (the AI names *what it's doing differently* because of the selected profile). Expand in Phase 2 based on user feedback. Anti-pattern to avoid: confirmation-bias machine — the AI must still surface contrary information regardless of profile.

---

## Blocked / Waiting On

- **Clerk preview deployment auth** — Sign-up doesn't work on Vercel preview URLs. Clerk Production instance only allows `stockdashes.com`; `*.vercel.app` preview URLs can't be added on the Hobby plan ("Satellites" feature requires Clerk Pro). Workaround: merge to main and test on production. Unblock when: Clerk Pro purchased (~$25–100/mo).

---

## Someday / Maybe

- **Data gaps for Aggressive / Thesis-driven analysis** — Segment revenue, forward guidance changes, analyst estimate revisions, sector rotation indicators, competitor wins/losses, management commentary tone, options market positioning. Don't source speculatively — wait for Build 2 Phase 2 user feedback to tell us which matters most.
- **Shared Nav component refactor** — Currently 3 independent nav implementations: landing (`landing-page.jsx`), blog (`app/blog/layout.jsx`), app (`components/NavBar.jsx`). Revisit when nav needs a feature addition that would require updating all three anyway.
- **Consolidate `isMobile` in `StockIntelAISummary`** — Component has its own inline `useState`/`useEffect` for mobile detection. Consolidate to use the shared `lib/useIsMobile` hook. No user-facing impact.
- **Streaming with partial-JSON parsing** — Switch /api/ai-summary to Anthropic streaming API (with edge runtime + SSE forwarding) and parse partial tool input on the client to render fields as they arrive. Time-to-first-content drops from ~21s to ~5-7s. Trade-off: brittleness — partial JSON parsing has edge cases around chunk boundaries, escaped quotes, nested structures, and depends on Anthropic's chunking behavior. Estimate: 4-6 hours initial + ongoing maintenance. Revisit if/when user feedback indicates raw latency matters more than perception of progress (and after correlation pair list, audit pass, and at least 2 more SEO posts have shipped).
- **Filing intelligence for held stocks (concept, 2026-07-04)** — AI reads SEC filings (8-K, 10-Q, 10-K) for each user's holdings/watchlist and surfaces only noteworthy items as feed events — CFO departures, impairments, going-concern language, customer concentration changes, guidance-adjacent exhibits. Value concentrated in small/mid-caps (HNST, NNE, ETOR tier) where no journalist reads the filings; explicitly NOT for mega-caps, where newsrooms beat any daily cron. Event-driven feed (append-only events table), not a status panel — lesson from the torn-down AI Thesis Signals experiment (built + removed 2026-07-03/04): state boards showing "nothing changed" are dead weight; only surface events. Reusable from that experiment: EDGAR fetch/retry patterns, Claude tool-schema extraction, cron auth pattern. Design fresh with per-user scope before building.

---

## Recently Shipped (last 14 days)

- 2026-07-10 — `fix(webhooks)`: Clerk `user.deleted` cascade (48d4073) verified end-to-end — throwaway signup → portfolio saved → user deleted in Clerk → confirmed all Supabase rows removed.
- 2026-07-10 — `fix(topbar)`: live market status + ET clock replacing the hardcoded mock ("May 4, 2026 · 4:00 PM ET" that never updated and always said "Market open"). New pure `lib/marketStatus.js` computes open/closed from ET (Mon–Fri 09:30–16:00, 2026 NYSE holidays + half-days), no tz library; Topbar ticks the ET clock per minute with a mount gate to avoid hydration mismatch. Renders on all `(v2)` pages. de477a4.
- 2026-07-09 — `perf(prices)`: split the Finnhub 52-week metric call off the hot quote path — `/api/prices` now costs 1 Finnhub call/ticker (quote only). 52W range served from `/api/valuation`'s existing 3600s metric fetch (zero new calls); research page reads 52W from `metrics`; orphaned top-level `components/HoldingsTable.jsx` deleted; `/api/prices` cache headers reconciled to a single 60s TTL across the route and `next.config.js`. c3d9db1.
- 2026-07-09 — `feat(dashboard)`: 60s live price polling — refetch `/api/prices` every 60s while the tab is visible, pause on hidden (`visibilitychange`), immediate refetch on refocus, silent poll-failure handling (keeps last good prices), and a muted "Updated HH:MM:SS" timestamp under the holdings table. Dashboard only. 6f42a53.
- 2026-07-09 — `fix(prices)`: `no-store` on the Finnhub quote fetch to eliminate compounded cache staleness at market open — the Vercel data-cache SWR was stacking on the CDN `s-maxage`, yielding ~5 min of stale prices right after open. CDN `s-maxage=60, stale-while-revalidate=30` remains the single caching layer. b97e94a.
- All three verified live during market open; staleness-at-open diagnosed and hardened same day.
- 2026-07-08 — `perf(earnings)`: Yahoo crumb handshake cached in module memory (4h TTL) + retry on 401/403. 9837d83.
- 2026-07-08 — `perf`: CookieHub moved to `afterInteractive` + posthog-js lazy-loaded (dynamic import, off the critical path). 7056de6.
- 2026-07-08 — `perf`: recharts loaded via `next/dynamic` (ssr:false) across all 5 chart routes — off the critical path, no longer in route entry bundles. e3559b8.
- 2026-07-08 — `perf(dashboard)`: optimistic holdings hydration — owner-checked cache seed + signature dedupe so ticker fetches start before the /api/portfolio round-trip. 36a1a5f.
- All four verified in production including the H2 shared-device regression test. Audit: docs/perf-audit.md.
- 2026-07-02 — `content(blog)`: post #8 live — Nike DCF wedge post (nike-dcf-what-the-market-believes), TL;DR, embedded calculator screenshot, internal links, OG card. e328be1.
- 2026-07-02 — `feat(blog)`: OG image system shipped (built May 4, uncommitted since) — dynamic per-post preview cards via app/blog/[slug]/opengraph-image.tsx + blog-index card, vendored Inter fonts (SIL OFL, license included), quoted YAML dates in the two DeGiro posts. All 7 posts now have branded share cards. Verified live in production and in a real Discord embed. 2cdebde.
- 2026-07-02 — `feat(pwa)`: install prompt shipped — dismissible banner for signed-in mobile-web users (components/InstallPrompt.jsx, mounted below Topbar in app/(v2)/layout.jsx). iOS branch: Share → Add to Home Screen instructions; Chromium branch: captured beforeinstallprompt + native prompt on tap. Per-user dismissal flag. Verified on device: iOS Safari shows banner, dismiss persists, hidden in standalone/desktop/signed-out. 915f1db.
- 2026-07-02 — `feat(push)`: subscribed bell now tappable → confirm dialog → pushSubscription.unsubscribe() + DELETE /api/push-subscription; UI flips back to enable state. Verified on device end-to-end (push_subscriptions row removed on unsubscribe, restored on re-enable). f8a7e66.
- 2026-07-02 — `fix(pwa)`: iOS standalone UI fixes verified on device — topbar + burger offset below status bar (safe-area-inset-top, globals.css), nav drawer safe-area padding, icon-only PushOptIn on mobile to stop avatar clipping. iPhone add-to-home-screen + install verified; push opt-in enabled on device. d75528b, 4b39c59, 5a2b91c. Pending: tomorrow's 08:00 cron push-delivery confirmation. Secrets rotation completed same day: CRON_SECRET + PUSH_SEND_SECRET rotated in Vercel, verified 200/401 against /api/cron/portfolio-summary.
- 2026-07-02 — `fix(security)`: H2 shared-device holdings leak closed. Verified fixed July 2, 2026 — `getCachedHoldings()` ownership guard (`holdingsStorage.js:40-41`) + `GuestDataGuard` eager `clearAllForeignData()` on anonymous mount (`GuestDataGuard.jsx:16-18`). All former unscoped readers consolidated behind the getter.

---

## Notes

**Clerk dev/prod environment split**
- Local (`.env.local`): Clerk Development keys — `pk_test_*` / `sk_test_*`. Test users created locally do NOT exist in production.
- Vercel (production env vars): Clerk Production keys — `pk_live_*` / `sk_live_*`.
- Symptom of mismatch: `Clerk: Handshake token verification failed` on `localhost:3000`. Fix: `dashboard.clerk.com` → switch to Development environment → copy API keys → update `.env.local` → restart `npm run dev`.

**Supabase migrations tracking**
- `db/migrations/001_portfolio_correlations.sql` — created and run in Supabase SQL Editor 2026-04-29.
- `portfolios` and `api_usage` table schemas not yet in `db/migrations/` — see Next section.

**Local dev: /api/portfolio returns 500**
- Likely cause: RLS policy on `portfolios` table doesn't accept Clerk Development user ID format.
- Workaround: test authenticated routes by shipping to a feature branch and checking on the Vercel preview deployment.

**Market clock holiday calendar — annual update**
- `lib/marketStatus.js` holds hardcoded NYSE `FULL_HOLIDAYS` and `HALF_DAYS` arrays. They currently cover **2026 only**. Each December, append the next year's dates (one line per date, sectioned by year) or the topbar's open/closed status will be wrong on that year's holidays. The file carries a ⚠️ comment to the same effect.

---

## Key learnings & debugging principles

**Device/context-specific bug debugging:** When a bug appears on one device/browser/context but not another (e.g., works on desktop but not mobile, works for one user but not another), test private/incognito mode FIRST before diagnosing code, CSS, or touch events. If the bug disappears in private mode, the cause is session/state (cookies, persistent auth, localStorage) — do not modify code, investigate state. If the bug persists in private mode, it's a code problem — proceed with code diagnosis. This 30-second test isolates state-vs-code in one step. Reference: May 26 2026 iOS Safari CTA bug — persistent Clerk session caused `mode="modal"` buttons to silently no-op for signed-in users on mobile. Private-mode test confirmed the cause was state, not code, saving hours of misdirected CSS diagnosis.

**Data-anomaly source-of-truth rule:** When Jonathan flags that a NUMBER looks wrong — share count, holding weight, ACP, portfolio %, balance, return — treat it as a signal of an upstream data or parser bug, NOT user miscounting. Audit the data pipeline before re-explaining the number to him. The visual-anomaly principle generalizes to data anomalies: if his real-world view disagrees with a number derived from data we processed, the parser, regex, or aggregation logic is the most likely failure point.

Reference: May 26 2026 portfolio audit. Jonathan said he had 359 AMD shares after a sale; the analysis computed 459. Initial response was to argue and propose explanations for why he might be wrong. The honest path was to audit the parser, which revealed Saxo's inconsistent Verkoop formatting. 41 sell rows across 15 tickers were missing from holdings calculations. Without Jonathan pushing back, this parser bug — also affecting StockDashes production — would have stayed live, and a blog post built on the wrong AI analysis would have shipped with factually incorrect numbers.

Operational consequence: if a user says "this number is wrong," the first move is audit, not argue.
