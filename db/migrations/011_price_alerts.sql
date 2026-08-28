-- Migration: /watchlist — price_alerts (spec §8, build-order step 9)
-- Date: 2026-08-28
-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Deferred out of migration 010; created now for the target-cross alert cron
-- (app/api/cron/watchlist-alerts). Same Clerk-auth / service-role / RLS pattern
-- as the other user-scoped watchlist tables (see 010_watchlist.sql).
--
-- NOTE vs spec: added `unique (item_id, direction)` so the cron can upsert exactly
-- one 'below' alert per item as its dedup ledger (the cron uses `active` as an
-- armed/disarmed flag: disarmed after firing, re-armed when price recovers above
-- target). The spec's column set is otherwise unchanged.

create table if not exists price_alerts (
  id           uuid        primary key default gen_random_uuid(),
  user_id      text        not null,          -- Clerk user id
  item_id      uuid        not null references watchlist_items(id) on delete cascade,
  direction    text        not null,          -- 'below' | 'above'
  price        numeric     not null,          -- the threshold this alert fired against
  active       boolean     not null default true,   -- armed? (false = fired, awaiting re-arm)
  triggered_at timestamptz,                    -- last time it fired
  created_at   timestamptz not null default now(),
  unique (item_id, direction)
);

create index if not exists idx_price_alerts_user on price_alerts (user_id);

-- RLS — user-scoped (service-role bypasses; anon denied since auth.uid() is null
-- under Clerk). Mirrors the watchlist_* policies in 010_watchlist.sql.
alter table price_alerts enable row level security;
create policy "price_alerts_select_own" on price_alerts
  for select using (auth.uid()::text = user_id);
create policy "price_alerts_insert_own" on price_alerts
  for insert with check (auth.uid()::text = user_id);
create policy "price_alerts_update_own" on price_alerts
  for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "price_alerts_delete_own" on price_alerts
  for delete using (auth.uid()::text = user_id);
