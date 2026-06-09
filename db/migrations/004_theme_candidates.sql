-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Adds the theme_candidates table for the /themes "Discover Candidates" feature.
-- One row per (user, thesis, thesis_version) holding the validated candidate list.
-- Service-role key only: RLS enabled, NO public policies (matches theme_classifications).

create table if not exists theme_candidates (
  user_id        text        not null,
  thesis_key     text        not null,   -- THESES[].id: e.g. 'debasement' | 'strong-ai' | 'k-shaped' | 'instability'
  thesis_version text        not null,   -- = THESIS_VERSION, for cache invalidation
  candidates     jsonb       not null,   -- [{ ticker, companyName, sector, marketCap, return12m, rationale }]
  computed_at    timestamptz not null default now(),
  primary key (user_id, thesis_key, thesis_version)
);

alter table theme_candidates enable row level security;

create index if not exists idx_theme_candidates_user on theme_candidates (user_id);
