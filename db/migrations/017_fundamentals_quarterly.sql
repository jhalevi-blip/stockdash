-- Migration: fundamentals_quarterly — per-calendar-quarter raw statement history
-- Date: 2026-09-03
-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- One row per (symbol, calendar_year, calendar_quarter). Holds the raw quarterly
-- statement lines AS REPORTED — no derived metrics, and NOT TTM: trailing-twelve-
-- month figures are a query-time concern, computed from these point-in-time rows,
-- never stored. The backfill writes quarterly statements at limit=40 (~10 years).
--
-- KEYING: keyed on CALENDAR (year, quarter) derived from report_date, so cross-
-- company comparisons line up on the calendar even when fiscal years differ. FMP's
-- own fiscal labels (fiscal_year, fiscal_quarter) are stored alongside but are NOT
-- the key. Both are kept so either axis is available downstream.
--
-- Columns match fundamentals_annual (migration 016): same raw statement lines,
-- including net_income and operating_income. Guard rule unchanged: absent -> NULL.

create table if not exists fundamentals_quarterly (
  symbol                          text        not null,
  calendar_year                   integer     not null,      -- from report_date (period-end)
  calendar_quarter                integer     not null,      -- 1..4, from report_date
  fiscal_year                     integer,                   -- FMP's fiscal label (not the key)
  fiscal_quarter                  integer,                   -- FMP's fiscal label (not the key)
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

  primary key (symbol, calendar_year, calendar_quarter)
);

create index if not exists fundamentals_quarterly_symbol_idx
  on fundamentals_quarterly (symbol);
