-- Migration: /watchlist — schema (build-order step 1)
-- Date: 2026-08-28
-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Scope: the five tables needed to stand up the watchlist page and its future
-- screen. price_alerts (spec §8, build-order step 9) is intentionally NOT created
-- here — alerts are deferred.
--
-- AUTH / RLS NOTE
-- --------------
-- This app authenticates with Clerk, not Supabase Auth. user_id is the Clerk ID
-- (text, e.g. 'user_2abc...'), so:
--   • no FK to auth.users (it doesn't hold Clerk IDs),
--   • all server-side access goes through the service-role key (SUPABASE_SECRET_KEY),
--     which bypasses RLS by design,
--   • the policies below use auth.uid()::text = user_id. Under Clerk, auth.uid()
--     is null for anon/publishable-key requests, so those USING/WITH CHECK clauses
--     evaluate false and deny all direct client access. This is defense-in-depth
--     and correctly describes intent, matching the existing `portfolios` policies
--     (see supabase/rls_migration.sql).

-- =============================================================================
-- TABLE: watchlist_sections
-- Named groups. The list is not a flat array.
-- =============================================================================
create table if not exists watchlist_sections (
  id          uuid primary key default gen_random_uuid(),
  user_id     text        not null,          -- Clerk user id
  name        text        not null,          -- 'Possible buys', 'Theme investments', 'Forex'
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_watchlist_sections_user
  on watchlist_sections (user_id, sort_order);

-- =============================================================================
-- TABLE: watchlist_items
-- One row per symbol. provider_symbol is resolved once at import (spec §2) and
-- is null when the name has no coverage on the current FMP plan.
-- =============================================================================
create table if not exists watchlist_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         text        not null,      -- Clerk user id
  section_id      uuid        references watchlist_sections(id) on delete cascade,

  display_symbol  text        not null,      -- shown in the UI: 'ASML', '6479', 'GBPUSD'
  provider_symbol text,                      -- called against FMP: 'ASML', null if unresolvable
  asset_class     text        not null,      -- 'equity' | 'fx'
  exchange        text,                      -- 'NASDAQ', 'TSE', 'FX'
  resolved        boolean     not null default false,

  role            text        not null,      -- 'candidate' | 'theme' | 'macro'
  origin          text        not null default 'manual',  -- 'manual' | 'screen'

  target_price    numeric,                   -- role='candidate'
  theme_slug      text,                      -- role='theme'
  thesis          text,
  screen_notes    jsonb,                     -- origin='screen': correlation, KPIs, gates

  sort_order      int         not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_watchlist_items_user_section
  on watchlist_items (user_id, section_id, sort_order);
create index if not exists idx_watchlist_items_user_origin
  on watchlist_items (user_id, origin);

-- =============================================================================
-- TABLE: rejected_candidates
-- The screener's memory, so the same names don't return every week (spec §7).
-- =============================================================================
create table if not exists rejected_candidates (
  id             uuid        primary key default gen_random_uuid(),
  user_id        text        not null,       -- Clerk user id
  symbol         text        not null,
  rejected_at    date        not null default current_date,
  reason         text        not null,
  revisit_if     text,                       -- human-readable: 'market cap > $2B'
  revisit_metric text,                       -- machine-checkable: 'market_cap'
  revisit_op     text,                       -- '>'
  revisit_value  numeric,
  resurfaced_at  date,
  unique (user_id, symbol)
);

-- =============================================================================
-- TABLE: fundamentals_snapshot
-- Cached fundamentals. NOT user-specific — shared reference data the screen
-- queries. NO RLS (read-only reference); created now so the schema is complete.
-- =============================================================================
create table if not exists fundamentals_snapshot (
  symbol              text        primary key,
  as_of               date        not null,

  market_cap          numeric,
  avg_dollar_volume   numeric,
  sector              text,
  industry            text,

  roic                numeric,
  roe                 numeric,
  gross_margin        numeric,
  gross_margin_stdev  numeric,               -- stdev of last 5 annual gross margins
  operating_income    numeric,
  fcf                 numeric,
  net_income          numeric,
  fcf_conversion      numeric,
  net_debt_ebitda     numeric,
  shares_cagr_3y      numeric,
  revenue_cagr_3y     numeric,

  price               numeric,
  high_52w            numeric,
  drawdown_pct        numeric,

  updated_at          timestamptz not null default now()
);

create index if not exists idx_fundamentals_snapshot_drawdown
  on fundamentals_snapshot (drawdown_pct);
create index if not exists idx_fundamentals_snapshot_sector
  on fundamentals_snapshot (sector);

-- =============================================================================
-- TABLE: screen_runs
-- One row per screen execution, so weeks can be diffed (spec §6).
-- =============================================================================
create table if not exists screen_runs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,          -- Clerk user id
  screen_slug text        not null,          -- 'quality-drawdown'
  ran_at      timestamptz not null default now(),
  result      jsonb       not null
);

create index if not exists idx_screen_runs_user_recent
  on screen_runs (user_id, ran_at desc);

-- =============================================================================
-- RLS — the four user-scoped tables. fundamentals_snapshot is deliberately left
-- without RLS (shared reference data).
-- =============================================================================

-- watchlist_sections ----------------------------------------------------------
alter table watchlist_sections enable row level security;
create policy "watchlist_sections_select_own" on watchlist_sections
  for select using (auth.uid()::text = user_id);
create policy "watchlist_sections_insert_own" on watchlist_sections
  for insert with check (auth.uid()::text = user_id);
create policy "watchlist_sections_update_own" on watchlist_sections
  for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "watchlist_sections_delete_own" on watchlist_sections
  for delete using (auth.uid()::text = user_id);

-- watchlist_items -------------------------------------------------------------
alter table watchlist_items enable row level security;
create policy "watchlist_items_select_own" on watchlist_items
  for select using (auth.uid()::text = user_id);
create policy "watchlist_items_insert_own" on watchlist_items
  for insert with check (auth.uid()::text = user_id);
create policy "watchlist_items_update_own" on watchlist_items
  for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "watchlist_items_delete_own" on watchlist_items
  for delete using (auth.uid()::text = user_id);

-- rejected_candidates ---------------------------------------------------------
alter table rejected_candidates enable row level security;
create policy "rejected_candidates_select_own" on rejected_candidates
  for select using (auth.uid()::text = user_id);
create policy "rejected_candidates_insert_own" on rejected_candidates
  for insert with check (auth.uid()::text = user_id);
create policy "rejected_candidates_update_own" on rejected_candidates
  for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "rejected_candidates_delete_own" on rejected_candidates
  for delete using (auth.uid()::text = user_id);

-- screen_runs -----------------------------------------------------------------
alter table screen_runs enable row level security;
create policy "screen_runs_select_own" on screen_runs
  for select using (auth.uid()::text = user_id);
create policy "screen_runs_insert_own" on screen_runs
  for insert with check (auth.uid()::text = user_id);
create policy "screen_runs_update_own" on screen_runs
  for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "screen_runs_delete_own" on screen_runs
  for delete using (auth.uid()::text = user_id);

-- =============================================================================
-- VERIFICATION (optional — run after applying)
-- =============================================================================
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--     and tablename in ('watchlist_sections','watchlist_items',
--                       'rejected_candidates','screen_runs','fundamentals_snapshot');
-- Expected: rowsecurity=true for all except fundamentals_snapshot.
