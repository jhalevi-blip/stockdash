# Production schema snapshot — 2026-08-31

A **point-in-time** export of the production Supabase Postgres schema (project
`uvrqpjfzogdqfjawgvxh`), taken on 2026-08-31. It is **metadata only** — column
definitions, constraints, indexes, RLS policies, and function bodies from
`information_schema` / `pg_catalog`. It contains **no table row data** (no
portfolios, user IDs, holdings, push subscriptions, etc.).

## Not a source of truth

This is a **reference artifact**, captured to reconcile `db/migrations/` against
what production actually looked like on this date. It is **not** live and will
drift as the schema changes. The rebuildable source of truth is **`db/migrations/`**
— those files, replayed in order against an empty database, reproduce this schema.
If you need a current picture, re-run the queries below; don't trust this folder.

## Files and the queries that produced them

All queries were run in the Supabase SQL editor against schema `public`.

| File | Source | Query (equivalent) |
|------|--------|--------------------|
| `columns-a.csv` | `information_schema.columns` | `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name < 'p' order by table_name, ordinal_position;` |
| `columns-b.csv` | `information_schema.columns` | same as above with `table_name >= 'p'` |
| `constraints.csv` | `information_schema.table_constraints` + `key_column_usage` + `constraint_column_usage` | PK / FK / UNIQUE / CHECK constraints per table, with referenced table/column for FKs |
| `indexes.csv` | `pg_indexes` | `select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by tablename, indexname;` |
| `policies.csv` | `pg_policies` | `select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname='public' order by tablename, policyname;` |
| `functions.csv` | `information_schema.routines` | `select routine_name, data_type, routine_definition from information_schema.routines where routine_schema='public' and routine_type='FUNCTION';` |

> Note: `columns-a` / `columns-b` are split at `table_name = 'p'` only because the
> single-query export truncated at ~100 rows. Split in two, they cover all 18
> tables completely (verified against `constraints.csv`).

## Coverage / limitations

- Covers all **18 public tables** and both SQL functions (`increment_ai_usage`,
  `increment_api_usage`).
- Does **not** capture triggers, sequences, grants, extensions, or roles — none
  were needed to reconstruct the migrations, but their absence here is not proof
  they don't exist.
