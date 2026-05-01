# StockDashes Roadmap

_Last updated: 2026-05-01_

## Conventions

- Status: `[ ]` not started, `[~]` in progress, `[!]` blocked, `[x]` shipped this week
- Now = max 5 items, this week's focus
- Recently Shipped = last 14 days, prune older entries when updating
- SEO post ships weekly at ~2000 words. Current week's titled post lives in Now. Next 2-3 topics queued in Next.
- Update the "Last updated" date when you edit

---

## Now (this week)

- [ ] **Move stepper label above the skeleton** — Current placement is below 5 skeleton rows, often below the fold. Move the dynamic stage label to render above the rating skeleton at the top of the loading block, so it's the first thing the user sees during generation. ~20 min, pure repositioning in PortfolioAISummary.jsx, no logic changes.
- [ ] **Correlation Analysis dashboard section** — sorted pair list (top correlated, bottom correlated). New section below Portfolio Intelligence card. No heatmap.
- [ ] **Delete `/correlation-debug`** — cleanup, throwaway from yesterday.
- [ ] **Audit pass** — production smoke test, FMP/Anthropic usage check, Search Console indexing, PostHog D1/D7, backlog hygiene, code health, dev environment.
- [ ] **SEO post: "How Much of Your Portfolio Should Be in One Stock?"** — concentration deep-dive; pairs with Post #2 on correlation; ~2000 words; ship by 2026-05-05.

---

## Next (this month)

**SEO post queue:**
- SEO post: "Sector Diversification: How to Actually Diversify Your Portfolio" — companion to the correlation post; practical retail-investor angle
- SEO post: "What Is Beta in Stocks? (And Why It Matters Less Than You Think)" — myth-busting angle; accessible, broad search appeal

**Fixes and hygiene:**
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
