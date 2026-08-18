-- 125: saved scope sections ("section presets").
--
-- A preset is one section of a scope quote — its name and the items under it —
-- captured so the next quote can drop it in whole. The same sections get retyped
-- every week: a COC inspection, a 12-way board swap, the consumables that go
-- with a rewire. Same idea as db_assemblies (087) one level up: not a board, a
-- whole heading with its lines.
--
-- payload is a ScopePresetPayload (lib/quotes/scope-presets.ts) — catalog lines
-- keep their catalogId so generate still re-reads today's cost; free-text lines
-- carry the cost that was typed.
--
-- RLS follows db_assemblies AS AMENDED BY 098: the payload carries landed costs
-- and margins, so reads are staff-only from the start — never `using (true)`,
-- which is exactly the hole 098 had to come back and close.

create table if not exists public.quote_section_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  payload jsonb not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists quote_section_presets_created_at_idx
  on public.quote_section_presets (created_at desc);

alter table public.quote_section_presets enable row level security;

create policy "quote_section_presets_staff_select"
  on public.quote_section_presets for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

create policy "quote_section_presets_staff_insert"
  on public.quote_section_presets for insert
  with check (public.current_role() in ('field_worker', 'manager', 'admin'));

-- A preset is a shared house asset: anyone on staff may rename or re-save one,
-- but only its author (or an admin) can take it away.
create policy "quote_section_presets_staff_update"
  on public.quote_section_presets for update
  using (public.current_role() in ('field_worker', 'manager', 'admin'))
  with check (public.current_role() in ('field_worker', 'manager', 'admin'));

create policy "quote_section_presets_owner_delete"
  on public.quote_section_presets for delete
  using (created_by = auth.uid() or public.current_role() = 'admin');

comment on table public.quote_section_presets is
  'Reusable scope-builder sections: name + ScopePresetPayload (section name and its lines). Staff-only — the payload carries landed costs.';
