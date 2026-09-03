-- Migration: fundamentals_snapshot — raw statement operands (latest annual)
-- Date: 2026-09-03
-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- WHY: the snapshot stored only DERIVED metrics, so redefining any metric meant a
-- full ~105-minute FMP refetch. These columns persist the raw statement lines the
-- metrics are built from (latest annual figures), so a definition change can be
-- recomputed in SQL from stored operands instead of re-probing ~1800 names. Period
-- history lands in fundamentals_annual / fundamentals_quarterly (migrations 016/017).
--
-- All numeric, all latest-annual (income-statement/balance-sheet/cash-flow index 0),
-- written by scripts/backfill-fundamentals.mjs. Uncomputable/absent -> NULL (never 0),
-- the same guard the derived columns already use.
--
-- Two of these are DERIVED, not raw statement lines, kept here beside their operands:
--   tax_rate      : effective tax rate actually used for NOPAT (effectiveTaxRateTTM,
--                   else income_tax_expense/income_before_tax; NULL when both fail).
--   roic_reported : NOPAT / invested_capital_reported (see below). The primary `roic`
--                   column now uses the ex-goodwill invested-capital base.
--
-- Invested-capital bases the ROIC columns divide by (computed from these operands):
--   invested_capital_ex_goodwill = total_debt + total_equity - cash_and_equivalents
--                                  - goodwill - intangible_assets   -> feeds `roic`
--   invested_capital_reported    = total_debt + total_equity - cash_and_equivalents
--                                  -> feeds `roic_reported`
--
-- Idempotent (add column if not exists) — safe to re-run.

alter table fundamentals_snapshot
  -- income statement (latest annual)
  add column if not exists ebit                            numeric,
  add column if not exists tax_rate                        numeric,   -- derived: effective rate used for NOPAT
  add column if not exists revenue                         numeric,
  add column if not exists cost_of_revenue                 numeric,
  add column if not exists gross_profit                    numeric,
  add column if not exists ebitda                          numeric,
  add column if not exists depreciation_amortization       numeric,
  add column if not exists rd_expense                      numeric,
  add column if not exists interest_expense                numeric,
  add column if not exists interest_income                 numeric,
  add column if not exists income_before_tax               numeric,
  add column if not exists income_tax_expense              numeric,
  -- balance sheet (latest annual)
  add column if not exists total_assets                    numeric,
  add column if not exists total_current_assets            numeric,
  add column if not exists inventory                       numeric,
  add column if not exists total_current_liabilities       numeric,
  add column if not exists total_liabilities               numeric,
  add column if not exists total_equity                    numeric,
  add column if not exists total_debt                      numeric,
  add column if not exists long_term_debt                  numeric,
  add column if not exists short_term_debt                 numeric,
  add column if not exists cash_and_equivalents            numeric,
  add column if not exists goodwill                        numeric,
  add column if not exists intangible_assets               numeric,
  add column if not exists net_ppe                         numeric,
  add column if not exists operating_lease_liability       numeric,   -- total finance+operating lease obligations
  add column if not exists lease_liability_current         numeric,
  add column if not exists lease_liability_noncurrent      numeric,
  add column if not exists minority_interest               numeric,
  add column if not exists weighted_average_shares_basic   numeric,   -- weighted avg (no point-in-time count in FMP statements)
  add column if not exists weighted_average_shares_diluted numeric,
  -- cash flow (latest annual)
  add column if not exists operating_cash_flow             numeric,
  add column if not exists capex                           numeric,
  add column if not exists dividends_paid                  numeric,
  add column if not exists share_repurchases               numeric,
  add column if not exists stock_based_compensation        numeric,
  -- derived, stored beside its operands
  add column if not exists roic_reported                   numeric;   -- NOPAT / invested_capital_reported
