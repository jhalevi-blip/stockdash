-- Migration: job_heartbeats — one row per scheduled job, stamped every time it fires
-- Date: 2026-09-24
-- Run by hand in the Supabase SQL Editor (BOTH dev and prod). This file is the
-- committed record.
--
-- WHY: the daily production watchdog (app/api/cron/watchdog) needs to answer "did
-- the scheduled jobs actually run on time?". Some jobs leave a natural trace and
-- need no heartbeat — refresh-screen-quotes is verified directly via screen_quotes.as_of.
-- But the portfolio-summary Vercel cron and the watchlist-alerts GitHub cron only
-- touch data when they have something to send, so a silent scheduler failure leaves
-- NO trace. Each of those two upserts its row here right after it authenticates —
-- i.e. this records the SCHEDULER FIRING, not business success (a weekend/market-closed
-- run with nothing to do still counts as "ran"). The watchdog then flags a job whose
-- last_run_at is older than its expected cadence.
--
-- COLUMNS:
--   job          : stable job key ('portfolio-summary', 'watchlist-alerts'); primary key.
--   last_run_at  : when the job last fired (set to now() on every invocation).
--   updated_at   : row bookkeeping (mirrors last_run_at; kept for consistency with
--                  the other reference tables).
--
-- Written only by the service role (the crons use getSupabaseAdmin); non-sensitive
-- (a job name + a timestamp). Same access posture as screen_quotes — no RLS.

create table if not exists job_heartbeats (
  job          text        primary key,
  last_run_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- VERIFICATION (optional — run after applying, and again after the crons next fire)
-- select job, last_run_at from job_heartbeats order by job;
