-- 131: how much of the pricing behind a quote the CUSTOMER is shown.
--
-- Haberl is not VAT-registered, so every customer document states one set of
-- figures and a badge saying no VAT is added. That is right for a homeowner and
-- wrong for a customer who works in ex-VAT numbers because their own suppliers
-- quote that way: they are handed a price they then have to un-VAT by hand,
-- from a document that never says the 15% is in there at all.
--
-- Three levels, per quote, because this is a trust decision made customer by
-- customer and not a company-wide policy:
--
--   none       today's document. The default, and what every existing quote
--              keeps — a column added underneath a sent quote must not change
--              what the customer is already holding.
--   ex_vat     every amount also stated with no VAT in it: line, section
--              subtotal, package price, quote total, deposit, balance. Reveals
--              nothing about cost — the same prices, restated.
--   open_book  the above, plus what the supplier charges us ex-VAT for each
--              part and the percentage we add. This shows the customer our
--              margin on every line. Deliberately its own level.
--
-- Takes effect on the next generate, like every other document switch.

alter table public.quote_requests
  add column if not exists pricing_disclosure text not null default 'none';

alter table public.quote_requests
  drop constraint if exists quote_requests_pricing_disclosure_check;

alter table public.quote_requests
  add constraint quote_requests_pricing_disclosure_check
  check (pricing_disclosure in ('none', 'ex_vat', 'open_book'));

comment on column public.quote_requests.pricing_disclosure is
  'Customer-facing pricing transparency: none = prices only (default); ex_vat = every amount also shown with no VAT in it; open_book = also shows the supplier ex-VAT price and our markup per line. Takes effect on the next generate.';
