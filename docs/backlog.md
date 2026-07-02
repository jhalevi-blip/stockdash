# StockDashes Roadmap

_Last updated: 2026-07-02_

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
- SEO post #8: Stock Research (DCF/valuation feature) — a wedge-led, shareable piece, counterpart to the published debasement/Theme Research post (content/blog/debasement-trade-scored.md). 7 posts already live (Apr 23 – Jun 17, 2026: portfolio analysis, correlation, Saxo report, AI rating, DeGiro export, DeGiro real return, debasement trade); this DCF/Stock Research piece is #8, still open.

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
- **Unquoted YAML dates in two blog posts** — degiro-export-guide.md:4 and degiro-real-return.md:4 have unquoted dates parsed as JS Date objects; app/blog/[slug]/opengraph-image.tsx:26 formatDate calls .split() on them → TypeError when the OG route ships. Fix: quote both dates (or coerce in formatDate). Only bites once OG routes are committed/deployed.

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

---

## Recently Shipped (last 14 days)

- 2026-07-02 — `feat(pwa)`: install prompt shipped — dismissible banner for signed-in mobile-web users (components/InstallPrompt.jsx, mounted below Topbar in app/(v2)/layout.jsx). iOS branch: Share → Add to Home Screen instructions; Chromium branch: captured beforeinstallprompt + native prompt on tap. Per-user dismissal flag. Verified on device: iOS Safari shows banner, dismiss persists, hidden in standalone/desktop/signed-out. 915f1db.
- 2026-07-02 — `feat(push)`: subscribed bell now tappable → confirm dialog → pushSubscription.unsubscribe() + DELETE /api/push-subscription; UI flips back to enable state. Verified on device end-to-end (push_subscriptions row removed on unsubscribe, restored on re-enable). f8a7e66.
- 2026-07-02 — `fix(pwa)`: iOS standalone UI fixes verified on device — topbar + burger offset below status bar (safe-area-inset-top, globals.css), nav drawer safe-area padding, icon-only PushOptIn on mobile to stop avatar clipping. iPhone add-to-home-screen + install verified; push opt-in enabled on device. d75528b, 4b39c59, 5a2b91c. Pending: tomorrow's 08:00 cron push-delivery confirmation. Secrets rotation completed same day: CRON_SECRET + PUSH_SEND_SECRET rotated in Vercel, verified 200/401 against /api/cron/portfolio-summary.
- 2026-07-02 — `fix(security)`: H2 shared-device holdings leak closed. Verified fixed July 2, 2026 — `getCachedHoldings()` ownership guard (`holdingsStorage.js:40-41`) + `GuestDataGuard` eager `clearAllForeignData()` on anonymous mount (`GuestDataGuard.jsx:16-18`). All former unscoped readers consolidated behind the getter.
- 2026-06-17 — `fix(security)`: H1 cost-bomb closed. Gated `/api/ai-summary` behind sign-in (401 when signed out); added a server-enforced daily AI quota to `/api/stock-ai-summary` via the new `ai_usage` table + `increment_ai_usage` RPC (migration `006_ai_usage.sql`, applied in Supabase) — anon 2/day per IP, signed-in 5/day per user, fails open on Supabase error. Verified live: ai-summary → 401, stock-ai-summary → 200/200/429. 1ad22c9.
- 2026-06-17 — `feat(push)`: daily portfolio-summary push cron — `/api/cron/portfolio-summary` (GET, `CRON_SECRET`-gated, weekend-skip, fx-unavailable guard) sends each subscribed user their standing at last close ("Portfolio €X · ±Y% at last close"), replicating the dashboard's `realPortfolioStats` math server-side; shared send/prune helper `lib/push.js` reused by `/api/push-send`. `vercel.json` cron `0 6 * * *`. Verified live: 200, 2 devices. 294581a, 15288cc.
- 2026-06-17 — `content(blog)`: published "The Debasement Trade, Scored" (`content/blog/debasement-trade-scored.md`) — wedge-led Theme Research post with embedded scored-candidates screenshot (`public/blog/theme-research-debasement-candidates.png`); TL;DR frontmatter generated. 138ae5c.
- 2026-06-05 — `fix(webhooks)`: Clerk user.deleted E2E verified. Finding: endpoint was never registered on the production Clerk instance and CLERK_WEBHOOK_SIGNING_SECRET was never set in Vercel — the cascade had never fired since shipping (48d4073). Fixed: endpoint registered + secret set; cascade extended to all five user tables (portfolios, portfolio_transactions, portfolio_correlations, user_settings, theme_classifications) in 1a49969. Verified live: user.deleted → 200 → all counts zero.
- 2026-06-02 — `feat(perf)`: dashboard + performance display all figures in EUR; Total Portfolio Value = holdings + cash (identical on both pages); SPY Mirror, Currency Impact ($→€ label fix), and the start-value column (via start-date FX `eurStart`) converted. 0b1e059, 4251a2b.
- 2026-06-02 — `feat(perf)`: Realized / Unrealized / Total P&L cards on /performance; Total P&L (≈ €118k) on the dashboard replacing Unrealized, with green/red chip coloring. 4251a2b, b2a70e9, 48ac68a.
- 2026-06-02 — `feat(realized)`: realized-P&L currency overhaul — EUR via per-trade Boekingsbedrag (net of fees), dropped Saxo sell-legs recovered, AVGO 10:1 split handled; €37,139 verified. 3117bac, 5307bf3.
- 2026-06-02 — `feat(cash)`: current-cash reconstruction from broker files (DeGiro Saldo / Saxo cashEvents), per-broker, prefilled in the Edit Portfolio modal on Import with manual override. 30a9235, 028127b.
- 2026-05-28 — `fix(performance)`: re-upload now re-parses fresh — /performance uses UnifiedUpload → /api/upload (no localStorage parse-cache, `private, no-store`, no file-hash cache). Resolves the "stale parsed data after re-upload" bug. ec17105.
- 2026-05-26 — `fix(parsers/saxo)`: minus-sign Verkoop format (`Verkoop -25 @ …`) handled — optional-negative regex (`-?`) + `Math.abs` on shares, with a regression test. Resolves the silently-dropped sell-rows / over-counted-holdings bug. 3852fa1.

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

