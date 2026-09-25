-- Migration: founder_flags + founder_overrides — the quality screen's "founder-led" marker
-- Date: 2026-09-24
-- Run by hand in the Supabase SQL Editor (BOTH dev and prod). This file is the committed record.
--
-- WHY: the screen shows a small "F" badge next to founder-led names. Detection is
-- automated monthly (scripts/refresh-founder-flags.mjs → GitHub Actions): a company is
-- founder-led (role CEO) when FMP's current CEO name matches a Wikidata "founded by"
-- (P112) person. That auto-signal is PRECISION-FIRST but incomplete — Wikidata P112 is
-- missing (Axon, Roblox) or opinionated (Tesla omits Musk) for some names, and it can
-- never see a founder who is EXECUTIVE CHAIR rather than CEO (Bezos, Ellison, Ek,
-- Galperin). So a hand-curated overrides table ALWAYS WINS over the auto flags.
--
--   founder_flags     : written monthly by the job. One row per screen-relevant symbol.
--   founder_overrides : hand-edited. Read at screen time; overrides the flag for that symbol.
--
-- The screen merges them (override wins) and shows the badge only when founder_led = true.
-- A missing table / failed lookup NEVER blocks the screen — it just means no badge.

create table if not exists founder_flags (
  symbol       text        primary key,
  founder_led  boolean     not null,
  founder_name text,                                  -- matched founder (NULL when not founder-led)
  role         text,                                  -- auto job only ever sets 'CEO'
  source       text,                                  -- provenance, e.g. 'fmp+wikidata'
  checked_at   timestamptz not null default now()     -- when the job last evaluated this symbol
);

create table if not exists founder_overrides (
  symbol       text        primary key,
  founder_led  boolean     not null,
  founder_name text,
  role         text,                                  -- 'CEO' | 'executive chair'
  source       text,                                  -- primary-source URL (proxy / IR / newsroom)
  note         text,
  updated_at   timestamptz not null default now()
);

-- ── Seed: verified overrides (each confirmed against the company's own filing / IR page,
--    Sep 2026). CEO-founders the auto job misses on a Wikidata P112 gap, plus founders who
--    are executive chair (never visible via the CEO field). Edit/remove freely.
insert into founder_overrides (symbol, founder_led, founder_name, role, source, note) values
  ('TSLA', true, 'Elon Musk',       'CEO',
     'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001318605&type=DEF+14A',
     'Founder-CEO; Wikidata P112 lists only Eberhard & Tarpenning (omits Musk).'),
  ('AXON', true, 'Rick Smith',       'CEO',
     'https://www.sec.gov/Archives/edgar/data/1069183/000162828026025521/axon-20260416.htm',
     'Founder-CEO (Patrick "Rick" Smith) since 1993; Wikidata has no P112 for Axon.'),
  ('RBLX', true, 'David Baszucki',   'CEO',
     'https://www.sec.gov/Archives/edgar/data/1315098/000110465926044362/rblx-20260528xdef14a.htm',
     'Founder-CEO; Wikidata has no P112 for Roblox.'),
  ('ORCL', true, 'Larry Ellison',    'executive chair',
     'https://www.oracle.com/corporate/executives/larry-ellison/',
     'Founder is Executive Chairman & CTO (co-CEOs Magouyrk/Sicilia since Sep 2025).'),
  ('AMZN', true, 'Jeff Bezos',       'executive chair',
     'https://www.sec.gov/Archives/edgar/data/1018724/000110465926041026/tm261382-1_def14a.htm',
     'Founder is Executive Chair (CEO Andy Jassy since 2021).'),
  ('SPOT', true, 'Daniel Ek',        'executive chair',
     'https://www.sec.gov/Archives/edgar/data/1639920/000114036126008076/ny20063044x1_ex99-1.htm',
     'Founder is Executive Chairman since Jan 2026 (co-CEOs Norström/Söderström).'),
  ('MELI', true, 'Marcos Galperin',  'executive chair',
     'https://www.sec.gov/Archives/edgar/data/0001099590/000109959026000010/meli-20260423.htm',
     'Founder is Executive Chairman since Jan 2026 (CEO Ariel Szarfsztejn).')
on conflict (symbol) do update set
  founder_led = excluded.founder_led, founder_name = excluded.founder_name,
  role = excluded.role, source = excluded.source, note = excluded.note, updated_at = now();

-- VERIFICATION (optional)
-- select symbol, founder_led, founder_name, role from founder_overrides order by symbol;
-- select count(*), sum(case when founder_led then 1 else 0 end) as led from founder_flags;
