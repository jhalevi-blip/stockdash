# StockDash Performance Audit

**Date:** 2026-07-08
**Scope:** Investigation only — no code changed. Four areas: first load, dashboard-after-login, market-data fetches, PWA reopen.
**Build:** `npm run build` → Next.js 16.2.1 (Turbopack), exit 0. 45 static pages generated.

> **Measurement caveat:** Next.js 16 + Turbopack does **not** print the per-route "First Load JS" table that Webpack builds emit, and it does not produce `.next/app-build-manifest.json`. So exact First Load JS *per route* is not directly available from the build. Where I give numbers below they are measured on-disk (raw + gzip) from `.next/static/chunks` and `.next/build-manifest.json`, not guessed. Route-level totals are reconstructed from which chunks a route statically imports.

---

## 1. First Load

### What the build printed
Turbopack emitted only the route list (`○` static / `ƒ` dynamic / `●` SSG), **no size column**. Full route list is in the build log; nothing flagged automatically because no sizes were printed.

### Measured bundle sizes (on disk)
| Chunk | Raw | Gzip | Contents |
|---|---:|---:|---|
| Shared baseline (`rootMainFiles`, loads on **every** route) | 445 kB | **130 kB** | React 19 + framework + Clerk + shared |
| `0d9o2wsy90.8j.js` (+ two sibling 385 063-byte chunks) | 385 kB | **111 kB** | **recharts** (66 refs each) |
| `0mb59ka~x7c35.js` | 187 kB | 61 kB | **posthog-js** (loads on every route via root layout) |
| `03~yq9q893hmn.js` | 113 kB | 39 kB | route/vendor |
| `110q6k5sdl4es.js` | 203 kB | 64 kB | vendor |

**recharts is duplicated, not shared.** Three chunks are each exactly 385 063 bytes with *different* md5s — i.e. three separate route entry bundles (research / performance / earnings+financials) each inline their own ~111 kB-gz copy of recharts rather than sharing one vendor chunk.

**Reconstructed First Load for chart pages:** 130 kB (baseline) + 61 kB (posthog) + 111 kB (recharts) ≈ **~300 kB gzip before route code**. That puts `/research`, `/dashboard`, `/performance`, `/earnings`, `/financials` **well over the 200 kB flag line.** The landing page and non-chart pages sit near the ~130 kB baseline.

### Largest dependencies & import style
| Dependency | Import style | Where | In client bundle? |
|---|---|---|---|
| **recharts** | **static** `from 'recharts'` | research, dashboard (`HeroValue`), performance, earnings, financials, `StockChart` | Yes — the dominant cost |
| **posthog-js** | static, in root-layout `PostHogProvider` | every route | Yes |
| **@clerk/nextjs** | static, `ClerkProvider` in root layout | every route | Yes |
| **xlsx / SheetJS** | static in `components/UploadPanel.jsx` **but that file is imported by nothing active**; real use is server-side (`/api/upload`, `/api/transactions`, `lib/brokers/*`) | server only | **No** (dead client import, tree-shaken) |
| **react-markdown + remark-gfm** | static | `/blog/[slug]`, `/privacy` only | Yes, but low-traffic routes |
| **driver.js** | **dynamic** `await import('driver.js')` in `DemoTour` (CSS is static) | tour only | Deferred ✅ |
| **react-joyride** | static `{ Joyride }` in `DashboardTour` | dashboard tour | Yes |

Nothing is wrapped in `next/dynamic`. The only lazy load in the codebase is `driver.js` via `await import()`.

### Server vs client / render blockers
- **Root layout** (`app/layout.jsx`): server component, but wraps the tree in `ClerkProvider` and mounts 6 client components (`AppShell`, `PostHogProvider`, `PwaSetup`, `GuestDataGuard`, `DevMode`, `Analytics`).
- **`app/(v2)/layout.jsx`, `dashboard/page.jsx`, `research/page.jsx`: all `'use client'`.** The entire dashboard shell + pages are client-rendered; there is **no server-side data fetching** — every byte of data is fetched client-side after hydration.
- **Blocking scripts:** root layout loads **CookieHub** as `<Script strategy="beforeInteractive" src="https://cdn.cookiehub.eu/...">` — an *external* blocking script in the critical path. `theme-init` and `gcm-default` are tiny inline `beforeInteractive` scripts (fine).
- **Fonts:** system stack only (`'Segoe UI', system-ui, sans-serif`) — no `@font-face`, no web-font download, **no blocking font.** (`public/fonts` + `lib/og-fonts.ts` are for OG images only.)
- No large data fetch in any layout (layouts are client and fetch on mount).

