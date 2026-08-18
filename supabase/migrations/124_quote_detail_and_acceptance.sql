-- 124: the two remaining per-quote decisions about the customer document —
-- how much of the pricing it shows, and whether part of it can be bought.
--
-- 1. quote_version (detail level)
--    The column has existed since migration 002 ('simplified' | 'detailed')
--    and has never been read: every quote has rendered the simplified,
--    section-subtotal document. Matthew's rule is simplified by default and
--    detailed on request — a full line-by-line breakdown a customer can put
--    beside a competitor's. This makes the column live, so it is backfilled
--    and constrained here rather than left as free text.
--
-- 2. allow_partial_acceptance
--    A combined quote currently always lets the customer accept ONE work
--    package on its own at its standalone price. That is right for a customer
--    weighing three separate jobs and wrong when the work only makes sense — or
--    is only priced — as one job: a board upgrade that the new circuits depend
--    on cannot be the part left behind. Off means the accept page offers the
--    whole quote only, and the document stops offering parts.
--
-- Both defaults preserve today's behaviour on every existing quote.

update public.quote_requests
   set quote_version = 'simplified'
 where quote_version is null
    or quote_version not in ('simplified', 'detailed');

alter table public.quote_requests
  alter column quote_version set default 'simplified',
  alter column quote_version set not null;

alter table public.quote_requests
  drop constraint if exists quote_requests_quote_version_check;

alter table public.quote_requests
  add constraint quote_requests_quote_version_check
  check (quote_version in ('simplified', 'detailed'));

comment on column public.quote_requests.quote_version is
  'Customer document detail: simplified = section subtotals only; detailed = every line item with its quantity and price. Takes effect on the next generate.';

alter table public.quote_requests
  add column if not exists allow_partial_acceptance boolean not null default true;

comment on column public.quote_requests.allow_partial_acceptance is
  'May the customer accept one work package on its own at its standalone price? Off = the quote is all-or-nothing: the accept page offers only the whole quote and the document says so. Enforced server-side in /api/public/quote/[token]/accept.';
