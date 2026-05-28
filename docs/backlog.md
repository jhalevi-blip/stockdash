# StockDashes Roadmap

_Last updated: 2026-05-28_

## Conventions

- Status: `[ ]` not started, `[~]` in progress, `[!]` blocked, `[x]` shipped this week
- Now = max 5 items, this week's focus
- Recently Shipped = last 14 days, prune older entries when updating
- SEO post ships weekly at ~2000 words. Current week's titled post lives in Now. Next 2-3 topics queued in Next.
- Update the "Last updated" date when you edit

---

## Critical bugs to investigate

**Saxo G.2 parser — minus-sign Verkoop format silently dropped (HIGH PRIORITY)**

Discovered May 26 2026 during portfolio audit. Saxo records sell trades in two inconsistent formats in the `Acties` column:
- `Verkoop 100 @ 490.00` (no minus sign on shares)
- `Verkoop -25 @ 168.01 USD` (negative shares prefix)

The Saxo G.2 parser uses a regex like `(Koop|Verkoop)\s+([\d.]+)\s+@\s+([\d.]+)` which requires `[\d.]+` for shares. This silently fails to match the negative-prefix format, dropping those sale rows from FIFO processing.

Impact: holdings are over-counted on any ticker where Saxo logged a sale with the minus-sign format. Closed positions appear as still-held. ACP calculations are wrong. The Portfolio AI Summary in production runs on these inflated holdings, producing factually wrong analysis (confirmed: in one test case, a user's actual 21.5% AMD weight was reported as 45.7%).

Fix: change the regex to allow optional negative sign — `(-?[\d.]+)` — and take `abs()` of the parsed value. The sign comes from the side (Koop/Verkoop), not the share count.

Action items:
1. Patch the regex in the Saxo G.2 parser
2. Re-run G.2 unit tests
3. Add a test case for the negative-prefix format so this can't regress
4. Decide: backfill — re-run the parser on previously uploaded Saxo data for affected users? Or just fix going forward?

In one Saxo export, 41 Verkoop rows across 15 tickers were silently dropped: AMD, ABX, SOFI, RIG, INOD, ANET, NKE, NVTS, WHD, HCC, OP, CDNS, TSLA, PLTR, SRPT.

---

**Cash position currency selector ignored — displays as USD regardless of selection (HIGH PRIORITY)**

Discovered May 26 2026. The Edit Portfolio modal has a EUR/USD selector next to the cash position field. The selection is purely cosmetic on input — the cash value is stored as a raw number with no currency metadata, and the dashboard displays it as USD always (Cash $42,160 even when EUR was selected).

Impact:
- Total Portfolio Value is wrong by the EUR→USD FX gap (e.g., €42,160 displayed and counted as $42,160 instead of ≈ $47,640 at ~1.13)
- AI Portfolio Summary runs on a total that under-counts EUR cash holdings
- Sector weights, P&L %, and concentration ratios all use the wrong denominator

Decided approach: proper multi-currency cash support (multiple cash buckets stored per currency, displayed in native currency with running USD-equivalent totals). Deferred to a dedicated session — too large for tail-end debugging.

Scope of proper fix:
1. Schema migration: cash field → structured per-currency buckets
2. Edit form UX: support adding multiple cash entries with currency selectors
3. Display: cash card shows each bucket in native currency + total USD-equivalent
4. Total portfolio value: sum stocks_USD + sum(cash_currency × FX_rate)
5. AI summary prompt: include the multi-currency picture
6. Migration of existing user cash fields from scalar to structured

Interim alternative considered but not chosen: "pragmatic fix" honoring the EUR/USD selector without supporting multiple buckets. Rejected because Jonathan's own portfolio is multi-currency and the proper fix is inevitable.

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

**Performance page — recent broker transactions not appearing after re-upload (HIGH PRIORITY)**

Discovered May 26 2026. After pushing the Saxo parser fix (commit 3852fa1) which corrected handling of "Verkoop 100 @ 490.00" (missing trailing currency code), the /performance page still shows stale partial exit data for AMD: 100 shares sold / 259 remaining, instead of the corrected 200 sold / 159 remaining that the fixed parser should produce.

Possible causes:
1. localStorage cache: the performance page reads from cached parsed results and doesn't re-parse on file re-upload. Cached state from a buggy-parser run persists.
2. Server-side cache: /api/transactions caches by file hash and returns the same result for the same file even after the parser code changed.
3. The deploy hadn't propagated when Jonathan re-uploaded.
4. The file wasn't re-uploaded after the fix (user issue, not a bug).

Investigation steps:
- Check whether app/(v2)/performance/page.jsx reads from localStorage and skips parsing when present
- Check /api/transactions/route.js for any file-hash or content-hash caching
- Add a "force re-parse" or "clear cache" affordance if caching is the cause
- Verify the Saxo parser fix actually produces the expected output on Jonathan's file (parse the file in isolation against current main, confirm output)

User-visible symptom: parser bugs cannot be verified-fixed by re-upload — the page keeps showing the old data even after correct code ships.

---

## Now (this week)

- [ ] **Audit pass** — production smoke test, FMP/Anthropic usage check, Search Console indexing, PostHog D1/D7, backlog hygiene, code health, dev environment.
- [ ] **SEO post: "How Much of Your Portfolio Should Be in One Stock?"** — concentration deep-dive; pairs with Post #2 on correlation; ~2000 words; ship by 2026-05-05.
- [ ] **Option-guard mechanism unverified (observability)** — QBTS/15F27P2 and SOFI/21F28C15 leaked into holdings before commits 11db31c (Unicode-slash regex) and 14967f8 (same-day FIFO sort), then disappeared after both shipped — but we never proved which fix (or what combination) actually catches them. The Saxo file's option rows use ASCII U+002F, so the original `includes('/')` guard should have worked but didn't. Could regress on a different broker file. To verify: on the next upload, capture `_debugHoldingsTickers` (deployed at 549563b) from `/api/upload`'s Network response and confirm no `/`-containing tickers reach holdings. If options reappear, the diagnostic narrows the cause. Low priority — modal review surfaces any leak before save — but worth resolving for peace of mind. Cleanup note: the temporary `_debugHoldingsTickers` field (549563b) must be removed from `/api/upload`'s response in the Stage 1 cleanup commit alongside the other `_debug*` fields.

---

## Next (this month)

**SEO post queue:**
- SEO post: "Sector Diversification: How to Actually Diversify Your Portfolio" — companion to the correlation post; practical retail-investor angle
- SEO post: "What Is Beta in Stocks? (And Why It Matters Less Than You Think)" — myth-busting angle; accessible, broad search appeal

**Fixes and hygiene:**
- **Anon-after-signout cache read — verify sign-out clears cache (Stage 2)** — `useHoldings`'s anonymous path reads `stockdash_holdings` without checking `OWNER_KEY`, so an anonymous session could surface a prior signed-in user's holdings on a shared device. Mitigated IF `clearHoldingsCache()` fires on sign-out — but this is **UNVERIFIED**. Two-part item: (a) VERIFY `clearHoldingsCache()` is wired into the sign-out handler and actually fires — if it's missing or fires silently without effect, **promote to high priority** (live cross-user data leak); (b) add the OWNER_KEY guard to anon `getLocalHoldings`: return `[]` if `OWNER_KEY` is set to a real userId — confirmed safe (~3 lines: legit anon users have no OWNER_KEY, so no false negatives). Guard is defense-in-depth regardless of sign-out wiring.
- **`realized_pnl_${user.id}` sign-out lifecycle (Stage 2)** — Scoped realized data written to `localStorage.setItem(`realized_pnl_${user.id}`, ...)` on import. No cleanup on sign-out. Not a cross-user leak (it's scoped), but data accumulates per userId key indefinitely. Fix: `localStorage.removeItem(`realized_pnl_${user.id}`)` in the sign-out handler (same place `clearHoldingsCache()` should fire). Low priority — only cosmetic until a second user logs in on the same browser.
- **Extract realized-summary helper into `lib/realizedSummary.js` (Stage 2)** — `best`/`worst`/`allRealized`/label computation currently duplicated between `UnifiedUpload.jsx` and `performance/page.jsx`. Too small to warrant extraction at 2 callers. Extract when a third consumer appears or when the computation grows (win-rate, median, `totalPnlSinceStart` on the card).
- **`totalPnlSinceStart` filters on `firstBuy`, not `lastSell` (Stage 2)** — `positionsSinceStart` keeps positions where `firstBuy >= startDate`, which drops any position bought before the window but sold within it. That realized P&L happened in the window but is excluded. The correct filter for a "realized since X" figure is `lastSell >= startDate` (realization date). Pre-existing; low impact until date-range filtering becomes a first-class feature.
- **Computed cash from transactions (Stage 2 feature)** — Cash is currently manually entered. Broker files contain every cash-affecting transaction (buys, sells, dividends, fees, FX conversions, deposits/withdrawals). Cash should be computed from these, not typed. DeGiro: Rekeningoverzicht's Mutatie column is a signed cash ledger; summing yields balance. Saxo: Boekingsbedrag column is signed booking amount; parser already identifies 89 cash-transfer rows it currently skips — they should feed the cash calc. Phasing: Phase 1 — compute cash delta since export start date, display alongside manual entry as a reconciliation check (requires user-supplied starting balance). Phase 2 — replace manual entry; per-currency balances first (EUR + USD shown separately), then base-currency conversion using per-trade FX rates from Saxo's Omrekeningskoers column. Phase 3 — cash history time-series charting. Eliminates manual cash entry, fixes the cross-currency display issue (€88k stored as $88,000 today), enables auto-update on each upload, surfaces forgotten dividends/fees. ~1-2 days for Phase 2 done properly. Related to multi-currency cost basis item below — both should be solved together in a coherent currency-handling pass.
- **Multi-currency cost basis (Stage 2)** — Modal and save treat all per-position costs as USD ("AVG COST USD" label, rows are `{t,s,c,d}` with no currency field). EUR-denominated positions (Amsterdam-listed DeGiro stocks, EUR-priced) store their EUR cost as if USD → portfolio value is off by the EUR/USD FX rate for those positions. Pre-existing — UploadPanel had the same `{t,s,c,d}` shape; the UnifiedUpload swap does not change this. Related to the realized-P&L USD-gross-labeled-EUR gap below. Fix: carry per-position `currency` through `rows` state, `handleSave`, `POST /api/portfolio`, and valuation; or convert to a single base currency at import time.
- **`parseNum` integer-only assumption (Stage 2)** — `parseNum` in `degiro.ts` strips all dots as Dutch thousand separators before parsing. Safe for integer share quantities (`'1.000'` → 1000). If fractional shares are ever supported, a string quantity `'1.5'` would misparse as 15 (dot stripped). The `koers`/price parse deliberately does NOT use `parseNum` for this reason. Revisit `parseNum`'s quantity path before adding fractional-share support.
- **Realized P&L currency & fees gap (Stage 2)** — App computes realized P&L from USD prices, labels result in €, gross of fees, with no per-trade FX conversion. Saxo-reported AMD: €25,261.38 (EUR, net fees, with FX) vs app €27,424.50 — ~€2,163 (~8%) gap on a single USD position. For EUR-base investors holding USD stocks this divergence is systematic. Options: (a) convert to EUR at per-trade FX rate (Saxo exports carry FX rates; DeGiro Rekeningoverzicht has EUR legs), (b) deduct extracted fees (DeGiro fees already parsed; Saxo not yet), (c) at minimum relabel as "USD price gain, excl. FX & fees." Do not ship silently mislabeled.
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

- 2026-05-01 — `chore`: deleted /correlation-debug throwaway page (267 lines removed). Correlation feature is fully shipped end-to-end; debug page no longer needed.
- 2026-05-01 — `feat(correlation)`: AI-generated takeaways block added above pair lists in Correlation Analysis section. New /api/ai-summary branch type: 'correlation-takeaways' uses Claude Haiku 4.5 (~3-4s latency, ~20× cheaper than Opus) with a dedicated tool definition. Output: 2-3 plain-English takeaway sentences with specific tickers and r-values. Component slides the block in above pair lists when ready; silently no-ops on failure. First production run produced sharp investor-grade analysis: identified PHM/LEN as a "single bet on housing sentiment," surfaced AMD's real correlation cluster (with SOFI, not AMZN), and questioned whether OXY's diversification is "strategic or by accident."
- 2026-05-01 — `feat(dashboard)`: Correlation Analysis section added below Portfolio Intelligence card. Two-column layout (top 5 most-correlated pairs / bottom 5 least-correlated pairs) with confidence labels (very high / moderate / low / none / inverse). Anonymous users see a signup-gate teaser. Component fetches /api/correlation independently on mount (cached for signed-in users with computed correlations).
- 2026-05-01 — `fix(ui)`: moved 5-stage loading stepper label above the rating skeleton in PortfolioAISummary card so it's visible during the 21s generation wait (previously below the fold for many viewports).
- 2026-05-01 — `fix(ai-summary)`: removed nullable type on portfolio_shape schema (type: ['object','null'] → type: 'object'). Yesterday's required[] fix was partial — Anthropic doesn't strictly enforce required[], and the model was using the null union as an escape hatch to omit portfolio_shape entirely. Combined with non-nullable type, the field is now reliably present in production responses. Lesson: when you want a tool-use field to always be present, the schema needs both required[] AND a non-nullable type. Either alone is insufficient.
- 2026-05-01 — `feat(ui)`: 5-stage loading stepper added to PortfolioAISummary card during AI generation — calibrated text label progresses through "Reading holdings → Computing correlations → Generating analysis → Identifying clusters → Finalizing" on a 21s timer that resets when fetch resolves. ⚠️ Visibility issue: label sits below 5 skeleton rows in the loading block — likely below the fold for many users. Follow-up needed to reposition above the skeleton (added to Now).
- 2026-04-30 — Cache-Control audit complete: 3 authed routes already protected, headers normalized to `private, no-store`. No vulnerabilities found.
- 2026-04-30 — `feat(correlation)`: summarizeCorrelationMatrix helper added to lib/correlation.js for compact LLM prompt input
- 2026-04-30 — `feat(ai-summary)`: portfolio_shape field shipped — 10-lens analysis (sector, theme, macro, geographic, size_style, commodity_input, supply_chain, event_policy, liquidity_fund_flow, factor_style) with confidence flags, honorable mentions, blind spots. Post-generation enforcement of 10% weight floor and suggested_action fallback. portfolio_shape is required[] to ensure consistent generation.
- 2026-04-30 — `feat(ui)`: "What You're Really Long" block rendered in Portfolio Intelligence card — headline + primary clusters with confidence glyphs and tooltips, expandable honorable mentions and blind spots. correlationData fetch wired into generate() (signed-in users only).
- 2026-04-30 — `feat(ui)`: Renamed "Portfolio AI Summary" → "Portfolio Intelligence"; expand toggle copy sharpened to "Show blind spots & more"
- 2026-04-30 — docs: backlog restructured into living roadmap (Now/Next/Later/Blocked/Someday/Recently Shipped); GTM learnings archived to docs/gtm-notes.md
- 2026-04-29 — `fix(correlation)`: Cache-Control: private, no-store on all responses — fixes Vercel edge-caching user-specific correlation data (security + functional bug)
- 2026-04-29 — `feat(correlation)`: persistence layer — `portfolio_correlations` table, `lib/holdingsFingerprint.js`, `lib/correlationStore.js`, `/api/correlation` route
- 2026-04-29 — `feat(correlation)`: historical-prices route, Pearson correlation math (`lib/correlation.js`), `/correlation-debug` throwaway debug page
- 2026-04-29 — SEO Post #2 published: "Are Your Stocks Really Diversified? How to Check Correlation" (~12 min read)
- 2026-04-29 — Google Search Console: verified stockdashes.com (TXT via Cloudflare DNS), sitemap submitted (4 URLs), indexing requested
- 2026-04-29 — Blog navigation links added to landing nav, landing footer, app desktop nav, app mobile drawer
- 2026-04-29 — `fix(stock-intel)`: responsive mobile layout — `span={2}` cards collapse to full width on mobile, News+Filings grid stacks. Shared `useIsMobile` hook added to `lib/`
- 2026-04-28 — `fix(cookiehub)`: scope consent cookie to root domain so banner doesn't re-prompt across routes
- 2026-04-28 — `fix(stock-intel)`: prevent AI generation against stale/partial data (generation-ID pattern, tighter button gating, "Loading data…" label)
- 2026-04-27 — `feat(stock-intel-ai)`: parity with Portfolio AI quality, anonymous gate removed, asymmetric rate cap (2 anon / 5 signed-in) with separate localStorage keys
- 2026-04-27 — Anthropic daily spend alert configured
- 2026-04-26 — PostHog analytics live in production: 6-event funnel + UTM attribution

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
