-- 098_lumax_mounting.sql
-- W55 — per-row mounting / racking BOM.
--
-- Two additions, both INSERT/ADD only. Nothing existing changes shape, and the
-- rows themselves live in the quote's system_design JSONB (no schema change for
-- the design model — same call as the AC/DC combiner internals).
--
-- 1. Panel physical dimensions. The mounting engine needs to know how long a row
--    of N panels actually is: rail length, splice count and clamp counts all
--    come off it. Nullable — a panel without dimensions falls back to a standard
--    1134 x 1762 x 30 mm module, and the engine says so.
--
-- 2. Lumax part numbers seeded as costless placeholders, exactly the pattern
--    earthing already uses: the BOM lists the part and marks it "Quote" until
--    Matthew loads Lumax pricing, rather than silently omitting the mounting.

alter table public.equipment_catalog
  add column if not exists width_mm  integer,
  add column if not exists height_mm integer,
  add column if not exists frame_mm  integer;

comment on column public.equipment_catalog.width_mm is
  'Module width in mm (short side). Drives per-row rail length in lib/solar/mounting-bom.ts. Null → 1134 mm default.';
comment on column public.equipment_catalog.height_mm is
  'Module height in mm (long side). Null → 1762 mm default.';
comment on column public.equipment_catalog.frame_mm is
  'Module frame thickness in mm — decides the clamp size. Null → 30 mm default.';

-- ── Lumax mounting placeholders ──────────────────────────────────────────────
-- cost_rands 0 => the BOM renders these as "Quote" lines (status 'no-cost'), so
-- they are visible and orderable without inventing a price.
insert into public.equipment_catalog
  (category, brand, sku, description, phase, cost_rands, active, sort_order, notes)
values
  ('mounting', 'Lumax', 'LM-SR-FOOT',            'Short-rail mounting foot (IBR / corrugated)',      'any', 0, true, 10, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LM-MC-30-35',           'Mid clamp 30–35 mm frame',                         'any', 0, true, 11, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LM-EC-30-35',           'End clamp 30–35 mm frame',                         'any', 0, true, 12, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'FS-S-SP-25X5.5-C4',     'Self-piercing tek screw 25×5.5 (C4)',              'any', 0, true, 13, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LM-KS-700',             'Klip-Lok clamp (non-penetrating)',                 'any', 0, true, 14, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LM-SSG',                'Standing-seam clamp (non-penetrating)',            'any', 0, true, 15, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LMK-RH-S-S',            'Tile roof hook (adjustable, stainless)',           'any', 0, true, 16, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LMK-RH-SL',             'Slate roof hook',                                  'any', 0, true, 17, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'FS-CS-10X100',          'Coach screw 10×100',                               'any', 0, true, 18, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LM-BF-15',              'Ballasted A-frame foot (flat concrete)',           'any', 0, true, 19, 'W55 mounting engine — ballast mass to confirm'),
  ('mounting', 'Lumax', 'LM-R42-SPLICE',         'Rail splice (R42 profile)',                        'any', 0, true, 20, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LM-R42-2150',           'Mounting rail R42 — 2150 mm',                      'any', 0, true, 21, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LM-R42-3150',           'Mounting rail R42 — 3150 mm',                      'any', 0, true, 22, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LM-R42-4150',           'Mounting rail R42 — 4150 mm',                      'any', 0, true, 23, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LM-R42-5150',           'Mounting rail R42 — 5150 mm',                      'any', 0, true, 24, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LM-R42-6200',           'Mounting rail R42 — 6200 mm',                      'any', 0, true, 25, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LM-EC-BOND',            'Earth bonding clip (module to rail)',              'any', 0, true, 26, 'W55 mounting engine — price from Lumax'),
  ('mounting', 'Lumax', 'LM-EL-6',               'Earth lug 6 mm² (array to earth bar)',             'any', 0, true, 27, 'W55 mounting engine — price from Lumax')
on conflict do nothing;
