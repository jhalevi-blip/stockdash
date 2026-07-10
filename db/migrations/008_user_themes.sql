-- Run by hand in the Supabase SQL Editor. This file is the committed record.
--
-- Adds the user_themes table for the dynamic-themes migration (Gate 2).
--   user_themes — one row per (user, theme). Replaces the hardcoded four theses
--   in app/(v2)/themes/_lib/theses.js with a per-user, renameable, extendable set.
-- Nothing reads this table yet (wiring is Gate 4); this gate is schema + lazy
-- seeding only. Follows the existing pattern: Clerk text user_id, RLS enabled
-- with no public policies (service-role key only, same as user_settings /
-- theme_classifications / theme_candidates).

-- =============================================================================
-- TABLE: user_themes
-- =============================================================================
create table if not exists user_themes (
  user_id     text        not null,
  theme_id    text        not null,             -- immutable slug, e.g. 'debasement'
  name        text        not null,             -- display label, renameable
  description text        not null,             -- one-line card description
  guidance    text        not null,             -- 2-3 sentences defining Benefits/Neutral/Harmed for this theme (classify prompt)
  validity    text        not null default 'INTACT',
  version     int         not null default 1,   -- bumped only when theme MEANING changes; renames do not bump
  status      text        not null default 'active',  -- 'active' | 'retired'
  source      text        not null,             -- 'default' | 'extracted'
  priority    int         not null default 100, -- lower = more important; extraction assigns 10,20,30...; gaps allow manual reordering later without renumbering
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, theme_id)
);

alter table user_themes enable row level security;
-- No public policies — all access via the service-role key (SUPABASE_SECRET_KEY).

create index if not exists idx_user_themes_user
  on user_themes (user_id);
