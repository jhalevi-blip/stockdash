-- Migration: watchlist_peer_overrides — per-user, per-symbol curated peer list
-- Date: 2026-09-03
-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- The financials panel's peer set defaults to Finnhub's /stock/peers live. When a user
-- edits it (adds/removes a peer), we persist the FULL effective list here, keyed on
-- (user_id, symbol). Present -> authoritative (Finnhub ignored for that symbol);
-- absent -> use Finnhub live. Reverting to Finnhub = delete the row.
--
--   symbol : the base provider symbol (uppercase), matching fundamentals_* keys.
--   peers  : curated peer tickers (base excluded). text[]; empty array = "no peers".
--
-- AUTH / RLS: same model as watchlist_items — Clerk user_id (text), all server access
-- via the service role (bypasses RLS) with user_id in the query filter. The policies
-- are defense-in-depth (auth.uid()::text = user_id denies direct anon/client access).

create table if not exists watchlist_peer_overrides (
  user_id    text        not null,        -- Clerk user id
  symbol     text        not null,        -- base provider symbol (uppercase)
  peers      text[]      not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

alter table watchlist_peer_overrides enable row level security;
create policy "watchlist_peer_overrides_select_own" on watchlist_peer_overrides
  for select using (auth.uid()::text = user_id);
create policy "watchlist_peer_overrides_insert_own" on watchlist_peer_overrides
  for insert with check (auth.uid()::text = user_id);
create policy "watchlist_peer_overrides_update_own" on watchlist_peer_overrides
  for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "watchlist_peer_overrides_delete_own" on watchlist_peer_overrides
  for delete using (auth.uid()::text = user_id);
