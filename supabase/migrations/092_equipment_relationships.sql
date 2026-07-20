-- ============================================================
-- 092: Catalog-level product compatibility relationships
--
-- Generates "works with" links between equipment_catalog items from the
-- structured specs extracted in 091, following the same SANS 10142-1 /
-- IEC 62548 rules the design engine (lib/solar/compliance.ts +
-- lib/solar/rules-registry.ts) enforces:
--
--   battery_for_inverter    RULE-INV-06 — battery voltage class must match the
--                           inverter battery input (24V↔24V, 48V-class covers
--                           48/51.2/52V, HV↔HV; never mix classes).
--   breaker_for_inverter    SANS §6.7.2 — AC breaker on the inverter feed:
--                           In ≥ rated output current, phase must match.
--   changeover_for_inverter SANS §7.12.4 / RULE-AC-01 — grid/inverter
--                           changeover, poles match phase, rating ≥ current.
--   spd_for_inverter        SANS §6.7.6 / RULE-AC-04 — Type 2 AC SPD,
--                           phase-matched.
--   spd_for_breaker         single-phase breakers pair with single-phase
--                           (1P+N/2P) SPDs, three-phase with 3P+N/4P.
--   changeover_for_breaker  changeover poles match the breaker's phase and
--                           carry at least its rated current.
--   dc_breaker_for_panel    RULE-STR-01/02 — series panels stack voltage:
--                           breaker DC rating ≥ cold string Voc (β −0.30%/°C
--                           at −2°C, +10% edge-of-cloud ⇒ ×1.189 of STC);
--                           In within 1.25–2.4 × Isc.
--   dc_isolator_for_panel   SANS §7.12.4 — string isolation, voltage-checked.
--   string_fuse_for_panel   IEC 62548 — gPV fuse 1.5–2.4 × Isc when parallel
--                           strings share an MPPT.
--   dc_spd_for_panel        SANS §6.7.6 — PV DC SPD, Uc ≥ string voltage.
--
-- Links are auto-generated (auto_generated = true) and rebuilt by calling
-- rebuild_equipment_relationships(); manual rows (auto_generated = false)
-- survive rebuilds.
-- ============================================================

create table if not exists public.equipment_relationships (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references public.equipment_catalog(id) on delete cascade,
  related_id uuid not null references public.equipment_catalog(id) on delete cascade,
  relationship_type text not null check (relationship_type in (
    'battery_for_inverter', 'breaker_for_inverter', 'changeover_for_inverter',
    'spd_for_inverter', 'dc_breaker_for_panel', 'dc_isolator_for_panel',
    'string_fuse_for_panel', 'dc_spd_for_panel', 'spd_for_breaker',
    'changeover_for_breaker', 'other'
  )),
  rule_key text,
  reason text,
  auto_generated boolean not null default true,
  active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  unique (item_id, related_id, relationship_type)
);

create index if not exists equipment_relationships_item_idx
  on public.equipment_relationships (item_id, active);
create index if not exists equipment_relationships_related_idx
  on public.equipment_relationships (related_id, active);

alter table public.equipment_relationships enable row level security;

drop policy if exists "Anyone can view equipment relationships" on public.equipment_relationships;
create policy "Anyone can view equipment relationships"
  on public.equipment_relationships for select
  using (active = true or public.current_role() in ('manager', 'admin'));

drop policy if exists "Staff manage equipment relationships" on public.equipment_relationships;
create policy "Staff manage equipment relationships"
  on public.equipment_relationships for all
  using (public.current_role() in ('manager', 'admin'));

-- ── The generator ───────────────────────────────────────────────
create or replace function public.rebuild_equipment_relationships()
returns integer
language plpgsql as $fn$
declare
  total integer := 0;
  n integer;
  -- Cold-morning design factor for string Voc, matching lib/solar/compliance.ts
  -- DEFAULT_CONDITIONS: βVoc −0.30 %/°C from 25 °C down to −2 °C (×1.081)
  -- stacked with the +10 % edge-of-cloud margin.
  voc_design_factor constant numeric := 1.081 * 1.10;
