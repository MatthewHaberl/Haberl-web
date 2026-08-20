-- 127: reissuing a quote after it has been sent, and a record of how it went.
--
-- Two gaps, both of which end with a customer holding the wrong document.
--
-- 1. amendment_reason
--    A sent quote could be EDITED — the design canvas and the scope builder
--    never locked — but it could not be regenerated: /api/quotes/[id]/generate
--    refused anything past 'generated'. So the edit sat in the builder while
--    the customer's link kept serving the old document, with nothing on screen
--    saying so. Reissuing now flips the quote back to 'generated' for a fresh
--    send, and the reason for the change is carried here from the reissue to
--    the send that follows it, so it survives a page reload and lands on the
--    quote_versions row as the amendment trail (W56 already reads it).
--    Cleared once that send has taken it.
--
-- 2. sent_method / sent_by
--    "How was this quote sent?" had no answer. sent_at recorded WHEN, never
--    whether it was emailed, WhatsApped or handed over on site — which is the
--    first thing you need when a customer says they never got it. Recorded on
--    every send path, including a resend.
--
-- Every column is nullable with no default: an existing quote records what it
-- has always recorded, and simply doesn't know how it went out.

alter table public.quote_requests
  add column if not exists amendment_reason text,
  add column if not exists sent_method       text,
  add column if not exists sent_by           uuid references auth.users(id) on delete set null;

alter table public.quote_requests
  drop constraint if exists quote_requests_sent_method_check;

alter table public.quote_requests
  add constraint quote_requests_sent_method_check
  check (sent_method is null or sent_method in ('email', 'whatsapp', 'manual'));

comment on column public.quote_requests.amendment_reason is
  'Why this quote is being reissued. Set when a sent quote is regenerated (/api/quotes/[id]/generate with amend), consumed by the next send, which copies it onto the quote_versions row and clears it here.';

comment on column public.quote_requests.sent_method is
  'How the LAST send went out: email (Resend), whatsapp (wa.me share), manual (link copied / handed over). Null on a quote sent before this was recorded.';

comment on column public.quote_requests.sent_by is
  'Who sent it last. Distinct from generated_by, which is whoever built the quote.';
