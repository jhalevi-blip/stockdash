# StockDashes Roadmap

_Last updated: 2026-06-17_

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

## Now (this week)

- [ ] **Audit pass** — production smoke test, FMP/Anthropic usage check, Search Console indexing, PostHog D1/D7, backlog hygiene, code health, dev environment.
- [ ] **SEO post: "How Much of Your Portfolio Should Be in One Stock?"** — concentration deep-dive; pairs with Post #2 on correlation; ~2000 words.
- [ ] **Option-guard mechanism unverified (observability)** — QBTS/15F27P2 and SOFI/21F28C15 leaked into holdings before commits 11db31c (Unicode-slash regex) and 14967f8 (same-day FIFO sort), then disappeared after both shipped — but we never proved which fix (or what combination) actually catches them. The Saxo file's option rows use ASCII U+002F, so the original `includes('/')` guard should have worked but didn't. Could regress on a different broker file. To verify: on the next upload, capture `_debugHoldingsTickers` (deployed at 549563b) from `/api/upload`'s Network response and confirm no `/`-containing tickers reach holdings. If options reappear, the diagnostic narrows the cause. Low priority — modal review surfaces any leak before save — but worth resolving for peace of mind. Cleanup note: the temporary `_debugHoldingsTickers` field (549563b) must be removed from `/api/upload`'s response in the Stage 1 cleanup commit alongside the other `_debug*` fields.

---

## Next (this month)

**SEO post queue:**
- SEO post: "Sector Diversification: How to Actually Diversify Your Portfolio" — companion to the correlation post; practical retail-investor angle
- SEO post: "What Is Beta in Stocks? (And Why It Matters Less Than You Think)" — myth-busting angle; accessible, broad search appeal
- SEO post #2: Stock Research (DCF/valuation feature) — a wedge-led, shareable piece, counterpart to the published debasement/Theme Research post (content/blog/debasement-trade-scored.md)

**Fixes and hygiene:**
- **Anon-after-signout cache read — verify sign-out clears cache (Stage 2)** — `useHoldings`'s anonymous path reads `stockdash_holdings` without checking `OWNER_KEY`, so an anonymous session could surface a prior signed-in user's holdings on a shared device. Mitigated IF `clearHoldingsCache()` fires on sign-out — but this is **UNVERIFIED**. Two-part item: (a) VERIFY `clearHoldingsCache()` is wired into the sign-out handler and actually fires — if it's missing or fires silently without effect, **promote to high priority** (live cross-user data leak); (b) add the OWNER_KEY guard to anon `getLocalHoldings`: return `[]` if `OWNER_KEY` is set to a real userId — confirmed safe (~3 lines: legit anon users have no OWNER_KEY, so no false negatives). Guard is defense-in-depth regardless of sign-out wiring.
- **`realized_pnl_${user.id}` sign-out lifecycle (Stage 2)** — Scoped realized data written to `localStorage.setItem(`realized_pnl_${user.id}`, ...)` on import. No cleanup on sign-out. Not a cross-user leak (it's scoped), but data accumulates per userId key indefinitely. Fix: `localStorage.removeItem(`realized_pnl_${user.id}`)` in the sign-out handler (same place `clearHoldingsCache()` should fire). Low priority — only cosmetic until a second user logs in on the same browser.
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

---

## Later (this quarter)

**Build 2 — Risk Profile**
User-selectable investing style (Conservative / Balanced / Aggressive) that changes how the AI prioritizes and frames its analysis. Phase 1: single 3-toggle in user settings, prompt parameterization on tone and prioritization, meta-transparency in output (the AI names *what it's doing differently* because of the selected profile). Expand in Phase 2 based on user feedback. Anti-pattern to avoid: confirmation-bias machine — the AI must still surface contrary information regardless of profile.

---

## Blocked / Waiting On

- **Clerk preview deployment auth** — Sign-up doesn't work on Vercel preview URLs. Clerk Production instance only allows `stockdashes.com`; `*.vercel.app` preview URLs can't be added on the Hobby plan ("Satellites" feature requires Clerk Pro). Workaround: merge to main and test on production. Unblock when: Clerk Pro purchased (~$25–100/mo).
- **API route auth checks (`/api/ai-summary`, `/api/stock-ai-summary`)** — No per-route auth; anyone with the URL pattern can POST and consume Anthropic credits. Mitigated today by global 60 req/min/IP middleware and front-end rate limits. Unblock when: Anthropic spend becomes meaningful or a public abuse incident occurs.

---

## Someday / Maybe

- **Data gaps for Aggressive / Thesis-driven analysis** — Segment revenue, forward guidance changes, analyst estimate revisions, sector rotation indicators, competitor wins/losses, management commentary tone, options market positioning. Don't source speculatively — wait for Build 2 Phase 2 user feedback to tell us which matters most.
- **Shared Nav component refactor** — Currently 3 independent nav implementations: landing (`landing-page.jsx`), blog (`app/blog/layout.jsx`), app (`components/NavBar.jsx`). Revisit when nav needs a feature addition that would require updating all three anyway.
- **Consolidate `isMobile` in `StockIntelAISummary`** — Component has its own inline `useState`/`useEffect` for mobile detection. Consolidate to use the shared `lib/useIsMobile` hook. No user-facing impact.
- **Streaming with partial-JSON parsing** — Switch /api/ai-summary to Anthropic streaming API (with edge runtime + SSE forwarding) and parse partial tool input on the client to render fields as they arrive. Time-to-first-content drops from ~21s to ~5-7s. Trade-off: brittleness — partial JSON parsing has edge cases around chunk boundaries, escaped quotes, nested structures, and depends on Anthropic's chunking behavior. Estimate: 4-6 hours initial + ongoing maintenance. Revisit if/when user feedback indicates raw latency matters more than perception of progress (and after correlation pair list, audit pass, and at least 2 more SEO posts have shipped).

---

## Recently Shipped (last 14 days)

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
