-- ── Portal issue tickets ─────────────────────────────────────────
-- A lightweight "report an issue" channel for anyone using the portal.
-- A floating widget (bottom-right, where the public WhatsApp FAB sits on
-- customer pages) lets staff and customers file teething issues the moment
-- they spot them. Tickets are reviewed by admins on /portal/employee/tickets,
-- and an email is sent to the team on each new ticket.
--
-- RLS is enabled with NO policies on purpose: the table is reachable only
-- through the service-role client in server routes (app/api/tickets/*),
-- which gate access with app-level role checks. No direct client access.

create table if not exists public.portal_tickets (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  message        text not null,
  category       text not null default 'issue'
                   check (category in ('issue', 'idea', 'question')),
  status         text not null default 'open'
                   check (status in ('open', 'in_progress', 'resolved', 'closed')),
  page_url       text,
  user_agent     text,
  reported_by    uuid references public.user_profiles(id),
  reporter_name  text,
  reporter_email text,
  reporter_role  text,
  resolved_at    timestamptz,
  resolved_by    uuid references public.user_profiles(id),
  admin_note     text
);

comment on table public.portal_tickets is
  'In-portal "report an issue" submissions (teething-issue feedback). Read/written only via service-role server routes; see app/api/tickets.';

-- The admin Tickets list opens on the active queue first.
create index if not exists portal_tickets_active_idx
  on public.portal_tickets (created_at desc) where status in ('open', 'in_progress');

alter table public.portal_tickets enable row level security;
-- Intentionally no policies: access is service-role-only via server routes.
