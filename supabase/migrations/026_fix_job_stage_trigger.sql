-- Bug fix: migration 022 wrote job_status_history from a BEFORE INSERT
-- trigger — at that point the job row doesn't exist yet, so the history FK
-- (job_status_history.job_id → jobs.id) failed and EVERY job insert errored.
-- Split the work: BEFORE mutates the row (derived status, completed_at),
-- AFTER writes the history timeline.

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

  return new;
end;
$$;

create or replace function public.log_job_stage_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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

drop trigger if exists job_stage_history on public.jobs;
create trigger job_stage_history
  after insert or update of stage on public.jobs
  for each row execute function public.log_job_stage_history();
