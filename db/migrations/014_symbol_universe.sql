-- Migration: symbol_universe — persisted screener universe
-- Date: 2026-09-01
-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- The backfill now reads its universe from this table and NEVER calls the screener
-- on a normal run. Repopulate it explicitly with:
--     node scripts/backfill-fundamentals.mjs --refresh-universe
-- which aborts (writing nothing) if the screener returns < 2000 symbols, so a
-- degraded screener can never truncate the universe.
--
--   first_seen : date the symbol first entered the universe. Set by the DB default
--                on insert and never overwritten (the refresh upsert omits it).
--   last_seen  : date of the most recent refresh in which the symbol appeared.

create table if not exists symbol_universe (
  symbol      text        primary key,
  exchange    text,
  sector      text,
  industry    text,
  market_cap  numeric,
  first_seen  date        not null default current_date,
  last_seen   date        not null default current_date
);
