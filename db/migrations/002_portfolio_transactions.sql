-- Stores realized P&L / transaction analysis data per user.
-- Mirrors the portfolios table pattern: one JSONB blob per user, keyed by Clerk user_id.
-- Already run in Supabase; this file is the committed record.

create table if not exists portfolio_transactions (
  user_id    text        primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- RLS enabled, no public policies — service-role key only (same as portfolios)
alter table portfolio_transactions enable row level security;
