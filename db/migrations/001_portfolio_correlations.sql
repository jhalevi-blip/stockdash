-- Migration: create portfolio_correlations table
-- Date: 2026-04-29
-- Purpose: persist computed correlation matrices per user with built-in history support

create table if not exists portfolio_correlations (
  user_id              text         not null,
  computed_at          timestamptz  not null default now(),
  holdings_fingerprint text         not null,
  tickers              jsonb        not null,
  matrix               jsonb        not null,
  aligned_date_start   date         not null,
  aligned_date_end     date         not null,
  trading_days_used    int          not null,
  failed_tickers       jsonb        not null default '[]'::jsonb,
  primary key (user_id, computed_at)
);

create index if not exists idx_portfolio_correlations_user_recent
  on portfolio_correlations (user_id, computed_at desc);
