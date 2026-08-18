-- 117b: correction applied on top of 117 in prod.
--
-- 117 first shipped the crew-day uniqueness as a PARTIAL index
-- (`where slot_id is not null`). PostgREST's upsert cannot name an index
-- predicate, so ON CONFLICT (slot_id, staff_id) could not infer it and
-- confirming a crew day failed. The index is full instead — NULL slot_ids are
-- distinct in Postgres, so hand-typed entries are unconstrained either way.
--
-- 117_crews.sql already carries the corrected form, so a fresh database gets
-- it right in one step; this file exists so the repo and the prod migration
-- ledger describe the same history.
drop index if exists public.time_entries_slot_staff_uniq;
create unique index if not exists time_entries_slot_staff_uniq
  on public.time_entries (slot_id, staff_id);