---

## Key learnings & debugging principles

**Device/context-specific bug debugging:** When a bug appears on one device/browser/context but not another (e.g., works on desktop but not mobile, works for one user but not another), test private/incognito mode FIRST before diagnosing code, CSS, or touch events. If the bug disappears in private mode, the cause is session/state (cookies, persistent auth, localStorage) — do not modify code, investigate state. If the bug persists in private mode, it's a code problem — proceed with code diagnosis. This 30-second test isolates state-vs-code in one step. Reference: May 26 2026 iOS Safari CTA bug — persistent Clerk session caused `mode="modal"` buttons to silently no-op for signed-in users on mobile. Private-mode test confirmed the cause was state, not code, saving hours of misdirected CSS diagnosis.

**Data-anomaly source-of-truth rule:** When Jonathan flags that a NUMBER looks wrong — share count, holding weight, ACP, portfolio %, balance, return — treat it as a signal of an upstream data or parser bug, NOT user miscounting. Audit the data pipeline before re-explaining the number to him. The visual-anomaly principle generalizes to data anomalies: if his real-world view disagrees with a number derived from data we processed, the parser, regex, or aggregation logic is the most likely failure point.

Reference: May 26 2026 portfolio audit. Jonathan said he had 359 AMD shares after a sale; the analysis computed 459. Initial response was to argue and propose explanations for why he might be wrong. The honest path was to audit the parser, which revealed Saxo's inconsistent Verkoop formatting. 41 sell rows across 15 tickers were missing from holdings calculations. Without Jonathan pushing back, this parser bug — also affecting StockDashes production — would have stayed live, and a blog post built on the wrong AI analysis would have shipped with factually incorrect numbers.

Operational consequence: if a user says "this number is wrong," the first move is audit, not argue.
