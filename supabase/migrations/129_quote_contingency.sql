-- 129: contingency on a quote.
--
-- Money added to a quote for the work nobody can see yet: the perished conduit
-- inside the wall, the DB that is fuller than the photo showed, the roof sheet
-- that cracks when it is lifted. There was no way to price any of it. Padding a
-- line item lies about what the part costs and leaves no record of why, and the
-- alternative — absorbing it — is the business paying for the customer's
-- surprises out of its own margin.
--
-- So it lives OUTSIDE both engines, in its own column, and is applied to the
-- finished BOM by lib/quotes/contingency.ts. That is what lets one
-- implementation serve the solar canvas and the scope builder alike: neither
-- designToBom nor scopeToBom needs to know it exists. It is the exact mirror of
-- credits (migration 126) — a credit is money off the bottom for a reason that
-- isn't about the job's cost; a contingency is money on for a reason that isn't
-- about a line item's price.
--
-- Shape is QuoteContingency (lib/quotes/contingency.ts):
--   { "enabled": bool, "basis": 'materials'|'labour'|'total'|'fixed'|'none',
--     "percent": number 0..100, "amountR": number>=0, "roundToR": number>=0,
--     "label": text, "show": bool, "note": text|null }
--
-- `basis` and `roundToR` compose: the allowance is worked out first (5% of
-- materials, say), then the total is taken up to the next round figure. Basis
-- 'none' with a roundToR is round-up on its own.
--
-- `show` decides whether the customer sees it as its own "Contingency" line or
-- whether it is folded into the labour line, the way the management fee already
-- is (migration 120). Either way the total is the same and the sections still
-- add up to it — this is about whether the customer is handed a row whose only
-- possible answer is "take that off".
--
-- Every number is stored POSITIVE and clamped on the way in. A negative
-- contingency would be a discount typed into the wrong box; discounts are
-- credits, and they carry a reason.
--
-- Default '{}' parses to disabled, so every existing quote is unchanged: no
-- allowance, no line on the document, the same total it already had.

alter table public.quote_requests
  add column if not exists contingency jsonb not null default '{}'::jsonb;

comment on column public.quote_requests.contingency is
  'QuoteContingency (lib/quotes/contingency.ts) — allowance added to the quote for unforeseen work: a percentage of materials/labour/total, a fixed amount, and/or rounding the total up to the next figure. `show` prints it as its own line or folds it into labour. Never part of the deposit. Applied to the BOM at generate time; {} means none.';
