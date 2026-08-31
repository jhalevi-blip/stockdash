-- Migration: base tables (build-order step 0)
-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Reconstructed from the production schema export (db/dbschema-columns-*.csv,
-- schema-constraints, dbschema-indexes, schema-policies). These three tables
-- predate the numbered migration history — they were created directly in the
-- Supabase SQL editor and never captured as migrations, so a from-empty replay
-- of db/migrations/ failed. This file creates them FIRST (000) so the later
-- ALTERs succeed:
--   • 007_portfolio_settings.sql    → ALTER portfolios ADD settings
--   • 009_news_rankings_fingerprint → ALTER news_rankings ADD theme_fingerprint
-- Those columns are therefore intentionally NOT created here; each is added by
-- its own later migration, and the combined end-state matches production exactly.
--
-- AUTH / RLS NOTE (same as the rest of the schema): Clerk auth, not Supabase
-- Auth. user_id is the Clerk id (text). Server access uses the service-role key
-- (SUPABASE_SECRET_KEY), which bypasses RLS. The auth.uid()::text = user_id
-- policies deny anon/publishable-key access (auth.uid() is null under Clerk).

-- =============================================================================
-- TABLE: portfolios
-- Each user's full portfolio as a JSONB array. user_id (Clerk id) is the PK.
-- (settings jsonb is added later by 007_portfolio_settings.sql.)
-- =============================================================================
create table if not exists portfolios (
  user_id    text        not null,
  holdings   jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id)
);

alter table portfolios enable row level security;
create policy "portfolios_select_own" on portfolios
  for select using (auth.uid()::text = user_id);
create policy "portfolios_insert_own" on portfolios
  for insert with check (auth.uid()::text = user_id);
create policy "portfolios_update_own" on portfolios
  for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "portfolios_delete_own" on portfolios
  for delete using (auth.uid()::text = user_id);

-- =============================================================================
-- TABLE: news_rankings
-- One row per user (PK user_id) caching the ranked news payload.
-- (theme_fingerprint text is added later by 009_news_rankings_fingerprint.sql.)
-- =============================================================================
create table if not exists news_rankings (
  user_id     text        not null,
  ranking     jsonb       not null default '[]'::jsonb,
  article_ids jsonb       not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  primary key (user_id)
);

-- =============================================================================
-- TABLE: api_usage
-- Server-only usage tracking (Finnhub/FMP daily counts). No user_id.
-- RLS enabled with NO policies = anon denied; service role bypasses.
-- =============================================================================
create table if not exists api_usage (
  api   text not null,
  date  text not null,
  count int  not null default 0,
  primary key (api, date)
);

alter table api_usage enable row level security;

-- Atomic increment-and-return (mirrors increment_ai_usage in 006_ai_usage.sql).
-- Called via the service role by lib/apiUsage.ts (sb.rpc('increment_api_usage')).
create or replace function increment_api_usage(p_api text, p_date text, p_n int default 1)
returns int language sql as $$
  insert into api_usage (api, date, count)
  values (p_api, p_date, p_n)
  on conflict (api, date) do update
    set count = api_usage.count + excluded.count
  returning count;
$$;
