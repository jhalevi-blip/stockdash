-- Migration: portfolio_correlations RLS (build-order step 12)
-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Backfills RLS that exists in production but was never captured in the migration
-- history. portfolio_correlations is created in 001; production has RLS enabled
-- plus a single permissive "Service role full access" policy (cmd=ALL, using=true,
-- with check=true). Reproduced here verbatim to match the export
-- (db/schema-policies.csv). Kept as its own trailing migration rather than editing
-- the already-applied 001.
--
-- NOTE: the policy is USING (true) WITH CHECK (true) — permissive for ALL roles.
-- In practice access is via the service-role key (which bypasses RLS anyway); the
-- anon/publishable key is not used for this table. This mirrors production exactly.

alter table portfolio_correlations enable row level security;

create policy "Service role full access" on portfolio_correlations
  for all using (true) with check (true);