begin
  delete from public.equipment_relationships where auto_generated;

  -- Reusable candidate sets --------------------------------------------------
  drop table if exists _inv; drop table if exists _batt;
  drop table if exists _panel; drop table if exists _prot;
  create temp table _inv on commit drop as
    select id, brand, description, sku,
           coalesce((specs ->> 'kw')::numeric, watts_ac / 1000.0) as kw,
           (specs ->> 'battery_voltage_v')::numeric as batt_v,
           specs ->> 'battery_class' as batt_class,
           coalesce(specs ->> 'phase', nullif(phase, 'any')) as phase,
           (upper(brand) like '%SIGEN%' or upper(description) like '%SIGEN%') as is_sigen
    from public.equipment_catalog
    where category = 'inverter' and active and not coalesce(pending, false)
      and specs ->> 'device_type' = 'inverter';

  create temp table _batt on commit drop as
    select id, brand, description, sku,
           (specs ->> 'voltage_v')::numeric as volts,
           specs ->> 'voltage_class' as vclass,
           coalesce((specs ->> 'capacity_kwh')::numeric, kwh) as kwh,
           (specs ->> 'amp_hours')::numeric as ah,
           specs ->> 'chemistry' as chemistry,
           (upper(brand) like '%SIGEN%' or upper(description) like '%SIGEN%') as is_sigen,
           (description ~* '\[EOL\]|\(EOL\)|\yEOL\y') as eol
    from public.equipment_catalog
    where category = 'battery' and active and not coalesce(pending, false)
      and specs ->> 'device_type' = 'battery'
      and specs ->> 'voltage_class' is not null;

  create temp table _panel on commit drop as
    select id, brand, description, sku,
           coalesce((specs ->> 'voc_v')::numeric, voc_volts) as voc,
           coalesce((specs ->> 'isc_a')::numeric, isc_amps) as isc,
           coalesce((specs ->> 'watts')::numeric, watts_dc) as watts
    from public.equipment_catalog
    where category = 'panel' and active and not coalesce(pending, false)
      and specs ->> 'device_type' = 'panel'
      and coalesce((specs ->> 'voc_v')::numeric, voc_volts) is not null;

  create temp table _prot on commit drop as
    select id, brand, description, sku, category,
           specs ->> 'device_type' as device,
           (specs ->> 'amperage_a')::numeric as amps,
           (specs ->> 'poles')::int as poles,
           specs ->> 'pole_config' as pole_config,
           specs ->> 'current_type' as current_type,
           (specs ->> 'voltage_dc_v')::numeric as vdc,
           (specs ->> 'breaking_capacity_ka')::numeric as ka,
           specs ->> 'phase_class' as phase_class,
           specs ->> 'spd_class' as spd_class,
           specs ->> 'transfer' as transfer,
           (cost_rands is not null and cost_rands > 0) as costed,
           (description ~* '\[EOL\]|\(EOL\)|\yEOL\y') as eol
    from public.equipment_catalog
    where category in ('breaker', 'rccb', 'spd', 'disconnect', 'isolator', 'fuse')
      and active and not coalesce(pending, false);

  -- 1 ── battery_for_inverter (RULE-INV-06) ----------------------------------
  insert into public.equipment_relationships (item_id, related_id, relationship_type, rule_key, reason, priority)
  select i.id, c.id, 'battery_for_inverter', 'RULE-INV-06', c.reason, c.score
  from _inv i
  cross join lateral (
    select b.id,
      format('%s battery (%sV, %s-class) matches this inverter''s %s battery input — RULE-INV-06: never mix battery voltage classes.',
        coalesce(b.chemistry, 'Storage'), b.volts, b.vclass,
        case when i.batt_v is not null then i.batt_v || 'V' else 'HV' end) as reason,
      (case when upper(b.brand) = upper(i.brand) then 40 else 0 end
        + case when not b.eol then 20 else 0 end
        + case when b.kwh is not null then 10 else 0 end) as score
    from _batt b
    where (
        -- LV: explicit voltage match; the 48V class covers 48 / 51.2 / 52V
        (i.batt_v is not null and b.vclass = i.batt_v::text)
        -- HV stacks only on HV inverters (verify DC window at design time)
        or (i.batt_v is null and i.batt_class = 'HV' and b.vclass = 'HV')
      )
      -- Sigenergy is a proprietary ecosystem — brand-locked both ways
      and (not b.is_sigen or i.is_sigen)
      and (not i.is_sigen or b.is_sigen)
    order by score desc, b.kwh desc nulls last
    limit 12
  ) c
  on conflict do nothing;
  get diagnostics n = row_count; total := total + n;

  -- 2 ── breaker_for_inverter (SANS 10142-1 §6.7.2) --------------------------
  insert into public.equipment_relationships (item_id, related_id, relationship_type, rule_key, reason, priority)
  select i.id, c.id, 'breaker_for_inverter', 'SANS-6.7.2', c.reason, c.score
  from (select *, case when phase = 'three' then kw * 1000 / (1.732 * 400) else kw * 1000 / 230 end as i_rated
        from _inv where kw is not null and phase is not null) i
  cross join lateral (
    select p.id,
      format('%skW output ≈ %sA (%s) — %sA %s breaker covers it (SANS 10142-1 §6.7.2: In ≥ design current).',
        i.kw, round(i.i_rated),
        case i.phase when 'three' then 'three-phase 400V' else 'single-phase 230V' end,
        p.amps, coalesce(p.pole_config, '')) as reason,
      (case when upper(p.brand) = upper(i.brand) then 20 else 0 end
        + case when not p.eol then 20 else 0 end
        + case when p.costed then 10 else 0 end
        - least(round((p.amps - i.i_rated))::int, 40)) as score
    from _prot p
    where p.device in ('mcb', 'mccb') and p.current_type = 'AC'
      and p.phase_class = i.phase
      and p.amps >= i.i_rated
      and p.amps <= i.i_rated * 1.9
    order by score desc, p.amps asc
    limit 5
  ) c
  on conflict do nothing;
  get diagnostics n = row_count; total := total + n;

  -- 3 ── changeover_for_inverter (SANS §7.12.4 / RULE-AC-01) -----------------
  insert into public.equipment_relationships (item_id, related_id, relationship_type, rule_key, reason, priority)
  select i.id, c.id, 'changeover_for_inverter', 'RULE-AC-01', c.reason, c.score
  from (select *, case when phase = 'three' then kw * 1000 / (1.732 * 400) else kw * 1000 / 230 end as i_rated
        from _inv where kw is not null and phase is not null) i
  cross join lateral (
    select p.id,
      format('%s %sA %s changeover for grid/inverter transfer on a %skW %s inverter — SANS 10142-1 §7.12.4 requires AC isolation/changeover between inverter and grid.',
        initcap(coalesce(p.transfer, 'manual')), p.amps, coalesce(p.pole_config, ''), i.kw,
        initcap(i.phase) || '-phase') as reason,
      (case when upper(p.brand) = upper(i.brand) then 20 else 0 end
        + case when not p.eol then 20 else 0 end
        + case when p.costed then 10 else 0 end
        - least(round(p.amps / 10)::int, 40)) as score
    from _prot p
    where p.device = 'changeover'
      and ((i.phase = 'single' and p.poles = 2) or (i.phase = 'three' and p.poles in (3, 4)))
      and p.amps >= greatest(40, ceil(i.i_rated * 1.25))
      and p.amps <= greatest(160, i.i_rated * 4)
    order by score desc, p.amps asc
    limit 4
  ) c
  on conflict do nothing;
  get diagnostics n = row_count; total := total + n;

  -- 4 ── spd_for_inverter (SANS §6.7.6 / RULE-AC-04) -------------------------
  insert into public.equipment_relationships (item_id, related_id, relationship_type, rule_key, reason, priority)
  select i.id, c.id, 'spd_for_inverter', 'RULE-AC-04', c.reason, c.score
  from (select * from _inv where phase is not null) i
  cross join lateral (
    select p.id,
      format('%s AC surge arrester (%s%s) matches this %s inverter — SANS 10142-1 §6.7.6: Type 2 AC SPD is mandatory on every install.',
        case p.spd_class when '1+2' then 'Type 1+2' when '1' then 'Type 1' else 'Type 2' end,
        coalesce(p.pole_config, ''),
        coalesce(', ' || p.ka || 'kA', ''),
        initcap(i.phase) || '-phase') as reason,
      (case when upper(p.brand) = upper(i.brand) then 20 else 0 end
        + case when p.spd_class in ('2', '1+2') then 20 else 0 end
        + case when not p.eol then 20 else 0 end
        + case when p.costed then 10 else 0 end) as score
    from _prot p
    where p.device = 'spd' and p.current_type = 'AC'
      and p.phase_class = i.phase
    order by score desc, p.ka desc nulls last
    limit 3
  ) c
  on conflict do nothing;
  get diagnostics n = row_count; total := total + n;

  -- 5 ── spd_for_breaker (phase alignment) -----------------------------------
  insert into public.equipment_relationships (item_id, related_id, relationship_type, rule_key, reason, priority)
  select b.id, c.id, 'spd_for_breaker', 'SANS-6.7.6', c.reason, c.score
  from (select * from _prot where device in ('mcb', 'mccb') and current_type = 'AC' and phase_class is not null) b
  cross join lateral (
    select p.id,
      format('%s breaker (%s) pairs with a %s %s SPD%s — same phase configuration, SANS 10142-1 §6.7.6.',
        initcap(b.phase_class) || '-phase', coalesce(b.pole_config, ''),
        initcap(p.phase_class) || '-phase', coalesce(p.pole_config, ''),
        coalesce(' (' || p.ka || 'kA)', '')) as reason,
      (case when upper(p.brand) = upper(b.brand) then 30 else 0 end
        + case when p.spd_class in ('2', '1+2') then 20 else 0 end
        + case when not p.eol then 20 else 0 end
        + case when p.costed then 10 else 0 end) as score
    from _prot p
    where p.device = 'spd' and p.current_type = 'AC'
      and p.phase_class = b.phase_class
    order by score desc, p.ka desc nulls last
    limit 4
  ) c
  on conflict do nothing;
  get diagnostics n = row_count; total := total + n;

  -- 6 ── changeover_for_breaker (phase + rating alignment) -------------------
  insert into public.equipment_relationships (item_id, related_id, relationship_type, rule_key, reason, priority)
  select b.id, c.id, 'changeover_for_breaker', 'RULE-AC-01', c.reason, c.score
  from (select * from _prot where device in ('mcb', 'mccb') and current_type = 'AC'
          and phase_class is not null and amps is not null and amps >= 20) b
  cross join lateral (
    select p.id,
      format('%sA %s changeover carries this %sA %s breaker''s circuit (rating ≥ breaker, poles match phase).',
        p.amps, coalesce(p.pole_config, ''), b.amps, initcap(b.phase_class) || '-phase') as reason,
      (case when upper(p.brand) = upper(b.brand) then 20 else 0 end
        + case when not p.eol then 20 else 0 end
        + case when p.costed then 10 else 0 end
        - least(round((p.amps - b.amps) / 10)::int, 40)) as score
    from _prot p
    where p.device = 'changeover'
      and ((b.phase_class = 'single' and p.poles = 2) or (b.phase_class = 'three' and p.poles in (3, 4)))
      and p.amps >= b.amps
      and p.amps <= greatest(b.amps * 4, 125)
    order by score desc, p.amps asc
    limit 4
  ) c
  on conflict do nothing;
  get diagnostics n = row_count; total := total + n;

  -- 7 ── dc_breaker_for_panel (RULE-STR-01/02) -------------------------------
  insert into public.equipment_relationships (item_id, related_id, relationship_type, rule_key, reason, priority)
  select pa.id, c.id, 'dc_breaker_for_panel', 'RULE-STR-01', c.reason, c.score
  from (select * from _panel where isc is not null) pa
  cross join lateral (
    select p.id,
      format('Up to %s × %s in series: cold-morning string Voc ≈ %sV (%s × %sV, −2°C +10%% edge-of-cloud) stays under the breaker''s %sV DC rating; In %sA sits in the SANS/IEC 62548 band 1.25–2.4 × Isc (%sA).',
        floor(p.vdc / (pa.voc * voc_design_factor)), coalesce(nullif(pa.watts::text, '') || 'W panel', 'panel'),
        round(floor(p.vdc / (pa.voc * voc_design_factor)) * pa.voc * voc_design_factor),
        floor(p.vdc / (pa.voc * voc_design_factor)), pa.voc, p.vdc, p.amps, pa.isc) as reason,
      (case when p.poles = 2 then 30 when p.poles = 4 then 15 else 0 end
        + case when p.vdc >= 600 then 20 else 0 end
        + case when not p.eol then 20 else 0 end
        + case when p.costed then 10 else 0 end) as score
    from _prot p
    where p.device in ('mcb', 'mccb') and p.current_type = 'DC'
      and p.vdc is not null and p.amps is not null
      and floor(p.vdc / (pa.voc * voc_design_factor)) >= 2
      and p.amps >= ceil(pa.isc * 1.25)
      and p.amps <= pa.isc * 2.4
    order by score desc, p.vdc desc
    limit 6
  ) c
  on conflict do nothing;
  get diagnostics n = row_count; total := total + n;

  -- 8 ── dc_isolator_for_panel (SANS §7.12.4) --------------------------------
  insert into public.equipment_relationships (item_id, related_id, relationship_type, rule_key, reason, priority)
  select pa.id, c.id, 'dc_isolator_for_panel', 'SANS-7.12.4', c.reason, c.score
  from (select * from _panel where isc is not null) pa
  cross join lateral (
    select p.id,
      format('String isolator rated %sV DC / %sA — good for up to %s panels in series (cold Voc ≈ %sV) and ≥ 1.25 × Isc (%sA). SANS 10142-1 §7.12.4: DC isolation required on every string.',
        p.vdc, p.amps, floor(p.vdc / (pa.voc * voc_design_factor)),
        round(floor(p.vdc / (pa.voc * voc_design_factor)) * pa.voc * voc_design_factor), pa.isc) as reason,
      (case when p.vdc >= 1000 then 20 when p.vdc >= 600 then 10 else 0 end
        + case when not p.eol then 20 else 0 end
        + case when p.costed then 10 else 0 end) as score
    from _prot p
    where p.device = 'isolator' and p.current_type = 'DC'
      and p.vdc is not null and p.amps is not null
      and floor(p.vdc / (pa.voc * voc_design_factor)) >= 2
      and p.amps >= ceil(pa.isc * 1.25)
    order by score desc, p.vdc desc
    limit 4
  ) c
  on conflict do nothing;
  get diagnostics n = row_count; total := total + n;

  -- 9 ── string_fuse_for_panel (IEC 62548) -----------------------------------
  insert into public.equipment_relationships (item_id, related_id, relationship_type, rule_key, reason, priority)
  select pa.id, c.id, 'string_fuse_for_panel', 'IEC-62548', c.reason, c.score
  from (select * from _panel where isc is not null) pa
  cross join lateral (
    select p.id,
      format('gPV string fuse %sA%s — within the IEC 62548 band 1.5–2.4 × Isc (%sA). Required in both poles when more than one string shares an MPPT.',
        p.amps, coalesce(' / ' || p.vdc || 'V DC', ''), pa.isc) as reason,
      (case when p.vdc >= 1000 then 20 when p.vdc >= 600 then 10 else 0 end
        + case when not p.eol then 20 else 0 end
        + case when p.costed then 10 else 0 end) as score
    from _prot p
    where p.device = 'fuse' and p.current_type = 'DC'
      and p.amps is not null
      and (p.vdc is null or p.vdc >= 500)
      and p.amps >= pa.isc * 1.5
      and p.amps <= pa.isc * 2.4
    order by score desc
    limit 4
  ) c
  on conflict do nothing;
  get diagnostics n = row_count; total := total + n;

  -- 10 ── dc_spd_for_panel (SANS §6.7.6) -------------------------------------
  insert into public.equipment_relationships (item_id, related_id, relationship_type, rule_key, reason, priority)
  select pa.id, c.id, 'dc_spd_for_panel', 'SANS-6.7.6', c.reason, c.score
  from _panel pa
  cross join lateral (
    select p.id,
      format('PV DC surge arrester rated %sV DC — covers strings up to %s of these panels in series (cold Voc ≈ %sV). SANS 10142-1 §6.7.6: DC SPD is mandatory on the PV side.',
        p.vdc, floor(p.vdc / (pa.voc * voc_design_factor)),
        round(floor(p.vdc / (pa.voc * voc_design_factor)) * pa.voc * voc_design_factor)) as reason,
      (case when p.spd_class in ('2', '1+2') then 20 else 0 end
        + case when not p.eol then 20 else 0 end
        + case when p.costed then 10 else 0 end) as score
    from _prot p
    where p.device = 'spd' and p.current_type = 'DC'
      and p.vdc is not null and p.vdc between 500 and 1600
      and floor(p.vdc / (pa.voc * voc_design_factor)) >= 2
    order by score desc, p.vdc desc
    limit 3
  ) c
  on conflict do nothing;
  get diagnostics n = row_count; total := total + n;

  return total;
end;
$fn$;

-- Build the graph now.
select public.rebuild_equipment_relationships();
