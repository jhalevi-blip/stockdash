-- =============================================================================
-- Row Level Security (RLS) Migration
-- =============================================================================
-- Run this entire script once in the Supabase SQL Editor:
--   Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- ARCHITECTURE NOTE
-- -----------------
-- This app uses Clerk for authentication, not Supabase Auth. All server-side
-- DB access goes through the service role key (SUPABASE_SECRET_KEY), which
-- bypasses RLS by design — so enabling RLS here will NOT break any existing
-- functionality.
--
-- What enabling RLS achieves:
--   ✅ Resolves the Supabase security warning
--   ✅ Blocks all direct access via the anon/publishable key
--   ✅ Defense-in-depth: even if the anon key leaks, no data is exposed
--   ✅ The policies correctly describe intent (each user owns their own rows)
--
-- The policies use auth.uid() which maps to Supabase Auth UUIDs. Since this
-- app uses Clerk IDs (text like "user_2abc..."), auth.uid() will be null for
-- anon requests — meaning the USING clauses evaluate to false and deny access.
-- The service role is unaffected (it bypasses all RLS).
--
-- If you ever switch to user-scoped DB calls (Clerk JWT → Supabase), update
-- the policies to cast: auth.uid()::text = user_id
-- =============================================================================


-- =============================================================================
-- TABLE: portfolios
-- Stores each user's full portfolio as a JSONB array.
-- user_id is the Clerk user ID (text), which is the primary key.
-- =============================================================================

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

-- Prevent the old "allow all" implicit behaviour from persisting
-- (Supabase creates no default policies; this is defensive.)

CREATE POLICY "portfolios_select_own"
  ON portfolios
  FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "portfolios_insert_own"
  ON portfolios
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "portfolios_update_own"
  ON portfolios
  FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "portfolios_delete_own"
  ON portfolios
  FOR DELETE
  USING (auth.uid()::text = user_id);


-- =============================================================================
-- TABLE: holdings
-- Row-per-holding table (legacy — app now primarily uses portfolios).
-- Same user_id ownership pattern.
-- =============================================================================

ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holdings_select_own"
  ON holdings
  FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE POLICY "holdings_insert_own"
  ON holdings
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "holdings_update_own"
  ON holdings
  FOR UPDATE
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "holdings_delete_own"
  ON holdings
  FOR DELETE
  USING (auth.uid()::text = user_id);


-- =============================================================================
-- TABLE: api_usage
-- Server-only usage tracking — no user_id, no public access.
-- Enabling RLS with NO policies = deny all for anon key.
-- The service role (SUPABASE_SECRET_KEY) bypasses this automatically.
-- The increment_api_usage() function is also called via the service role.
-- =============================================================================

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies = anon key gets nothing.
-- Service role access is unaffected.


-- =============================================================================
-- VERIFICATION
-- After running, confirm with:
-- =============================================================================
--
-- SELECT
--   schemaname,
--   tablename,
--   rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN ('portfolios', 'holdings', 'api_usage');
--
-- Expected: rowsecurity = true for all three rows.
--
-- SELECT
--   tablename,
--   policyname,
--   cmd,
--   qual,
--   with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- Expected: 4 policies on portfolios, 4 on holdings, 0 on api_usage.
-- =============================================================================
