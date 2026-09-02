# Decision — universe-level exclusions for the fundamentals screen

Status: decided 2026-09-02. Applies to the `symbol_universe` construction step
(`scripts/backfill-fundamentals.mjs --refresh-universe`, migration 014).

## Decision

The screener universe is filtered **at construction**, before the backfill runs —
not as a gate applied afterward. A symbol is marked **excluded** (and the backfill
skips it) if any of the following holds, in precedence order:

1. `sector` ∈ {**Financial Services, Utilities, Real Estate**} → `exclusion_reason = 'sector'`
2. latest annual `costOfRevenue / revenue` outside **[0, 1]** → `'cogs_ratio'`
3. fewer than **4** usable gross-margin years (gm ∈ [-1, 1]) → `'gm_years'`

Everything else is `exclusion_reason = NULL` = **evaluable**.

## Why

This is a **gross-margin-durability** screen. Its core quality signal is the
*stability* of gross margin over time (`gross_margin_years`, `gross_margin_stdev`).
That statistic is only meaningful where gross margin is a well-defined, comparable
number:

- **Financials / Utilities / Real Estate**: `costOfRevenue` is either not a
  meaningful line (banks, insurers, exchanges, BDCs) or is commodity/rate-driven
  and structurally volatile. A stability statistic here measures noise. Measured
  scope: ~25% of the raw universe; ~70% of Financials and ~83% of Utilities tripped
  a 15pp cogs/rev jump in the 2026-09-02 scan.
- **cogs/rev outside [0,1]**: negative gross profit or COGS > revenue — a
  pre-revenue / non-operating profile the durability signal doesn't apply to.
- **< 4 gross-margin years**: too short a history to establish stability at all.

Applying this as a *gate after the fact* meant computing the statistic on inputs it
doesn't apply to and then discarding it — wasted FMP calls and a padded abort-guard
denominator. Applying it at construction fixes both.

## The trade-off (recorded on purpose, not a bug)

**Excluding those three sectors means no banks, insurers, exchanges, utilities, or
REITs — and some genuine compounders live there** (e.g. exchange operators, quality
insurers, best-in-class utilities). We accept that. This screen is deliberately
scoped to businesses where *gross-margin durability* is a valid lens; names whose
economics aren't expressed through gross margin are out of scope **by design**. If
a specific such name matters, add it to the watchlist directly rather than widening
the screen.

## Reversibility

The raw signals (`latest_cogs_rev`, `gm_years`) and `sector` are all stored in
`symbol_universe`, so any rule can be **reversed or re-cut via SQL without
re-probing** ~1900 names. Example — re-include Financials, keeping the other rules:

```sql
update symbol_universe
   set exclusion_reason = case
     when latest_cogs_rev is null or latest_cogs_rev < 0 or latest_cogs_rev > 1 then 'cogs_ratio'
     when coalesce(gm_years, 0) < 4 then 'gm_years'
     else null end
 where exclusion_reason = 'sector'
   and sector = 'Financial Services';
```

## Abort guards

Two guards, re-cut from the single (mis-set) `MIN_UNIVERSE = 2000`. Both abort
**before any write**, so a degraded source can never overwrite a good table.

- **Raw guard (refresh only) — relative, not absolute.** On `--refresh-universe`
  the run reads the previous universe (the rows from the most recent `last_seen`
  strictly before today) and aborts if the new raw screener count is more than
  **`MAX_RAW_DROP` (20%)** below it. Both counts are printed so the drift is visible
  in the run output. `MIN_SCREENER_RAW = 800` is only the **absolute backstop**,
  applied when there is no previous universe to compare against (empty table, or a
  same-day re-run where every row already carries today's `last_seen`).
- **`MIN_EVALUABLE = 600`** — checked on a normal backfill run and as the refresh's
  post-exclusion sanity; too few evaluable symbols means the exclusion pass or the
  table is broken.

The raw guard is relative **on purpose**: raw has slid 2622 → 1916 → 1752 in three
days, so an absolute floor set anywhere near the live value would false-abort on
ordinary drift — and a floor set *above* the real value already caused a silent
false-abort once. A relative check tolerates gradual drift while still catching a
sudden collapse (a missing exchange, a truncated response). Drift itself remains
visible via the previous-vs-new counts printed every refresh — that's the signal,
the guard only catches the cliff.

## Consequence for the screen's SQL

Exclusion now happens at **universe construction**, not inside
`fundamentals_snapshot`. The snapshot still holds rows written *before* this
decision for symbols that are now excluded — currently **~100** of them (measured
2026-09-02), including Financial Services, Utilities and Real Estate names, plus
`cogs_ratio` and `gm_years` failures. These rows are stale relative to the decision
and will not be refreshed (the backfill skips excluded symbols), but they are not
deleted.

Therefore the screen's SQL must **not read `fundamentals_snapshot` directly**. It
must join to `symbol_universe` and filter on `exclusion_reason IS NULL`:

```sql
select f.*
  from fundamentals_snapshot f
  join symbol_universe u on u.symbol = f.symbol
 where u.exclusion_reason is null;
```

Reading the snapshot on its own would silently re-admit those ~100 excluded names.