### Ranked — cheapest fix first
1. **recharts shipped statically & duplicated (~111 kB gz × per chart route).** Biggest single win. Wrap chart components in `next/dynamic({ ssr:false })` so recharts loads after paint, and/or hoist it into one shared chunk. Charts are all below the fold on the dashboard.
2. **posthog-js (~61 kB gz) on every route including the landing page.** Load it lazily / after idle instead of statically in the root layout.
3. **CookieHub `beforeInteractive` external script** blocks first paint. Move to `afterInteractive` (consent default is already set inline, so the CMP itself doesn't need to be render-blocking).
4. **react-joyride static on the dashboard** — dynamic-import the tour (same pattern already used for `driver.js`).

---

## 2. Dashboard data after login

All fetching is client-side in `app/(v2)/dashboard/page.jsx` (separate `useEffect`s). Order from mount:

1. **Clerk `useUser()` resolves** (`isLoaded`). Page shows "Loading…" until then.
2. **`useHoldings()` → `GET /api/portfolio`** — Supabase `portfolios` table, `select holdings, settings where user_id` `.single()`. Route is `force-dynamic` + `fetchCache:'force-no-store'` + `Cache-Control: private, no-store`. `holdings` stays `null` (loading) until this resolves.
3. **Once `holdings` is known**, three effects fire **in parallel** (all keyed on `holdings`):
   - `GET /api/prices?tickers=…` → Finnhub quote + metric per ticker
   - `GET /api/historical-prices?tickers=…` → FMP EOD, 1 year daily, per ticker
   - `GET /api/sectors?tickers=…` → FMP profile per ticker
4. **Fired at mount, independent of holdings** (good — no wait): `GET /api/chart?symbol=EURUSD=X`, `GET /api/macro`, `GET /api/realized-data` (this one waits for `isLoaded`).
5. **Feed row** (`EarningsList`/`NewsFeed`/`InsiderActivity`) fetches `/api/earnings`, `/api/news`, `/api/insider` once `tickerList` is derived.
6. **AI summary is NOT auto-fired** — `PortfolioAISummary` is button-gated (`showGenerateButton`), only reads localStorage cache on mount. **AI is off the critical path.** ✅

### The waterfall
```
Clerk resolve ──▶ GET /api/portfolio (no-store, Supabase) ──▶ [prices ‖ historical-prices ‖ sectors ‖ feeds]
                                                              (parallel among themselves)
```
The holdings-dependent fetches **cannot start until `/api/portfolio` returns**, because they need the ticker list. That's a genuine 2-hop waterfall (auth → portfolio → ticker data). Because `/api/portfolio` is `no-store`, **every dashboard open pays a fresh Supabase round-trip + Clerk `auth()` JWT verification before any market data begins.**

### Holdings computation & caching
- `getCachedHoldings()` (in `lib/holdingsStorage.js`) is a **localStorage** read, used by `useHoldings` **only for anonymous users**. Signed-in users always go to the network (`/api/portfolio`) — the comment is explicit: "Never fall back to localStorage — stale data is worse than an error state." So there is **no client-cache fast-path on login**; localStorage is write-through only.
- `enrichedRows`, `realAllocation`, `realPortfolioStats` are recomputed **per render** on the client (cheap array math over N holdings; two-pass for weights). Not memoized, but negligible at typical portfolio sizes.
- Portfolio value history is computed **client-side per request**: builds `{ticker:{date:close}}`, unions all trading dates, and sums value per day — `O(dates × holdings)` (~250 days × N). Runs every time holdings change.

### Ranked — cheapest fix first
1. **`/api/portfolio` is `no-store` and gates everything.** Cheapest: hydrate holdings optimistically from the write-through localStorage cache for the signed-in user (you already write it) to start `/api/prices` immediately, then reconcile when the network `/api/portfolio` returns. Removes one hop from the critical waterfall.
2. **Hero-chart `/api/historical-prices` (1 yr daily × N tickers)** is the heaviest single payload + the per-day summation loop. Precompute/cache the portfolio value series server-side (or lazy-load the hero chart below the fold) so first holdings render doesn't wait on a year of EOD data for every ticker.
3. **prices / sectors / historical are three separate route calls each re-fanning out per ticker.** Consolidating the ticker fan-out (one route returns quote+sector+history) cuts three client round-trips to one and lets the server parallelize once.

---

## 3. Market data fetches

| Source | Routes | Cache | Batching |
|---|---|---|---|
| **FMP** | `historical-prices`, `sectors` (profile), `financials` (quarterly), `valuation`, `valuation-history`, `earnings-history`, `macro` (treasury-rates) | Next fetch cache `next:{revalidate}` (86 400 s for history/profile; 3 600 s treasury) **+** CDN `Cache-Control` (`next.config.js` headers). | Per-ticker `Promise.all` fan-out — **parallel, not serial**. No comma-separated batching (stable `profile`/`historical` are single-symbol). |
| **Finnhub** | `prices` (quote 60 s + metric 3 600 s), `news` (900 s), `insider` (86 400 s), `macro` (UUP quote) | `next:{revalidate}` + CDN. In-memory 60/min rate tracker (`trackFinnhub`). | Per-ticker `Promise.all` fan-out, parallel. `prices` = **2 calls/ticker**. Finnhub free has no batch quote, so per-ticker is inherent. |
| **Yahoo (unofficial)** | `macro` (indices/VIX/yields/gold/oil), `earnings` (calendarEvents), `chart` (EURUSD etc.) | `macro`/`earnings` sub-fetches use `cache:'no-store'`; only the **route response** is CDN-cached (`macro` s-maxage=300, `earnings` 3 600). `chart` 14 400 s (config). | Per-ticker. `earnings` also does a **crumb+cookie handshake (2 extra fetches) on every request, uncached.** |
| **EDGAR (SEC)** | `financials`, `earnings-history` | `lookupCIK` (`company_tickers.json`) + `companyconcept` per concept, all `next:{revalidate:86400}` + CDN. | Single-ticker; one fetch per GAAP concept (several concepts per ticker). |

### Flags
- **`/api/earnings` crumb handshake is pure per-request overhead:** `fetchYahooCrumb()` hits `finance.yahoo.com` + `getcrumb` (`no-store`) on **every** call before the per-ticker `calendarEvents` loop. Not cached, not memoized.
- **No route fetches quotes *serially* per ticker** — every per-ticker loop uses `Promise.all`. So the "serial per ticker" anti-pattern is **not** present. The cost is call *volume* (Finnhub `prices` = 2×N, no batch), not serialization.
- **`macro` sub-fetches are `no-store`** so Next won't cache the individual upstream calls — but the aggregate route response is CDN-cached 300 s, which covers it.
- Every FMP/Finnhub route calls `trackFMP`/`trackFinnhub`. `trackFMP` is `async` (Supabase RPC) but fired `.catch(()=>{})` without `await` — non-blocking. `trackFinnhub` is in-memory/sync. No added latency on the response path. ✅

### Ranked — cheapest fix first
1. **`/api/earnings` Yahoo crumb handshake** — 2 uncached fetches per request. Cache the crumb/cookie in module memory with a TTL (they're valid for hours). Cheapest, highest-frequency win.
2. **Finnhub `prices` = 2 calls/ticker.** The `metric` call (52-week hi/lo) changes slowly and is already 3 600 s; consider splitting it off the hot quote path so a portfolio refresh is 1 call/ticker, not 2.
3. **`macro` fans out ~11 upstream calls per origin miss** — fine at 300 s CDN, low priority. Leave as is.

---

## 4. PWA reopen

- **Service worker (`public/sw.js`, "v1"):** notification/push plumbing **only**. The file's own header says *"NO fetch/caching logic."* It handles `install`(`skipWaiting`) / `activate`(`clients.claim`) / `push` / `notificationclick`. **There is no `fetch` handler and no Cache Storage usage.** Registered once by `components/PwaSetup.jsx`. Served with `no-cache` so updates propagate.
- **Manifest (`app/manifest.ts`):** `display: standalone`, `start_url: /dashboard`, theme/background `#0d1117`, three icons (192/512/maskable). Correct and complete.
- **App shell caching: none.** Because the SW has no fetch/cache handler, **every reopen is a cold network load** — HTML + ~130 kB-gz baseline JS + (on `/dashboard`) posthog + recharts, then the full client-side fetch waterfall from Area 2. No offline support, no instant paint from cache.
- `start_url` is `/dashboard`, so each reopen also triggers the `no-store` `/api/portfolio` round-trip before any data (compounds Area 2).

### Ranked — cheapest fix first
1. **No app-shell precache** — the whole point-cost of PWA reopen. Add a `fetch` handler: cache-first for `/_next/static/*` (content-hashed + `immutable`, so it's safe to serve from cache forever) and stale-while-revalidate for the shell HTML. This alone converts cold reopens into instant paints.
2. **`start_url: /dashboard` reopens cold into the `no-store` portfolio fetch.** Ties into Area 2 #1 — an optimistic cached-holdings render would make the reopened shell show data immediately while revalidating.

---

## Summary — biggest wins across all areas
1. **Dynamic-import recharts** (Area 1) — ~111 kB gz off the First Load of every chart page, currently duplicated across route bundles.
2. **Add app-shell precache to the service worker** (Area 4) — turns every cold PWA reopen into an instant paint; SW currently caches nothing.
3. **Lazy-load posthog + defer CookieHub** (Area 1) — ~61 kB gz off every route and unblocks first paint.
4. **Optimistic holdings hydration** (Areas 2 & 4) — removes the `auth → no-store portfolio → ticker data` hop from the login/reopen critical path.
5. **Cache the Yahoo earnings crumb** (Area 3) — kills 2 uncached upstream fetches on every `/api/earnings` call.
