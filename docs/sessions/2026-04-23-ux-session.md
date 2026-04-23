# Session: 2026-04-23 — UX Friction Fixes & GTM Prep

## Path 5 Verification (carry-over from 2026-04-20)

Edge-cache fix from the previous session (d6f4238) confirmed working end-to-end. Sign out → sign in → data persists correctly. Path 5 PASSED.

## Clarity Friction Finding

- Logo dead clicks on landing page (rage-click sessions recorded)
- Low pages-per-session: 1.09
- Low active time: ~40s median
- Diagnosis: activation-stage problem, not traffic-stage. Users arrive, don't engage, leave. Logo dead-clicks are a symptom of low trust/orientation, not a root cause of low activation.

## Logo Work

Four commits across the session, resulting in a single shared `components/Logo.jsx` component:

- SVG chart icon (18×18, gold `#c49a1a`)
- **STOCK** span — gold, 13px, weight 700, Segoe UI / system-ui (font locked to prevent DM Sans fallback on landing)
- **DASHES** span — blue `#2563eb`, same sizing

Five locations now use the shared component, all visually consistent:
1. `components/Sidebar.jsx` — `<Logo />` (href → `/dashboard`)
2. `app/(landing)/landing-page.jsx` nav — `<Logo href="/" />`
3. `app/(landing)/landing-page.jsx` footer — `<Logo href="/" />`
4. `app/sign-in/[[...sign-in]]/page.jsx` — `<Logo href="/" />`
5. `app/sign-up/[[...sign-up]]/page.jsx` — `<Logo href="/" />`

Typography fix applied in final commit (f5e0836): `fontWeight` dropped from 800 → 700 and `fontFamily` locked to `'Segoe UI, system-ui, sans-serif'` on both spans, so the logo renders identically regardless of parent font context (DM Sans on landing vs Segoe UI in sidebar).

## Performance Chart Range Buttons — Proposed, Shipped, Reverted

Claude Code proposed 1M/3M/6M/1Y/ALL range preset buttons for the Performance chart as part of the initial Clarity fix. These were outside the agreed scope, caused bugs in production, and were reverted in ea97096.

**Decision: Performance chart range buttons will NOT be re-introduced without an explicit, scoped task.**

## Budget & GTM Strategy (updated)

- Budget: €3–5k over **6 months** (not 3 months as previously noted)
- Monthly check-ins but not gated on metrics — spend continues unless something is clearly not working
- Strongest identified channels:
  - Jeremy Lefebvre (YouTube/finance audience)
  - Meet Kevin (YouTube/finance audience)
  - Martin Shkreli Discord servers
  - LinkedIn

## Next Session

GTM Month 1 plan execution. **No further code changes unless GTM-blocking.** The product is in a shippable state.
