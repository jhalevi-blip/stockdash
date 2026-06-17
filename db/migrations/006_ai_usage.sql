-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Adds the ai_usage table for server-enforced daily quotas on AI generation
-- (e.g. /api/stock-ai-summary). One row per (identity, day); identity is
-- 'user:<clerkId>' for signed-in callers or 'ip:<addr>' for anonymous ones.
-- Service-role key only: RLS enabled, NO public policies (matches push_subscriptions).

create table if not exists ai_usage (
  identity text not null,
  day      date not null,
  count    int  not null default 0,
  primary key (identity, day)
);

alter table ai_usage enable row level security;

-- Atomic increment-and-return, mirroring increment_api_usage. Returns the new count.
create or replace function increment_ai_usage(p_identity text, p_day date)
returns int language sql as $$
  insert into ai_usage (identity, day, count)
  values (p_identity, p_day, 1)
  on conflict (identity, day) do update
    set count = ai_usage.count + 1
  returning count;
$$;
