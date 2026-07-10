-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Dynamic-themes migration (Gate 4b): add the active theme-set fingerprint to the
-- news_rankings cache identity so a theme change busts the ranking cache instead
-- of serving a ranking (up to 60 min old) computed against the previous theme set.
--
-- Least-invasive shape: news_rankings is one row per user (primary key user_id),
-- so we add a nullable column rather than changing the key. The route compares the
-- stored fingerprint against the current one on read (mismatch/NULL => regenerate)
-- and stamps it on write. Existing rows have NULL and regenerate once.

alter table news_rankings
  add column if not exists theme_fingerprint text;
