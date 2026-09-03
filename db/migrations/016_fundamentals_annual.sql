-- Migration: fundamentals_annual — per-fiscal-year raw statement history
-- Date: 2026-09-03
-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- One row per (symbol, fiscal_year). Holds the raw annual statement lines (income
-- statement / balance sheet / cash flow) as REPORTED — no derived metrics, no TTM.
-- The backfill writes annual statements at limit=10, so ~10 fiscal years land here.
-- Metric definitions can then be recomputed over history from stored operands
-- instead of re-probing FMP.
--
-- Same statement lines as fundamentals_snapshot's raw operands (migration 015),
-- MINUS the derived columns there (tax_rate, roic_reported), PLUS net_income and
-- operating_income (raw lines that already lived on the snapshot pre-015).
--
-- Guard rule unchanged: uncomputable/absent field -> NULL (never 0, never a guess).

create table if not exists fundamentals_annual (
  symbol                          text        not null,
  fiscal_year                     integer     not null,
  report_date                     date,                      -- statement period-end date

  -- income statement
  revenue                         numeric,
  cost_of_revenue                 numeric,
  gross_profit                    numeric,
  operating_income                numeric,
  ebit                            numeric,
  ebitda                          numeric,
  depreciation_amortization       numeric,
  rd_expense                      numeric,
  interest_expense                numeric,
  interest_income                 numeric,
  income_before_tax               numeric,
  income_tax_expense              numeric,
  net_income                      numeric,
  weighted_average_shares_basic   numeric,
  weighted_average_shares_diluted numeric,

  -- balance sheet
  total_assets                    numeric,
  total_current_assets            numeric,
  inventory                       numeric,
  total_current_liabilities       numeric,
  total_liabilities               numeric,
  total_equity                    numeric,
  total_debt                      numeric,
  long_term_debt                  numeric,
  short_term_debt                 numeric,
  cash_and_equivalents            numeric,
  goodwill                        numeric,
  intangible_assets               numeric,
  net_ppe                         numeric,
  operating_lease_liability       numeric,
  lease_liability_current         numeric,
  lease_liability_noncurrent      numeric,
  minority_interest               numeric,

  -- cash flow
  operating_cash_flow             numeric,
  capex                           numeric,
  dividends_paid                  numeric,
  share_repurchases               numeric,
  stock_based_compensation        numeric,

  updated_at                      timestamptz not null default now(),

  primary key (symbol, fiscal_year)
);

create index if not exists fundamentals_annual_symbol_idx
  on fundamentals_annual (symbol);
