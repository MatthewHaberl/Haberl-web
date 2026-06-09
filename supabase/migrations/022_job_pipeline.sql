-- 022_job_pipeline.sql
-- Full job lifecycle: quote link, pipeline stages, status history (customer-visible
-- timeline), and per-job materials tracking (planned / loaded / used / returned)
-- so site wastage and shortages are measurable per job.

-- ── jobs: pipeline columns ─────────────────────────────────────
alter table public.jobs
  add column if not exists quote_request_id uuid references public.quote_requests(id) on delete set null,
  add column if not exists stage text not null default 'deposit_pending'
    check (stage in (
      'deposit_pending',  -- quote accepted, waiting for deposit
      'procurement',      -- deposit in, ordering starred equipment
      'scheduled',        -- stock secured, install date booked
      'installation',     -- crew on site
      'commissioning',    -- system live, monitoring + settings
      'coc',              -- certificate of compliance in progress
      'handover',         -- docs pack + walkthrough
      'follow_up',        -- post-install check-in window
      'completed',
      'on_hold',
      'cancelled'
    )),
  add column if not exists on_hold_reason text;

-- backfill stage for jobs that predate the pipeline (before the trigger exists,
-- so no history rows are created for them)
update public.jobs set stage = case status
  when 'completed'   then 'completed'
  when 'cancelled'   then 'cancelled'
  when 'in_progress' then 'installation'
  else 'deposit_pending'
end;

-- one job per quote request
create unique index if not exists jobs_quote_request_id_key
  on public.jobs (quote_request_id) where quote_request_id is not null;

create index if not exists jobs_stage_idx on public.jobs (stage);

-- ── job_status_history ─────────────────────────────────────────
create table if not exists public.job_status_history (
  id               uuid primary key default uuid_generate_v4(),
  job_id           uuid not null references public.jobs(id) on delete cascade,
  stage            text not null,
  note             text,
  customer_visible boolean not null default true,
  changed_by       uuid references public.user_profiles(id),
  created_at       timestamptz not null default now()
);

create index if not exists job_status_history_job_idx on public.job_status_history (job_id, created_at);

-- ── job_materials ──────────────────────────────────────────────
-- Seeded from the quote's calculated BOM. Quantities tracked through the job:
-- planned (from BOM) → loaded (left warehouse) → used (installed) → returned.
-- Variance = loaded - used - returned = lost/wasted on site.
create table if not exists public.job_materials (
  id              uuid primary key default uuid_generate_v4(),
  job_id          uuid not null references public.jobs(id) on delete cascade,
  section         text not null default '',
  sku             text not null default '',
  description     text not null,
  qty_planned     numeric(10,2) not null default 0,
  qty_loaded      numeric(10,2) not null default 0,
  qty_used        numeric(10,2) not null default 0,
  qty_returned    numeric(10,2) not null default 0,
  unit_cost_cents integer not null default 0,
  unit_sell_cents integer not null default 0,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists job_materials_job_idx on public.job_materials (job_id, sort_order);

-- ── Stage change bookkeeping ───────────────────────────────────
-- Keeps the legacy status column in sync (existing pages/metrics keep working)
-- and writes every stage change to the history timeline.
create or replace function public.handle_job_stage_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- derive legacy status from stage
  new.status := case
    when new.stage = 'completed' then 'completed'::job_status
    when new.stage = 'cancelled' then 'cancelled'::job_status
    when new.stage in ('installation', 'commissioning', 'coc', 'handover', 'follow_up') then 'in_progress'::job_status
    else 'pending'::job_status
  end;

  if new.stage = 'completed' and new.completed_at is null then
    new.completed_at := now();
  end if;

  if tg_op = 'INSERT' then
    insert into public.job_status_history (job_id, stage, note, customer_visible, changed_by)
    values (new.id, new.stage, new.on_hold_reason, true, auth.uid());
  elsif new.stage is distinct from old.stage then
    insert into public.job_status_history (job_id, stage, note, customer_visible, changed_by)
    values (new.id, new.stage, new.on_hold_reason, true, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists job_stage_change on public.jobs;
create trigger job_stage_change
  before insert or update of stage on public.jobs
  for each row execute function public.handle_job_stage_change();

-- ── RLS ────────────────────────────────────────────────────────
alter table public.job_status_history enable row level security;
alter table public.job_materials enable row level security;

-- Customers may see jobs on their own sites (read-only)
create policy "Customers see jobs for their sites"
  on public.jobs for select
  using (
    exists (
      select 1 from public.sites s
      where s.id = site_id and s.customer_id = auth.uid()
    )
  );

-- History: employees see all entries for jobs they can access
create policy "Employees see job history"
  on public.job_status_history for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and (j.assigned_to = auth.uid() or public.current_role() in ('manager', 'admin'))
    )
  );

-- History: customers see only customer-visible entries on their sites
create policy "Customers see visible job history"
  on public.job_status_history for select
  using (
    customer_visible
    and exists (
      select 1 from public.jobs j
      join public.sites s on s.id = j.site_id
      where j.id = job_id and s.customer_id = auth.uid()
    )
  );

create policy "Employees add job history"
  on public.job_status_history for insert
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and (j.assigned_to = auth.uid() or public.current_role() in ('manager', 'admin'))
    )
  );

-- Materials: assigned worker + managers/admin only (internal — has cost data)
create policy "Job materials follow job access"
  on public.job_materials for select
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and (j.assigned_to = auth.uid() or public.current_role() in ('manager', 'admin'))
    )
  );

create policy "Workers update materials on assigned jobs"
  on public.job_materials for update
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and (j.assigned_to = auth.uid() or public.current_role() in ('manager', 'admin'))
    )
  );

create policy "Managers manage job materials"
  on public.job_materials for all
  using (public.current_role() in ('manager', 'admin'));

-- Customers may read tasks on jobs for their sites (checklist progress, no prices)
create policy "Customers see tasks for their site jobs"
  on public.job_tasks for select
  using (
    exists (
      select 1 from public.jobs j
      join public.sites s on s.id = j.site_id
      where j.id = job_id and s.customer_id = auth.uid()
    )
  );
