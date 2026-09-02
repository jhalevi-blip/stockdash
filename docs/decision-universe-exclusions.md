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

Two guards, re-cut from the single (mis-set) `MIN_UNIVERSE = 2000`:

- `MIN_SCREENER_RAW` — refresh only; detects a degraded/truncated screener (healthy
  raw ≈ 1,916).
- `MIN_EVALUABLE` — a normal backfill run + the refresh's post-exclusion sanity
  (measured evaluable ≈ 1,341).

Both are **provisionally set to 1 (effectively off)** for the first refresh, which
prints the real raw / evaluable / by-reason counts. Real thresholds are chosen from
that output — deliberately not guessed (a guard set above the real value already
caused a silent false-abort once).
