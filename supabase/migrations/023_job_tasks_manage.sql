-- 023_job_tasks_manage.sql
-- 001 only granted select/update on job_tasks — managers need insert/delete
-- so the quote→job handover can create the standard install checklist.
create policy "Managers manage job tasks"
  on public.job_tasks for all
  using (public.current_role() in ('manager', 'admin'))
  with check (public.current_role() in ('manager', 'admin'));
