-- 097_job_testimonials.sql
-- S7 — testimonial collection, built into the job pipeline rather than bolted on.
--
-- The ask (Matthew, dashboard reply): "build this into the project pipeline and
-- journey". So a testimonial is a first-class artefact of a job, requested at
-- handover/follow-up when the customer is happiest, collected on a tokenized
-- public page (no login — the same trick the quote share link uses), and then
-- reviewed before anything of theirs is ever shown in public.
--
-- Consent is stored explicitly and separately (publish at all / use their name /
-- use the video), because "they sent us a nice video" is not permission to put
-- their face on the website.

create table if not exists public.job_testimonials (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.jobs(id) on delete cascade,
  customer_id    uuid references public.customers(id) on delete set null,

  -- Public capture link: /testimonial/<share_token>. Unguessable, one per job.
  share_token    uuid not null unique default gen_random_uuid(),

  -- requested → submitted → approved | declined. published is approved + live.
  status         text not null default 'requested'
                 check (status in ('requested', 'submitted', 'approved', 'declined')),
  published      boolean not null default false,

  -- What the customer said.
  rating         smallint check (rating between 1 and 5),
  headline       text,
  body           text,
  video_url      text,
  photo_urls     text[] not null default '{}',

  -- What they agreed we may do with it. Default false — silence is not consent.
  consent_publish boolean not null default false,
  consent_name    boolean not null default false,
  consent_video   boolean not null default false,
  -- Name as the customer wants to be credited (may differ from the account name).
  display_name   text,

  requested_at   timestamptz not null default now(),
  reminded_at    timestamptz,
  submitted_at   timestamptz,
  reviewed_at    timestamptz,
  reviewed_by    uuid references auth.users(id) on delete set null,
  internal_notes text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One live request per job — asking twice reuses the row (and the link).
create unique index if not exists job_testimonials_job_idx on public.job_testimonials(job_id);
create index if not exists job_testimonials_status_idx on public.job_testimonials(status);

comment on table public.job_testimonials is
  'Customer testimonial requested against a job (S7). Collected via the tokenized public page /testimonial/<share_token>; never shown publicly until status = approved AND published AND consent_publish.';
comment on column public.job_testimonials.consent_publish is
  'Customer ticked "you may use this publicly". Without it the testimonial is internal feedback only, whatever its status.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Staff read/write through the portal; the public capture page never touches the
-- table directly — it goes through API routes on the service-role client, which
-- bypasses RLS. So there is deliberately NO anon policy here.
alter table public.job_testimonials enable row level security;

drop policy if exists "Staff can read testimonials" on public.job_testimonials;
create policy "Staff can read testimonials"
  on public.job_testimonials for select
  using ("current_role"() in ('admin'::user_role, 'manager'::user_role));

drop policy if exists "Staff can manage testimonials" on public.job_testimonials;
create policy "Staff can manage testimonials"
  on public.job_testimonials for all
  using ("current_role"() in ('admin'::user_role, 'manager'::user_role))
  with check ("current_role"() in ('admin'::user_role, 'manager'::user_role));

-- ── updated_at ───────────────────────────────────────────────────────────────
create or replace function public.tg_job_testimonials_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_job_testimonials_touch on public.job_testimonials;
create trigger trg_job_testimonials_touch
before update on public.job_testimonials
for each row execute function public.tg_job_testimonials_touch();

-- ── Media bucket ─────────────────────────────────────────────────────────────
-- Private: a customer's video is theirs until they say otherwise, so it is served
-- through signed URLs, never a public path.
insert into storage.buckets (id, name, public)
values ('testimonials', 'testimonials', false)
on conflict (id) do nothing;

-- ── Pipeline checklist ───────────────────────────────────────────────────────
-- The journey change: every job in flight gains the follow-up task, so this is a
-- step in the process and not something that depends on remembering.
insert into public.job_tasks (job_id, description, stage, sort_order)
select j.id, 'Testimonial requested (video if they''re willing)', 'follow_up', 90
from public.jobs j
where j.stage <> 'cancelled'
  and not exists (
    select 1 from public.job_tasks t
    where t.job_id = j.id and t.description like 'Testimonial requested%'
  );
