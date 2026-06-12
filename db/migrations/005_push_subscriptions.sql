-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Adds the push_subscriptions table for web push notifications.
-- One row per browser push subscription (endpoint is unique per device).
-- Service-role key only: RLS enabled, NO public policies (matches theme_candidates).

create table if not exists push_subscriptions (
  endpoint     text        primary key,
  user_id      text        not null,
  subscription jsonb       not null,
  created_at   timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create index if not exists idx_push_subscriptions_user on push_subscriptions (user_id);
