-- Migration: watchlist_items soft delete (feat/watchlist-add-delete)
-- Date: 2026-09-05
-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Adds soft-delete to watchlist_items so /watchlist add + remove can revive a
-- previously-removed symbol (keeping its target_price, thesis, etc.) instead of
-- re-creating it. Remove sets deleted_at; nothing is ever hard-deleted. Every read
-- path filters `deleted_at is null` (quotes, alerts cron, peers/financials/
-- fundamentals symbol resolution, and the PATCH edit).
--
-- No RLS change: the deleted_at column inherits the table's existing policies.

-- 1. The soft-delete marker. null = live; a timestamp = removed. -----------------
alter table watchlist_items
  add column if not exists deleted_at timestamptz;

-- 2. Hot read path is now "live rows for this user, in section order". Replace the
--    full index with a partial one that only covers live rows (smaller, and it
--    matches the `deleted_at is null` predicate every read now carries).
drop index if exists idx_watchlist_items_user_section;
create index if not exists idx_watchlist_items_user_section_active
  on watchlist_items (user_id, section_id, sort_order)
  where deleted_at is null;

-- 3. No two LIVE rows for the same (user, symbol). Case-insensitive to match the
--    app-level dedup check (which lower()s display_symbol before comparing) and
--    scoped by asset_class so an 'equity' and an 'fx' row can share a ticker.
--    Soft-deleted rows are excluded, so a symbol can be removed and re-added.
create unique index if not exists idx_watchlist_items_unique_live_symbol
  on watchlist_items (user_id, lower(display_symbol), asset_class)
  where deleted_at is null;

-- VERIFICATION (optional — run after applying)
-- select column_name from information_schema.columns
--   where table_name = 'watchlist_items' and column_name = 'deleted_at';
-- select indexname from pg_indexes where tablename = 'watchlist_items';
