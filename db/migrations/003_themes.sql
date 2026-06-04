-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Adds two tables for the /themes (Theme Research) feature:
--   user_settings        — one row per user; holds the configurable worldview sentence.
--   theme_classifications — cached classifier output per (user, ticker).
-- Both follow the existing pattern: Clerk text user_id, RLS enabled with no public
-- policies (service-role key only, same as portfolios / portfolio_transactions).

-- =============================================================================
-- TABLE: user_settings
-- =============================================================================
create table if not exists user_settings (
  user_id    text        primary key,
  worldview  text,
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;
-- No public policies — all access via the service-role key (SUPABASE_SECRET_KEY).

-- =============================================================================
-- TABLE: theme_classifications
-- =============================================================================
create table if not exists theme_classifications (
  user_id       text        not null,
  ticker        text        not null,
  thesis_version text       not null,
  verdicts      jsonb       not null,
  computed_at   timestamptz not null default now(),
  primary key (user_id, ticker)
);

alter table theme_classifications enable row level security;
-- No public policies — all access via the service-role key (SUPABASE_SECRET_KEY).

create index if not exists idx_theme_classifications_user
  on theme_classifications (user_id);
