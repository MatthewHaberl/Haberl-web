-- 105_work_types.sql — Quote non-solar electrical work (W97, phase 1)
--
-- One quote_requests table, one discriminator. work_type selects an *engine*:
-- 'solar' (existing design canvas → designToBom) or 'scope' (line-item scope
-- builder → scopeToBom). Both emit the same DesignBom shape, so everything
-- downstream of the BOM (send → /q/[token] → accept → job → materials → PO →
-- finance) is untouched.
--
-- Additive only. work_type defaults 'solar', so every existing quote and job
-- keeps behaving exactly as it does today — that default is the main
-- regression guard for the whole feature.

-- ── Work types: data, not a deploy ──────────────────────────────────────────

create table if not exists public.work_types (
  code             text primary key,
  label            text not null,
  engine           text not null check (engine in ('solar', 'scope')),
  job_pipeline     text not null default 'lite' check (job_pipeline in ('full', 'lite', 'none')),
  default_sections text[] not null default '{}',
  description      text,
  sort_order       int not null default 0,
  active           boolean not null default true
);

insert into public.work_types (code, label, engine, job_pipeline, default_sections, description, sort_order) values
  ('solar',           'Solar PV / hybrid system',              'solar', 'full', '{}',
   'Full solar design on the canvas — panels, inverter, battery, compliance.', 0),
  ('backup_inverter', 'Backup power — inverter + battery',     'solar', 'full', '{}',
   'Inverter + battery with no PV — uses the design canvas with PV toggled off.', 1),
  ('electrical',      'General electrical & repairs',          'scope', 'lite', '{Materials,Labour,Compliance}',
   'Repairs, new circuits, lights, plugs — scoped as line items.', 2),
  ('db_rewire',       'DB board / rewire',                     'scope', 'lite', '{"Distribution board","Wiring & containment",Accessories,Labour,Compliance}',
   'Distribution board replacements, upgrades and rewires.', 3),
  ('coc',             'COC & inspection',                      'scope', 'lite', '{Inspection,"Remedial work",Certificate}',
   'Certificate of Compliance inspections and remedial work.', 4),
  ('generator',       'Generator & changeover',                'scope', 'lite', '{"Generator & changeover","Wiring & containment",Labour,Compliance}',
   'Generator supply, changeover switches and wiring.', 5),
  ('ev_charger',      'EV charger install',                    'scope', 'lite', '{Charger,"Supply & protection",Labour,Compliance}',
   'EV charge point supply and installation.', 6)
on conflict (code) do nothing;

alter table public.work_types enable row level security;

-- Staff read (pattern: 099_restrict_internal_config_reads_to_staff.sql)
drop policy if exists "Staff can read work types" on public.work_types;
create policy "Staff can read work types"
  on public.work_types for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

-- Admin manage (pattern: 052_supplier_offers.sql)
drop policy if exists "Admin can manage work types" on public.work_types;
create policy "Admin can manage work types"
  on public.work_types for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

-- ── Discriminator + scope payload on quotes ─────────────────────────────────

alter table public.quote_requests
  add column if not exists work_type text not null default 'solar'
    references public.work_types (code),
  add column if not exists scope jsonb;

create index if not exists quote_requests_work_type_idx
  on public.quote_requests (work_type);

-- Scope quotes keep their audit trail alongside system_design/bom_snapshot.
alter table public.quote_versions
  add column if not exists scope jsonb;

-- Jobs carry the work type so the pipeline/checklist can differ per job.
alter table public.jobs
  add column if not exists work_type text not null default 'solar';

-- ── Labour defaults for the scope engine ────────────────────────────────────
-- Placeholders until Matthew supplies real rates (coc_fee_rands exists, 031).

alter table public.company_settings
  add column if not exists labour_hourly_rate_rands numeric not null default 650,
  add column if not exists callout_fee_rands numeric not null default 450;
