-- Migration: founder_overrides — suppress the DDS (Dillard's) auto false-positive
-- Date: 2026-09-25
-- Run by hand in the Supabase SQL Editor (BOTH dev and prod). This file is the committed record.
--
-- WHY: the monthly auto job (scripts/refresh-founder-flags.mjs) flagged DDS founder-led
-- because FMP reports the current CEO as "William T. Dillard" WITHOUT the "II" — which
-- matches the Wikidata "founded by" (P112) person of the same name. But that founder is
-- William T. Dillard (1914–2002, deceased); the current Chairman & CEO is his son,
-- William Dillard II. A namesake descendant-CEO is NOT the founder, so this is a false
-- positive. Source: Dillard's DEF 14A filed 2025-04-04, which names "William Dillard, II"
-- as "Chairman of the Board and Chief Executive Officer of the Company".
--
-- The job now also fixes this at the root: fetchFounders() excludes any founder with a
-- Wikidata date of death (P570), so a deceased founder can never match the living CEO
-- even when FMP omits the "II"/"Jr.". This override is belt-and-suspenders + the record;
-- founder_led=false always wins at read time, so the screen shows no F badge for DDS.

insert into founder_overrides (symbol, founder_led, founder_name, role, source, note) values
  ('DDS', false, null, null,
     'https://www.sec.gov/Archives/edgar/data/28917/000155837025004480/dds-20250517xdef14a.htm',
     'Auto false-positive: FMP reports the CEO as "William T. Dillard" (no "II"), matching the deceased founder W.T. Dillard (d. 2002). The current Chairman & CEO is his son William Dillard II (DEF 14A, 2025-04-04) — not the founder. Also excluded automatically now via the Wikidata P570 (date-of-death) filter.')
on conflict (symbol) do update set
  founder_led = excluded.founder_led, founder_name = excluded.founder_name,
  role = excluded.role, source = excluded.source, note = excluded.note, updated_at = now();

-- VERIFICATION (optional)
-- select symbol, founder_led, founder_name, note from founder_overrides where symbol = 'DDS';
