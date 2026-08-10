# Out-of-band migrations — repo ↔ production drift

Migrations in this folder were applied directly to the production database
(via the Supabase MCP/dashboard) and **were never committed to the repo**. They
are recovered here from `supabase_migrations.schema_migrations` so the repo
records what production actually contains.

**These files are NOT applied by the normal migration run.** The Supabase CLI
globs `supabase/migrations/*.sql` and does not recurse, so this subfolder is
deliberately inert. They are a record, not a runnable sequence — see the
ordering caveat below.

## Why the numbering is odd

Filenames use the applied `version` timestamp rather than the repo's `NNN_`
scheme, because the `NNN_` numbers collided. Three different migrations were
each authored as "091" at various times:

| Authored as | Actually applied as | Where it lives now |
|---|---|---|
| `091_supplier_pricelists.sql` | `supplier_pricelists` | `_out_of_band/20260709230600_…` |
| `091_key_refresh.sql` | `key_refresh` | *not inlined — see below* |
| `091_equipment_spec_extraction.sql` | `091_equipment_spec_extraction` | `_out_of_band/20260719235555_…` |

The repo's own `091`–`093` were therefore renumbered to `094`–`097` during the
2026-08 code review.

## ⚠️ The repo cannot currently rebuild production

Two findings, both verified against the live database:

1. **`public.extract_equipment_specs()` is an orphan.** It exists in production
   (11,616 bytes) but is defined by **zero** migrations — not in this repo and
   not in `schema_migrations`. It is depended on by
   `20260719235555_091_equipment_spec_extraction.sql` and by the
   `trg_extract_specs` trigger on `equipment_catalog`. It has been recovered
   verbatim into `20260719000000_extract_equipment_specs_function.sql`
   (md5-verified byte-for-byte against `pg_get_functiondef`).
   Its helpers `catalog_spec_num` / `catalog_spec_num_max` are **also** not in
   any migration — recover them the same way if you need a true rebuild.

2. **Replay order is unverified.** These were applied interleaved with the repo's
   numbered migrations, and the filename timestamps do not map onto the `NNN_`
   ordering. For example `004_rename_equipment_brands_name_to_brand` renames a
   column that later repo migrations reference — replaying it at the end of the
   sequence would not reproduce production. Do **not** assume
   `repo migrations + this folder` rebuilds the database.

**If you need a reliable baseline**, take one from the live database rather than
reconstructing it from history:

```bash
supabase link --project-ref wulqgqygwyiypbquaebf
supabase db dump -f supabase/schema_baseline.sql        # schema only
supabase db dump -f supabase/data_baseline.sql --data-only
```

## Not inlined here

Two recorded migrations were left out to avoid dumping ~33 KB of largely
generated SQL into the repo. Both are still recoverable from the database at any
time:

| Name | Size | What it is |
|---|---|---|
| `key_refresh` | ~15.6 KB | Key Electric price refresh + catalog enrichment |
| `092_equipment_relationships` | ~17.6 KB | `equipment_relationships` table + compatibility seed data |

Recover either with:

```sql
select array_to_string(statements, E'\n')
from supabase_migrations.schema_migrations
where name = 'key_refresh';   -- or '092_equipment_relationships'
```

`seed_connector_products` (~2.2 KB, pure seed data) was likewise left out.

## Contents

| File | Applied | Notes |
|---|---|---|
| `20260602074812_004_rename_equipment_brands_name_to_brand.sql` | 2026-06-02 | Ordering-sensitive — renames a column later migrations use |
| `20260604081836_add_connector_category.sql` | 2026-06-04 | Superseded by `catalog_category_expansion` |
| `20260604221847_017_products_external_id_unique.sql` | 2026-06-04 | |
| `20260616134239_add_plan_items_table.sql` | 2026-06-16 | |
| `20260709230600_supplier_pricelists.sql` | 2026-07-09 | ⚠️ grants cost-data reads to all authenticated — tightened by repo `098` |
| `20260712191635_pricelist_classification.sql` | 2026-07-12 | |
| `20260712193028_catalog_category_expansion.sql` | 2026-07-12 | |
| `20260719000000_extract_equipment_specs_function.sql` | unknown | Orphan — recovered from `pg_get_functiondef`, not from migration history |
| `20260719235555_091_equipment_spec_extraction.sql` | 2026-07-19 | Depends on the orphan above |
| `20260803180828_quote_archive.sql` | 2026-08-03 | |

## Avoiding this next time

Author migrations as files in `supabase/migrations/` and apply them with
`supabase db push`, rather than executing SQL against production directly. When
an urgent hotfix does go straight to the database, commit the same SQL as a file
in the same change.
