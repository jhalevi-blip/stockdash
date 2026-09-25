-- Migration: founder_overrides — seven additional verified founder-led companies (batch 2)
-- Date: 2026-09-25
-- Run by hand in the Supabase SQL Editor (BOTH dev and prod). This file is the committed record.
--
-- SOURCE for each row: the company's own proxy (DEF 14A) or annual report (20-F) where the
-- exact founding language is quoted in the note. All confirmed Sep 2026.
--
-- WHY OVERRIDES RATHER THAN AUTO FLAGS:
--   DOCS, IBP, TASK, TGLS: Wikidata has no P112 "founded by" entry for these companies
--     under their SEC CIK, so the monthly auto job finds no match.
--   EPAM, LIF: the founder became EXECUTIVE CHAIR (not CEO) in 2025; the auto job is
--     CEO-only and can never surface an exec-chair founder by design.
--   GLOB: foreign private issuer (Luxembourg), files 20-F not DEF 14A; not in the auto
--     job's EDGAR scan; Wikidata has no P112 entry under its CIK.
--
-- MTZ (Jose Ramon Mas) was investigated and excluded: the "Co-Founder" language in the
-- DEF 14A belongs to Jorge Mas (Chairman), not to the CEO Jose Ramon Mas. Both share the
-- "Mas" surname, causing a script false positive. The company was originally founded by
-- their father; neither brother meets the override standard.

insert into founder_overrides (symbol, founder_led, founder_name, role, source, note) values
  ('DOCS', true, 'Jeffrey Tangney', 'CEO',
     'https://www.sec.gov/Archives/edgar/data/0001516513/000151651326000032/docs-20260715.htm',
     'DEF 14A (2026-07-15): "Mr. Tangney is our co-founder and has served as our Chief Executive Officer and as a member of our board of directors since our inception in April 2010."'),

  ('EPAM', true, 'Arkadiy Dobkin', 'executive chair',
     'https://www.sec.gov/Archives/edgar/data/0001352010/000114036126013337/ny20062726x2_def14a.htm',
     'DEF 14A (2026): "roles of Chair and CEO previously both held by our co-founder, Mr. Dobkin." Dobkin became Executive Chair Sep 2025; Balazs Fejes is now CEO. Auto job is CEO-only and cannot surface an exec-chair founder.'),

  ('GLOB', true, 'Martín Migoya', 'CEO',
     'https://www.sec.gov/Archives/edgar/data/1557860/000162828026012910/glob-20251231.htm',
     '20-F (2025-12-31): "We were founded in 2003 by Martín Migoya, our Chairman and Chief Executive Officer." Also: "He founded our company together with Messrs. Englebienne, Nocetti and Umaran in 2003." Foreign filer (20-F); Wikidata has no P112 entry under the SEC CIK.'),

  ('IBP', true, 'Jeffrey Edwards', 'CEO',
     'https://www.sec.gov/Archives/edgar/data/0001580905/000158090526000022/ibp-20260408.htm',
     'DEF 14A (2026-04-08): "As founder of the Company, Mr. Edwards has unique knowledge and experience in the Company''s culture, business development, strategy and operations."'),

  ('LIF', true, 'Chris Hulls', 'executive chair',
     'https://www.sec.gov/Archives/edgar/data/0001581760/000158176026000063/lif-20260416.htm',
     'DEF 14A (2026-04-16): "Chris Hulls, Life360''s co-founder and former Chief Executive Officer, transitioned to the role of Executive Chairman" in August 2025. Lauren Antonoff is now CEO. Auto job is CEO-only and cannot surface an exec-chair founder.'),

  ('TASK', true, 'Bryce Maddock', 'CEO',
     'https://www.sec.gov/Archives/edgar/data/0001829864/000182986426000101/task-2026proxystatement.htm',
     'DEF 14A (2026): "Bryce Maddock co-founded TaskUs with Jaspar Weir in 2008. He has served as our Chief Executive Officer since 2008."'),

  ('TGLS', true, 'José Manuel Daes', 'CEO',
     'https://www.sec.gov/Archives/edgar/data/0001534675/000149315225025221/formdef14a.htm',
     'DEF 14A (2025): "Since 1983, he has led the Tecnoglass group, founded with his brother Christian Daes, our chief operating officer and a director." José Manuel Daes has been CEO since the company''s inception.')

on conflict (symbol) do update set
  founder_led  = excluded.founder_led,
  founder_name = excluded.founder_name,
  role         = excluded.role,
  source       = excluded.source,
  note         = excluded.note,
  updated_at   = now();

-- VERIFICATION (optional)
-- select symbol, founder_led, founder_name, role from founder_overrides order by symbol;
