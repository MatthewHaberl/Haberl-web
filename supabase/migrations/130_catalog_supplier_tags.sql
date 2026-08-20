-- 130_catalog_supplier_tags.sql
-- Supplier status tags must never reach a customer.
--
-- Migration 128 did this for "[EOL]". The same problem remains for the rest of
-- Key Electric's price-list vocabulary, which arrived inside the description
-- text and therefore travels onto the quote pickers, the web store and the
-- customer's quote document:
--
--   [NEW]                     25 rows   marketing, ages out          -> drop
--   [UNI]                     13 rows   "generic range" marker       -> drop
--   [10MT]                     5 rows   duplicates the "10M" already
--                                       in each description          -> drop
--   [ECO]                      1 row    price tier, also in the SKU  -> drop
--   [PROMO WHILE STOCKS LAST]  7 rows   a promise about Key's stock  -> drop
--   [TEMP OUT OF STOCK]        1 row    real availability signal     -> column
--   (DO NOT USE -
--    DUPLICATE CODE)           1 row    internal warning, and ACTIVE -> notes
--
-- 53 descriptions change in total. The rules live in lib/catalog/supplier-tags.ts
-- and the patterns below mirror that module — see it for the reasoning behind
-- each classification, and keep the two in step.
--
-- Two things this deliberately does NOT touch:
--
--   * "[NEW GEN]" / "[OLD GEN]" on the Volta batteries. Three rows share one
--     description; the generation marker is the only text distinguishing
--     VOLTA-STAGE1-NEWGEN (R16 189.76) from VOLTA-STAGE1-OG (R17 249.54).
--     Strip it and staff cannot tell them apart in the picker.
--
--   * Anything lowercase. Key's price list shouts, so "[NEW]" is theirs; the
--     three "(New)" rows are SolarEdge entries typed here (supplier is null),
--     and in "SolarEdge Synergy (New) Unit with RSD 33.3kW" the qualifier sits
--     mid-name doing real work. Every regex below is case-SENSITIVE for that
--     reason — note the 'g' flags, never 'gi'.

-- 1. The flag ----------------------------------------------------------------
alter table public.equipment_catalog
  add column if not exists temporarily_out_of_stock boolean not null default false;

comment on column public.equipment_catalog.temporarily_out_of_stock is
  'Supplier is out of stock for now — staff see a badge before they quote it. Unlike end_of_life this is transient and nothing clears it automatically, so it deliberately does NOT hide the item from the web store or block quoting; it is a warning, not a gate. Parsed from the "[TEMP OUT OF STOCK]" description marker on import — see lib/catalog/supplier-tags.ts.';

create index if not exists equipment_catalog_temporarily_out_of_stock_idx
  on public.equipment_catalog (temporarily_out_of_stock) where temporarily_out_of_stock;

-- 2. Backfill the stock flag before the marker is stripped --------------------
update public.equipment_catalog
set temporarily_out_of_stock = true
where not temporarily_out_of_stock
  and (description ~ '[[({][[:space:]]*TEMP OUT OF STOCK[[:space:]]*[])}]'
    or shop_description ~ '[[({][[:space:]]*TEMP OUT OF STOCK[[:space:]]*[])}]');

-- 3. Move the duplicate-code warning to notes before stripping it -------------
-- HCT114 is active, so this internal instruction was one quote away from
-- printing in front of a customer. The warning itself is real and stays.
-- Guarded so a re-run cannot append it twice.
update public.equipment_catalog
set notes = case
      when notes is null or btrim(notes) = ''
        then 'Key Electric flagged this as a duplicate code — do not use. See the catalog de-duplication pass.'
      else notes || E'\n' || 'Key Electric flagged this as a duplicate code — do not use. See the catalog de-duplication pass.'
    end
where description ~ '[[({][[:space:]]*DO NOT USE - DUPLICATE CODE[[:space:]]*[])}]'
  and (notes is null or notes not like '%duplicate code%');

-- 4. Strip every recognised tag out of the customer-visible text --------------
-- A closing bracket is required, which is what keeps "[NEW GEN]" out of the
-- "NEW" alternative's reach: after NEW comes " GEN]", and the pattern cannot
-- cross it. Openers and closers are matched independently because the source
-- spreadsheets mismatch them ("{A}18V", "{NO COIL)", "{EOL]" all appear live).
--
-- The whitespace collapse runs only on rows that actually carried a tag. 257
-- untagged descriptions contain a stray double space; tidying unconditionally
-- would rewrite all of them and bury this 53-row change in noise.
update public.equipment_catalog
set description = nullif(btrim(regexp_replace(
      regexp_replace(
        description,
        '[[({][[:space:]]*(NEW|UNI|10MT|ECO|PROMO WHILE STOCKS LAST|TEMP OUT OF STOCK|DO NOT USE - DUPLICATE CODE)[[:space:]]*[])}][[:space:]]*[-–—:]?[[:space:]]*',
        '', 'g'),
      '[[:space:]]{2,}', ' ', 'g')), ''),
    shop_description = nullif(btrim(regexp_replace(
      regexp_replace(
        coalesce(shop_description, ''),
        '[[({][[:space:]]*(NEW|UNI|10MT|ECO|PROMO WHILE STOCKS LAST|TEMP OUT OF STOCK|DO NOT USE - DUPLICATE CODE)[[:space:]]*[])}][[:space:]]*[-–—:]?[[:space:]]*',
        '', 'g'),
      '[[:space:]]{2,}', ' ', 'g')), '')
where description ~ '[[({][[:space:]]*(NEW|UNI|10MT|ECO|PROMO WHILE STOCKS LAST|TEMP OUT OF STOCK|DO NOT USE - DUPLICATE CODE)[[:space:]]*[])}]'
   or shop_description ~ '[[({][[:space:]]*(NEW|UNI|10MT|ECO|PROMO WHILE STOCKS LAST|TEMP OUT OF STOCK|DO NOT USE - DUPLICATE CODE)[[:space:]]*[])}]';

-- No step 5. trg_sync_catalog_to_store (migration 048) is an unqualified
-- "after insert or update or delete ... for each row", so the update above
-- already re-mirrors the cleaned text into products for anything listed. As it
-- happens all 53 rows are show_on_store = false today, but the trigger means
-- that is not something this migration has to rely on.
