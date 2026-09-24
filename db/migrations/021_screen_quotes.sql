-- Migration: screen_quotes — daily post-close price + 52-week high for the screen
-- Date: 2026-09-24
-- Run by hand in the Supabase SQL Editor (BOTH dev and prod). This file is the
-- committed record.
--
-- WHY: the quality-compounder screen's drawdown gate needs a live price and the
-- rolling 52-week high (FMP `yearHigh`) for every ROIC-passer (~720 names). FMP's
-- Starter tier caps single-symbol quotes at ~300/min and its batch-quote endpoints
-- are subscription-restricted, so those quotes CANNOT be fetched inline on a page
-- request without either starving the site's own quotes or returning a partial,
-- non-deterministic result. Instead a scheduled job (GitHub Actions →
-- scripts/refresh-screen-quotes.mjs) refreshes them once per US trading day after
-- the close, paced ≤ ~150 req/min, and writes them here. The screen then reads
-- drawdown from this table instantly and deterministically.
--
-- COLUMNS:
--   symbol     : ticker (FMP provider symbol); primary key.
--   price      : last price from the refresh (FMP quote `price`). NULL if unquotable.
--   year_high  : rolling 52-week high (FMP quote `yearHigh`). NULL if unavailable.
--   as_of      : the quote's OWN price timestamp (FMP `timestamp`, epoch→tstz), i.e.
--                when the price was current — NEVER wall-clock now (a fabricated now
--                makes stale data look fresh). Drives the screen's staleness warning.
--   updated_at : when the refresh job last wrote this row (bookkeeping).
--
-- The screen joins this table to its ROIC-passers by symbol; a passer with no row
-- here is shown as "no quote", counted, and never silently dropped.

create table if not exists screen_quotes (
  symbol      text        primary key,
  price       numeric,
  year_high   numeric,
  as_of       timestamptz,
  updated_at  timestamptz not null default now()
);

-- VERIFICATION (optional — run after applying)
-- select count(*) as rows, max(as_of) as newest from screen_quotes;
