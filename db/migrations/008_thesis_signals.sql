-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Adds the thesis_signals table for the experimental "AI Thesis Signals" panel.
-- One row per (signal_key, ticker); written only by the /api/cron/thesis-signals
-- job (EDGAR full-text scan + 10-Q footnote extraction, classified by Claude).
-- Service-role key only: RLS enabled, NO public policies (matches ai_usage).
--
-- status:
--   green / amber / red  — classified signal
--   unparsed             — extraction or classification failed; surface "check manually"

create table if not exists thesis_signals (
  id            uuid primary key default gen_random_uuid(),
  signal_key    text not null,
  ticker        text not null,
  status        text not null check (status in ('green', 'amber', 'red', 'unparsed')),
  value_numeric numeric,
  value_text    text,
  source_url    text,
  filing_date   date,
  checked_at    timestamptz not null default now(),
  unique (signal_key, ticker)
);

alter table thesis_signals enable row level security;

-- ── Teardown (experimental feature — trivially removable) ────────────────────
-- DROP TABLE thesis_signals;
