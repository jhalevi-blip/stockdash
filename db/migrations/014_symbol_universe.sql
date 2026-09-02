-- Migration: symbol_universe — persisted screener universe (+ exclusion metadata)
-- Date: 2026-09-01 (exclusion columns added 2026-09-02)
-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- The backfill reads its universe from this table and NEVER calls the screener on a
-- normal run. Repopulate it (and recompute exclusions) explicitly with:
--     node scripts/backfill-fundamentals.mjs --refresh-universe
--
-- Universe-level exclusions are decided at CONSTRUCTION (the refresh), NOT as a
-- post-hoc gate, so the gross-margin-durability screen never computes a stability
-- statistic on inputs it doesn't apply to. Rationale + the trade-off (this drops
-- banks/insurers/exchanges/utilities/REITs — including some real compounders) is
-- recorded in docs/decision-universe-exclusions.md.
--
--   exclusion_reason : NULL = evaluable. Otherwise the FIRST failing rule, in
--                      precedence order: 'sector' -> 'cogs_ratio' -> 'gm_years'.
--   latest_cogs_rev  : newest annual costOfRevenue/revenue — the raw signal behind
--                      the cogs_ratio rule. Stored so a rule can be reversed later
--                      via SQL, without re-probing ~1900 names.
--   gm_years         : count of annual years with a usable gross margin (gm in
--                      [-1,1]) — the raw signal behind the gm_years rule.
--   first_seen       : date the symbol first entered the universe. DB default on
--                      insert; never overwritten (the refresh upsert omits it).
--   last_seen        : date of the most recent refresh in which the symbol appeared.

create table if not exists symbol_universe (
  symbol           text        primary key,
  exchange         text,
  sector           text,
  industry         text,
  market_cap       numeric,
  latest_cogs_rev  numeric,
  gm_years         integer,
  exclusion_reason text,
  first_seen       date        not null default current_date,
  last_seen        date        not null default current_date
);

-- Fallback for an environment that already has the pre-exclusion 014 table:
-- add the columns idempotently (these are no-ops when the CREATE above just made
-- them, and the fix for a DB where 014's original 7-column form was already run).
alter table symbol_universe add column if not exists latest_cogs_rev  numeric;
alter table symbol_universe add column if not exists gm_years         integer;
alter table symbol_universe add column if not exists exclusion_reason text;

-- Evaluable-set read path is WHERE exclusion_reason IS NULL; a partial index keeps
-- that lookup cheap without indexing the excluded majority.
create index if not exists symbol_universe_evaluable_idx
  on symbol_universe (symbol) where exclusion_reason is null;
