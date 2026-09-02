# Backlog — /watchlist detail panel

Status: not started. Next thing to build on /watchlist.
Written 2026-08-28, after steps 1–2 + inline editing + alert cron shipped.

---

## What's already done (context for future-me)

- `/watchlist` live on stockdashes.com: 3 sections, 54 rows, live quotes,
  target prices set on ~40 candidates, distance-to-target column.
- Alert cron running via GitHub Actions every 15 min during US hours.
  Email delivery NOT yet tested — see "Loose ends" below.
- Migrations 010 and 011 applied. `fundamentals_snapshot` table exists but is
  empty and unused so far.

## What to build

Turn `/watchlist` into a master–detail layout: table on the left, detail panel
for the selected row on the right.

**Layout first.** The page currently renders in a narrow column with the whole
left half of the screen empty. It has to go full-width before a chart will fit
beside the table.

**Detail panel, top to bottom:**
1. Price chart — reuse the Stock Research chart component, rendered larger.
   Daily bars (Starter has no intraday at any interval — settled, verified).
   Range toggle 1M / 6M / 1Y / 5Y. Draw `target_price` as a horizontal line
   when the row has one.
2. Stats block — market cap, enterprise value, total debt, cash & equivalents,
   P/E, P/S, next earnings date.
3. Revenue / gross profit / net income for the last 5 periods, as a small bar
   chart or table.

Model on TradingView's symbol overview, but do NOT rebuild all of it. Skip the
ownership donut, segment revenue, and capital-structure bars — twice-a-year
curiosities, not decision inputs. Add anything specific only after missing it
in real use.

## Verify before building

Check these against the FMP key on **Starter** and report before writing the
panel — the plan comparison table has been wrong repeatedly:

- `historical-price-eod/light` (daily, 1y and 5y)
- `key-metrics-ttm`, `ratios-ttm` (P/E, P/S, margins)
- `enterprise-values` (market cap, EV)
- `balance-sheet-statement` quarterly (debt, cash)
- `income-statement` **quarterly**, limit 5 (revenue, gross profit, net income)

Quarterly statements may be gated on Starter. If they are, fall back to annual
with limit 5 and say so.

## Architecture

- Fundamentals fetching goes in `lib/watchlist/fundamentals.js` as reusable
  functions, **not inline in the route**. The `fundamentals_snapshot` cron
  (spec §5) will call the same functions — this is the shared piece, and
  writing it inline now means duplicating it later.
- New route `GET /api/watchlist/fundamentals?symbol=X`. Auth-gated. Symbol must
  belong to the caller's own watchlist.
- Server-side cache, 12h TTL. This data changes quarterly, not by the minute.
- Use `historical-price-eod/light`, never `/full` — `/full` is ~95% of the FMP
  bandwidth already being used.
- Unresolved rows (6479) render "no data on current plan" in the panel rather
  than erroring.

## Loose ends from today

- **Email delivery untested.** Nothing on the list is within 10% of target, so
  no alert will fire naturally for a while. Force it: set CEG to 280 during US
  hours, run the workflow manually from the Actions tab, confirm the email
  lands, set it back to 250.
- **Cancel TradingView / disable auto-renew** before the renewal date. This was
  the point of the whole exercise.
- **Import script footgun.** Local scripts authenticate against the Clerk *dev*
  instance and write rows under the dev user id; production uses the live
  instance with a different id. This already caused an empty prod watchlist
  once. Make `--user-id` a required flag with no default.

## After this

The screen (spec §5–6): `fundamentals_snapshot` cron, then the SQL gates, then
`rejected_candidates`, then correlation ranking. That's the part that surfaces
*new* names rather than watching the ones already picked — and with nothing
close to target, it's what would actually make the page worth opening weekly.
