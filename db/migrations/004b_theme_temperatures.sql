-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Adds one table for the /themes temperature engine:
--   theme_temperatures — a single global snapshot per engine_version. NOT user data;
--   it caches the computed market-temperature payload for the fixed tracker set so we
--   recompute at most daily. Follows the existing pattern: RLS enabled with no public
--   policies (service-role key only, same as portfolios / theme_classifications).

create table if not exists theme_temperatures (
  engine_version text primary key,
  computed_at    timestamptz not null default now(),
  payload        jsonb not null
);

alter table theme_temperatures enable row level security;
-- No public policies — service-role only, same as other tables. Global snapshot, not user data.
