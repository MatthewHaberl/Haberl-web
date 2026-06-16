-- Daily-briefing recipients: comma / space / semicolon separated email list that
-- receives the morning briefing (lib/quotes/daily-briefing.ts). Null or empty
-- falls back to contact_email. Kept in settings so recipients change without a
-- code deploy.
alter table public.company_settings
  add column if not exists briefing_emails text;
