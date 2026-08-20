-- 126: credits on a quote.
--
-- Money that comes off what a customer pays for this job, for a reason that has
-- nothing to do with what the job costs: a part back under warranty, a deposit
-- they have already paid, materials they bought themselves and we are paying
-- back, a discount given as a gesture.
--
-- There was no way to do any of it. Every price parser in both engines
-- deliberately refuses a negative number — a stray minus in a rate field must
-- never quietly credit a customer — so the only route was to fake one by
-- shaving a line item, which lies about what the work costs and leaves no
-- record of why.
--
-- So a credit lives OUTSIDE the bill of materials, in its own column: the
-- sections still add up to the price of the work, and the credit comes off the
-- bottom of the document with its reason printed next to it.
--
-- Shape is QuoteCredit[] (lib/quotes/credits.ts):
--   [{ "id": uuid, "kind": text, "label": text, "amountR": number>0,
--      "note": text|null, "createdAt": iso8601|null }]
--
-- `kind` is what makes this more than a discount field, because the kinds do
-- not behave the same. 'deposit_paid' and 'payment' are money already banked,
-- so they reduce the DEPOSIT still due; 'credit', 'refund', 'goodwill' and
-- 'other' reduce the BALANCE on completion and touch the deposit only once the
-- balance is gone. Reversing those would either ask a customer for the same
-- deposit twice or have the business ordering materials out of its own pocket
-- to settle a debt that isn't due until the job is finished.
--
-- amountR is always POSITIVE — the minus is applied by the arithmetic and by
-- the document, never stored, so a credit can never become a surcharge.
--
-- Default '[]' means every existing quote is unchanged: no credits, no rows on
-- the document, the same total it already had.

alter table public.quote_requests
  add column if not exists credits jsonb not null default '[]'::jsonb;

comment on column public.quote_requests.credits is
  'QuoteCredit[] (lib/quotes/credits.ts) — money deducted from the quote after the BOM: credit, deposit already paid, payment received, reimbursement, goodwill. Positive amounts only; kind decides whether it comes off the deposit or the balance. Reaches the document on the next generate, or via /api/quotes/[id]/credits on a quote already issued.';
