-- 116 — Backfill PV panel Voc so the string-voltage check stops silently skipping.
--
-- WHY: lib/solar/compliance.ts panelThermal() reads equipment_catalog.voc_volts and
-- returns voc = null when it is empty. stringVoltageProfile() then returns null and
-- the Panels step renders a passive "add a datasheet Voc" line — so the 20 % edge-of-
-- cloud margin rule was NOT enforced on 95 of 128 panels. The value usually already
-- existed on the row in specs->>'voc_v' (Key Electric import) but was never promoted
-- to the column.
--
-- This migration is idempotent: every statement is guarded, so re-running (or pushing
-- after the same change was applied out of band) is a no-op.
--
-- PROVENANCE: values below come from specs->>'voc_v' (supplier feed) except the
-- explicitly-listed SKUs, which were read off manufacturer datasheets.

-- ── 1. Promote specs.voc_v → voc_volts where the column is empty ──────────────
-- Guarded on a plausible module range so junk in the feed can't land in the column.
-- Deliberately keyed on 'voc_v' only: the Photon portable panels carry
-- specs->>'marketed_voc_v' (distributor-marketed, unverified) and their notes say
-- "Voc left blank to keep string sizing honest" — they must stay blank.
-- The regex guard is load-bearing: Postgres does not promise WHERE-clause evaluation
-- order, so casting a non-numeric voc_v ("n/a", "TBC") could abort the whole migration.
update public.equipment_catalog
   set voc_volts = (specs->>'voc_v')::numeric
 where category = 'panel'
   and voc_volts is null
   and specs->>'voc_v' ~ '^[0-9]+(\.[0-9]+)?$'
   and (specs->>'voc_v')::numeric between 10 and 200;

-- ── 2. Datasheet-sourced values for panels with no specs.voc_v ────────────────
-- Each verified against the manufacturer datasheet, not parsed from the description.

-- Trina Vertex TSM-665-DE21 (2384×1303×35). Datasheet 665 W column: Voc 45.9 V.
-- NOTE: the row's own description says "Voc 45.7V" — that is the 660 W column of the
-- same datasheet. 45.9 is correct for 665 W.
update public.equipment_catalog
   set voc_volts = 45.9
 where category = 'panel' and sku = 'TRINA-665W-MONO' and voc_volts is null;

-- Canadian Solar HiKu7 CS7L-600MS (2172×1303×35). Datasheet V1.6C1 600 W: Voc 41.3 V.
update public.equipment_catalog
   set voc_volts = 41.3
 where category = 'panel' and sku = 'CS-600W' and voc_volts is null;

-- CNBM 80 W poly. Description carries "OCV:22.6V" (open-circuit voltage), internally
-- consistent with its 18.5 V Vmp / 4.58 A SCC. No manufacturer datasheet located.
update public.equipment_catalog
   set voc_volts = 22.6
 where category = 'panel' and sku = 'CNBM80W' and voc_volts is null;

-- ── 3. Correct one wrong existing column value ───────────────────────────────
-- JA Solar JAM66D45-605/LB (2382×1134×30, 33.1 kg): datasheet Voc 47.9 V, Isc 16.0 A.
-- The column held 47.16 V, which UNDERSTATES Voc and therefore permitted a longer
-- string than the panel allows — the unsafe direction. Fixed to the datasheet value.
update public.equipment_catalog
   set voc_volts = 47.9
 where category = 'panel' and sku = 'JAM66D45LB-605W' and voc_volts = 47.16;

-- ── 4. Repair specs.voc_v where it contradicts a verified column ──────────────
-- These three columns are correct (each verified against its datasheet); the specs
-- copies came from supplier free-text and are wrong or rounded. Fixing them so the
-- new column→specs fallback can never resurrect a bad number.
--   Astronergy CHSM78N(DG)/F-BH 625 W : datasheet Voc 56.01 (specs had 56.1)
--   Trina Vertex S TSM-425DE09R.08    : datasheet Voc 50.2  (specs had 47.2)
--   JA Solar JAM72S20-460/MR          : datasheet Voc 50.01 (specs had 50.1)
update public.equipment_catalog
   set specs = jsonb_set(specs, '{voc_v}', to_jsonb(voc_volts))
 where category = 'panel'
   and sku in ('CHSM78N(DG)-F-BH-625W', 'MONO-PANEL-425W', 'JAM72S-20-460-MR-MC4-SM')
   and voc_volts is not null
   and specs->>'voc_v' is not null
   and (specs->>'voc_v')::numeric is distinct from voc_volts;
