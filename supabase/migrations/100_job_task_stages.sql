-- 095_job_task_stages.sql
-- Job checklists were a flat list of 14 tasks in random order (job_tasks has a
-- uuid pk and the page ordered by it), so a crew on the Installation stage saw
-- "COC issued and filed" sitting next to today's work. Tag every task with the
-- pipeline stage it belongs to plus a stable sort order, so the job page can
-- show the current stage's tasks and fold the rest away.

alter table public.job_tasks
  add column if not exists stage text
    check (stage is null or stage in (
      'deposit_pending', 'procurement', 'scheduled', 'installation',
      'commissioning', 'coc', 'handover', 'follow_up', 'completed'
    )),
  add column if not exists sort_order integer not null default 0;

-- Backfill the standard install checklist. Matched on the leading words because
-- two creation paths seeded slightly different punctuation (em dash vs hyphen).
-- stage stays null for anything else — ad-hoc tasks show in an "Any stage" group.
update public.job_tasks set
  stage = case
    when description like 'Deposit invoice%'      then 'deposit_pending'
    when description like 'Deposit received%'     then 'deposit_pending'
    when description like 'Starred equipment%'    then 'procurement'
    when description like 'Stock received%'       then 'procurement'
    when description like 'Installation date%'    then 'scheduled'
    when description like 'Body corporate%'       then 'scheduled'
    when description like 'Site prep check%'      then 'scheduled'
    when description like 'Panels %'              then 'installation'
    when description like 'Inverter %'            then 'installation'
    when description like 'DB integration%'       then 'installation'
    when description like 'System commissioned%'  then 'commissioning'
    when description like 'COC issued%'           then 'coc'
    when description like 'Handover pack%'        then 'handover'
    when description like 'Follow-up call%'       then 'follow_up'
  end,
  sort_order = case
    when description like 'Deposit invoice%'      then 0
    when description like 'Deposit received%'     then 1
    when description like 'Starred equipment%'    then 2
    when description like 'Stock received%'       then 3
    when description like 'Installation date%'    then 4
    when description like 'Body corporate%'       then 5
    when description like 'Site prep check%'      then 6
    when description like 'Panels %'              then 7
    when description like 'Inverter %'            then 8
    when description like 'DB integration%'       then 9
    when description like 'System commissioned%'  then 10
    when description like 'COC issued%'           then 11
    when description like 'Handover pack%'        then 12
    when description like 'Follow-up call%'       then 13
    else 99
  end
where stage is null;

create index if not exists job_tasks_job_order_idx
  on public.job_tasks (job_id, sort_order);
