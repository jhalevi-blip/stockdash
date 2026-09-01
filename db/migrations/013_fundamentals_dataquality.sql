-- Migration: fundamentals_snapshot — data-quality columns for the backfill
-- Date: 2026-09-01
-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Added by scripts/backfill-fundamentals.mjs:
--   market_cap_divergence : abs(screener_cap - metrics_cap) / screener_cap.
--                           FMP's two market-cap sources disagreeing; > 0.2 means
--                           the row shouldn't be trusted. market_cap itself now
--                           comes from the screener row (the authoritative source
--                           the universe is filtered on).
--   gross_margin_years    : count of annual gross margins the stdev was computed
--                           from. gross_margin_stdev now requires >= 4; this stores
--                           the count so that gate can be audited later.
--   nulled_ratios         : count (0-4) of the guarded ratios (net_debt_ebitda,
--                           roic, roe, fcf_conversion) that were NULLed for the row
--                           because their denominator was meaningless/unavailable.
--                           Ratios are recomputed from raw statement components, not
--                           taken from FMP's precomputed TTM values.
--   net_cash              : true when netDebt < 0. net_debt_ebitda is NULLed for
--                           these (the leverage multiple is meaningless); the gate
--                           reads "net_debt_ebitda < 3.0 OR net_cash" so they pass
--                           on merit instead of being excluded by a NULL. NULL when
--                           netDebt is unavailable.
--   roic_thin_base        : true when invested capital < 5% of revenue. roic is a
--                           small-denominator ratio there and unreliable, but roic
--                           itself is kept as-is (not nulled/clipped) — this only
--                           marks it. NULL when invested capital or revenue is
--                           unavailable.
--
-- Idempotent (add column if not exists) — safe to re-run if an earlier version with
-- fewer columns was already applied by hand.

alter table fundamentals_snapshot
  add column if not exists market_cap_divergence numeric,
  add column if not exists gross_margin_years     integer,
  add column if not exists nulled_ratios          integer,
  add column if not exists net_cash               boolean,
  add column if not exists roic_thin_base         boolean;
