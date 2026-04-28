# StockDashes Backlog

Living document. Items here are not commitments — they're a snapshot of what's been discussed and where each thing stands. Reorder as priorities shift.

Last updated: 2026-04-28

---

## Active / Next Up

### Build 2 — Risk Profile (revised)

User-selectable investing style that changes how the AI prioritizes and frames its analysis.

**Approach:** Path 1 — ship Option B-lite with current data, expand based on user feedback. Don't source new data speculatively; let user complaints tell us what to invest in.

**Key principle: meta-transparency.** The AI explicitly names *what it's doing differently* because of the profile. Example output for an Aggressive user looking at AMD:

> "I'm prioritizing thesis-validation signals over diversification critique because of your aggressive profile. The most thesis-relevant data point I see is [X]."

This makes the feature feel substantive even when the underlying data is unchanged.

**Profile dimensions to validate with users (start simple, evolve):**
- Thesis-driven vs. Allocation-driven
- Inform vs. Suggest
- Phase 1: 3-toggle (Conservative / Balanced / Aggressive). Refine in Phase 2.

**Anti-pattern to avoid:** Confirmation-bias machine. Even with the profile set, the AI must still surface contrary information. Frame it as "concentrated by design — but here's the failure mode you should watch for," not validation.

**Build sequence:**
- Phase 1 (1–2 days): Single profile toggle in user settings, prompt parameterization on tone + prioritization, meta-transparency in output.
- Phase 2 (after 2–3 weeks of user feedback): Refine prompts based on complaints. Possibly split "Aggressive" into "Concentrated" vs. "Trader" if users tell us those differ.
- Phase 3 (later): Custom profiles, per-analysis override, account-level vs. session-level setting.

---

### Data gaps for Aggressive / Thesis-driven analysis

Identified during the Build 2 design discussion. Priority TBD — wait for user feedback in Phase 2 to tell us which matters most.

**Currently in the Stock Intel AI prompt:** ticker, price, analyst target, valuation multiples, financials (annual), earnings beats/misses, insiders, short interest, peers, user position.

**Missing data that would strengthen thesis-tracking:**

| Data | Status | Likely source |
|---|---|---|
| Segment revenue (e.g., AMD data center %) | Partial — only annual totals today | FMP higher tier, or Finnhub |
| Forward guidance changes (raised / cut / maintained) | Not in prompt | Earnings call transcripts API |
| Analyst estimate revisions (rising / falling / flat) | Not in prompt — different from target | FMP estimates, Refinitiv |
| Sector rotation indicators | Not in prompt | Custom calculation from price data |
| Competitor wins/losses (e.g., NVDA vs AMD capacity) | Not in prompt | News + entity extraction |
| Management commentary tone changes earnings call to call | Not in prompt | Earnings call transcripts + sentiment |
| Options market positioning (gamma, IV skew) | Not in prompt | CBOE, OPRA, or aggregator |

**Prioritization principle:** Don't source any of these speculatively. Wait until users in Phase 2 tell us which matters. The biggest mistake would be paying for an estimates-revision API for six months and discovering nobody cared.

---

## Bug Fixes / Polish

### CookieHub button color
Banner accept button still shows CookieHub default blue (`#181eed`) on production. Color was changed in CookieHub dashboard but propagation seems delayed or didn't save. Re-verify in CookieHub dashboard. If saved correctly, the issue is CDN propagation — give it more time. If not saved, retry. Cosmetic, not blocking.

### Empty data cards on AMD Stock Intel
Sometimes valuation, short interest, and insider activity cards render empty even though the data is available. Possibly related to the same fetch-race family as the data-race fix shipped 2026-04-28, but this one persists across refreshes for AMD specifically. Investigate after Build 2.

### Sign Up button in Chrome (preview deployments)
Reported during 2026-04-27 QA: clicking Sign Up on a Vercel preview URL went to `/sign-up` but the Clerk form didn't render. Root cause now understood (see "Parked" below). Production sign-up works fine. Defer.

---

## Parked / Blocked

### Clerk preview deployment auth
Sign-up doesn't work on Vercel preview deployments because:
1. Clerk Production instance only allows the configured primary domain (`stockdashes.com`).
2. `*.vercel.app` preview URLs are not subdomains of the primary domain, so they can't be added via the "Allowed Subdomains" feature on the Hobby plan.
3. The "Satellites" feature that would solve this is gated behind Clerk Pro (paid).

**Implication:** Signed-in QA on preview branches is not possible. Workaround is to merge to main and test on production. Code paths for signed-in users remain testable by code review.

**When to revisit:** When revenue justifies a Clerk Pro subscription (~$25–100/month).

### API route auth checks
`/api/ai-summary` and `/api/stock-ai-summary` currently have no per-route auth — anyone with the URL pattern can POST and consume Anthropic credits. Mitigated today by the global 60 req/min/IP middleware limit and the front-end UI rate limits, but a determined caller could bypass both. Defer until either spend becomes meaningful or there's a public abuse incident.

---

## Done (recent)

- **2026-04-28** — `fix(cookiehub)`: scope consent cookie to root domain so banner doesn't re-prompt across routes.
- **2026-04-28** — `fix(stock-intel)`: prevent AI generation against stale or partial data (generation-ID pattern + tighter button gating + "Loading data…" label).
- **2026-04-27** — `feat(stock-intel-ai)`: parity with Portfolio AI quality, anonymous gate removed, asymmetric Portfolio AI cap (2 anon / 5 signed-in) with separate localStorage keys.
- **2026-04-27** — Anthropic daily spend alert configured.
- **2026-04-26** — PostHog analytics live in production with 6-event funnel + UTM attribution.

---

## How to use this file

- Add new items as they come up. Don't worry about ordering on first add — sort during the next session.
- Mark "Active / Next Up" sparingly — fewer than three things at a time, ideally one.
- Move items to "Done" with a date and the commit message style summary when shipped.
- Move items to "Parked / Blocked" with the reason and a "When to revisit" note.
