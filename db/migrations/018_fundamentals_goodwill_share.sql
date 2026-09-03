-- Migration: fundamentals_snapshot — goodwill_share
-- Date: 2026-09-03
-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- goodwill_share = goodwill / invested_capital_reported, where
--   invested_capital_reported = total_debt + total_equity - cash_and_equivalents
-- (the same reported base roic_reported divides by; see migration 015). It is the
-- share of reported invested capital that is acquisition premium, so a goodwill-heavy
-- name is visible at a glance instead of only inferable from the gap between the two
-- ROIC figures (roic = ex-goodwill base, roic_reported = reported base).
--
-- Written by scripts/backfill-fundamentals.mjs. NULL when the reported base is not
-- positive or goodwill is missing (absent goodwill is not a 0% share we can assert).
--
-- Idempotent (add column if not exists) — safe to re-run.

alter table fundamentals_snapshot
  add column if not exists goodwill_share numeric;
