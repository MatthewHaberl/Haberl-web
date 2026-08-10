-- ORPHANED FUNCTION — recovered from the live database, not from migration history.
--
-- public.extract_equipment_specs() exists in production but is defined by NO
-- migration: not in this repo, and not in supabase_migrations.schema_migrations
-- (verified — zero recorded migrations contain its definition). It is depended on
-- by 20260719235555_091_equipment_spec_extraction.sql and by the
-- trg_extract_specs trigger on equipment_catalog.
--
-- Without this file a database rebuilt from migrations alone would be missing the
-- function and the 091 migration would fail. Captured here via pg_get_functiondef
-- so the repo can stand on its own. The timestamp in the filename is arbitrary
-- (set just before the 091 record) because the real apply time is unknown.
--
-- Parses free-text supplier descriptions/SKUs into structured `specs` jsonb.
-- Helpers public.catalog_spec_num / catalog_spec_num_max are defined elsewhere.

CREATE OR REPLACE FUNCTION public.extract_equipment_specs(p_category text, p_description text, p_sku text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
AS $function$
declare
  d text := upper(coalesce(p_description, '') || ' ' || coalesce(p_sku, ''));
  s text;                     -- working copy with consumed tokens stripped
  spec jsonb := '{}'::jsonb;
  m text[];
  device text;
  is_dc boolean := false;
  amps numeric; poles int; pole_config text; ka numeric; curve text;
  vdc numeric; vdc_pole numeric; vac numeric;
  ah numeric; kwh numeric; volts numeric; vclass text;
  kw numeric; kva numeric; batt_v numeric;
  watts numeric; voc numeric; isc numeric;
begin
  if d = ' ' then return spec; end if;
  s := d;

  -- breaking capacity: take the largest kA figure ("15/40KA" → 40)
  ka := public.catalog_spec_num_max(s, '(\d+(?:\.\d+)?)\s*KA');
  s := regexp_replace(s, '\d+(\.\d+)?\s*KA', ' ', 'g');

  -- amp-hours before amps ("100AH" must not read as 100A)
  ah := public.catalog_spec_num(s, '(\d+(?:\.\d+)?)\s*AH\y');
  s := regexp_replace(s, '\d+(\.\d+)?\s*AH\y', ' ', 'g');

  -- DC voltage: "500VDC" / "1000vDC" / "125V DC" / "DC 110V" / "110VDC/POLE"
  vdc_pole := public.catalog_spec_num(s, '(\d{2,4})\s*V?VDC?\s*/\s*POLE');
  vdc := greatest(
    public.catalog_spec_num_max(s, '(\d{2,4}(?:\.\d+)?)\s*VDC'),
    public.catalog_spec_num_max(s, '(\d{2,4}(?:\.\d+)?)\s*V\s+DC\y'),
    public.catalog_spec_num_max(s, '\yDC\s*(\d{2,4})\s*V'),
    public.catalog_spec_num_max(s, '(\d{2,4}(?:\.\d+)?)\s*VOLT?S?\s*DC')
  );
  -- AC voltage ("275V", "230VAC", "230/400")
  vac := coalesce(
    public.catalog_spec_num_max(s, '(\d{3})\s*VAC'),
    public.catalog_spec_num_max(s, '(\d{3})\s*V\s*AC\y'),
    case when s ~ '230\s*/\s*400' then 400 else null end
  );

  is_dc := vdc is not null
    or s ~ '\yV?DC\y' or s ~ 'GPV' or (p_category in ('breaker','isolator','spd','fuse','fuseholder','disconnect') and s ~ '\yPV\y');
  -- "DC ISOLATOR ... 1000V": bare voltage on a DC device is its DC rating
  if is_dc and vdc is null then
    vdc := public.catalog_spec_num_max(s, '(\d{3,4})\s*V\y');
  end if;

  -- strip voltage-ish tokens so they can't be misread as amps ("3000VA", "240VAC")
  s := regexp_replace(s, '\d+(\.\d+)?\s*V(A|AC|DC|OC|OLTS?)?(?![A-Z0-9])', ' ', 'g');
  s := regexp_replace(s, '\d+(\.\d+)?\s*(K?VA|VOC|KWH|KWP?|W)\y', ' ', 'g');

  -- amps: adjustable ranges take the upper bound ("202-320A", "6-10A")
  amps := coalesce(
    public.catalog_spec_num(s, '\d+\s*-\s*(\d+(?:\.\d+)?)\s*A(?![A-Z0-9])'),
    public.catalog_spec_num_max(s, '(\d+(?:\.\d+)?)\s*A(?![A-Z0-9])')
  );

  -- poles / pole configuration ("3+1" / "1+1" are SPD shorthand for 3P+N / 1P+N)
  if d ~ '3\s*PH?\s*\+\s*N' or d ~ '\y3\s*\+\s*1\y' then poles := 4; pole_config := '3P+N';
  elsif d ~ '1\s*P?\s*\+\s*N(PE)?' or d ~ '\y1\s*\+\s*1\y' then poles := 2; pole_config := '1P+N';
  elsif d ~ '(\d)\s*P(?![A-Z0-9])' then
    poles := (regexp_match(d, '(\d)\s*P(?![A-Z0-9])'))[1]::int;
    pole_config := poles || 'P';
  elsif d ~ '(\d)\s*POLE' then
    poles := (regexp_match(d, '(\d)\s*POLE'))[1]::int;
    pole_config := poles || 'P';
  elsif d ~ '\yDP\y' then poles := 2; pole_config := '2P';
  elsif d ~ '\yTP\y' then poles := 3; pole_config := '3P';
  elsif d ~ '\ySP\y' then poles := 1; pole_config := '1P';
  end if;

  -- trip curve: "C-CURVE" / "C-CURCE" (typo) / "CURVE C" / Siemens ",C2" / SKU "-C25"
  curve := coalesce(
    (regexp_match(d, '\y([BCD])[- ]?CUR'))[1],
    (regexp_match(d, 'CURVE\s*([BCD])\y'))[1],
    (regexp_match(d, ',\s*([BCD])\d'))[1],
    case when p_category = 'breaker' then (regexp_match(coalesce(upper(p_sku), ''), '-([BCD])\d+(?![0-9A-Z])'))[1] end
  );

  -- ── Device typing per category ─────────────────────────────────
  if p_category in ('breaker', 'rccb') then
    if p_category = 'rccb' or d ~ 'RCCB|RCBO|EARTH ?LEAK|ELCB' then
      device := case when d ~ 'RCBO' then 'rcbo' else 'rccb' end;
      spec := spec || jsonb_strip_nulls(jsonb_build_object(
        'sensitivity_ma', public.catalog_spec_num(d, '(\d+)\s*MA\y')));
    elsif d ~ 'MCCB|MOULDED|NSX|GOMCCB|\yFRAME\y' then device := 'mccb';
    elsif d ~ 'GV2|THER\y|THERMAL MAG|MOTOR' then device := 'mpcb';
    else device := 'mcb';
    end if;

  elsif p_category = 'spd' then
    if d ~ 'LED|FLOOD|LUMEN|\dLM\y|DAY/NIGHT|MHZ|POLYPHASER|LIGHTNING CONDUCTOR|DOWN CONDUCTOR|EARTH ROD' then
      device := 'other';
    elsif d ~ 'COMBINER' then
      device := 'combiner';
    else
      device := 'spd';
      spec := spec || jsonb_strip_nulls(jsonb_build_object(
        'spd_class',
        case
          when d ~ 'TYPE ?1\s*\+\s*(TYPE ?)?2|T1\s*\+\s*T2|CLASS ?I\s*\+\s*II' then '1+2'
          when d ~ 'TYPE ?2|\yT2\y|CLASS ?(II|2)\y' then '2'
          when d ~ 'TYPE ?1|\yT1\y|CLASS ?(I|1)\y' then '1'
        end));
    end if;

  elsif p_category in ('disconnect', 'isolator') then
    if d ~ 'CHANGE ?OVER' then
      device := 'changeover';
      spec := spec || jsonb_build_object(
        'transfer', case when d ~ 'AUTO|MOTORI[SZ]ED|\yATS\y|ATYS' then 'auto' else 'manual' end);
    elsif d ~ 'ISOL' then device := 'isolator';
    else device := 'disconnect';
    end if;

  elsif p_category = 'fuse' then      device := 'fuse';
  elsif p_category = 'fuseholder' then device := 'fuseholder';

  elsif p_category = 'inverter' then
    if d ~ 'SCREW|SPARE|MAIN ?BOARD|BOARD ONLY|WHEEL|\yFAN\y|\yLCD\y|BRACKET' then
      device := 'inverter_part';
    elsif d ~ 'CHANGE ?OVER' then
      device := 'changeover_db';
    elsif d ~ '\yUPS\y|\yDUPS\y' and d !~ 'HYBRID|SOLAR|MPPT' then
      device := 'ups';
    elsif d ~ 'INVERTER|EASYSOLAR|MULTIPLUS|SUNSYNK|\yPCS\y' then
      device := 'inverter';
    else
      device := 'other';
    end if;

    if device = 'inverter' then
      kw  := public.catalog_spec_num(d, '(\d+(?:\.\d+)?)\s*KW(?!H)');
      kva := coalesce(
        public.catalog_spec_num(d, '(\d+(?:\.\d+)?)\s*KVA\y'),
        public.catalog_spec_num(d, '(\d{3,5})\s*VA\y') / 1000,
        -- Victron model code "48/5000/70" = battery V / VA / charge A
        public.catalog_spec_num(d, '\y(?:12|24|36|48)/(\d{3,5})/') / 1000);
      if kw is null and kva is not null then kw := round(kva * 0.8, 1); end if;
      -- battery bank voltage: "48VDC", "48V", Victron "48/5000/70"
      batt_v := coalesce(
        public.catalog_spec_num(d, '\y(12|24|36|48)\s*VDC\y'),
        public.catalog_spec_num(d, '\y(12|24|36|48)/\d{3,5}'),
        public.catalog_spec_num(d, '\y(12|24|36|48)\s*V\y'));
      m := regexp_match(d, 'PPT[:\s]*(\d{2,3})\s*V?\s*[-–]\s*(\d{3,4})\s*V');
      if m is null then m := regexp_match(d, '(\d{2,3})\s*V?\s*[-–]\s*(\d{3,4})\s*VDC'); end if;
      spec := spec || jsonb_strip_nulls(jsonb_build_object(
        'kw', kw, 'kva', kva,
        'battery_voltage_v', batt_v,
        'battery_class', case
          when batt_v is not null then 'LV'
          when d ~ '\yHV\y' then 'HV'
          when d ~ '\yLV\y' then 'LV'
        end,
        'phase', case
          when d ~ '3\s*-?\s*PH|THREE ?PHASE|\y3P\y' then 'three'
          when d ~ '1\s*-?\s*PH|SINGLE ?PHASE|\y1P\y' then 'single'
        end,
        'mppt_min_v', m[1]::numeric,
        'mppt_max_v', m[2]::numeric,
        'max_pv_voc_v', coalesce(
          public.catalog_spec_num(d, 'MAX VOC\s*\(?(\d{3,4})'),
          public.catalog_spec_num(d, '(\d{3,4})\s*VOC'),
          public.catalog_spec_num(d, '\y(600|800|1000|1100|1500)\s*V\y')),
        'inverter_type', case
          when d ~ 'HYBRID' then 'hybrid'
          when d ~ 'OFF[ -]?GRID' then 'offgrid'
          when d ~ 'GRID[ -]?TIE' then 'gridtie'
        end));
    end if;

  elsif p_category = 'battery' then
    volts := coalesce(
      public.catalog_spec_num(d, '(\d{2,3}(?:\.\d+)?)\s*VDC\y'),
      public.catalog_spec_num(d, '(\d{2,3}(?:\.\d+)?)\s*V\y'),
      public.catalog_spec_num(d, '(\d{2,3})\s*VOLT'));
    kwh := coalesce(
      public.catalog_spec_num(d, '(\d+(?:\.\d+)?)\s*KWH\y'),
      public.catalog_spec_num(d, '(\d+(?:\.\d+)?)\s*KW\y'));
    if d ~ 'CHARGER|CABINET|LABEL|EXTINGUI|JUNCTION|CONNECTOR|\yPLUG\y|CABLE|BALANCER|SENSOR|\yPSU\y|POWER SUPPLY|COMPRESSOR|SONOFF|REMOTE|SCREW|\yKIT\y|RACK\y|WHEELS' then
      device := 'battery_accessory';
    elsif d ~ 'COIN|CR\d|\yAAA?\y|ALKALINE|\yA23\y|ENERGIZER|RYOBI|WORX|INGCO|MAC-AFRIC|STARTER' then
      device := 'battery_small';
    elsif coalesce(kwh, 0) >= 1 or coalesce(ah, 0) >= 50 or (volts is not null and d ~ 'LIFEPO4|LI-?ION|LITHIUM|AGM|GEL|VRLA|DEEP CYCLE') then
      device := case when coalesce(kwh, 0) >= 1 or coalesce(ah, 0) >= 50 then 'battery' else 'battery_small' end;
    else
      device := 'battery_small';
    end if;
    if device = 'battery' then
      vclass := case
        when volts is null then null
        when volts between 11 and 15.9 then '12'
        when volts between 20 and 30 then '24'
        when volts between 34 and 39 then '36'
        when volts between 44 and 60 then '48'   -- 48 / 51.2 / 52V all one class
        when volts > 90 then 'HV'
      end;
      spec := spec || jsonb_strip_nulls(jsonb_build_object(
        'voltage_v', volts,
        'voltage_class', vclass,
        'amp_hours', ah,
        'capacity_kwh', kwh,
        'chemistry', case
          when d ~ 'LIFEPO4|LFP\y|LIFEP04' then 'LiFePO4'
          when d ~ 'LI-?ION|LITHIUM' then 'Li-ion'
          when d ~ 'AGM' then 'AGM'
          when d ~ 'GEL' then 'Gel'
          when d ~ 'VRLA' then 'VRLA'
          when d ~ 'EFB' then 'EFB'
        end));
    end if;

  elsif p_category = 'panel' then
    if d ~ 'SOLAR PANEL|\yPV MODULE\y|BIFACIAL|\yMONO\y|TIER' then
      device := 'panel';
      watts := public.catalog_spec_num(d, '\y([1-9]\d{2,3})\s*WP?\y');
      voc := public.catalog_spec_num(d, '(\d{2}(?:\.\d+)?)\s*VOC');
      -- Isc usually rides right after the Voc figure: "55.61Voc 13.95A"
      isc := public.catalog_spec_num(regexp_replace(d, '\d+(\.\d+)?\s*VOC', ' ', 'g'), '\y(\d{1,2}(?:\.\d+)?)\s*A(?![A-Z0-9])');
      if isc is not null and (isc < 5 or isc > 25) then isc := null; end if;
      if watts is not null and (watts < 100 or watts > 800) then watts := null; end if;
      spec := spec || jsonb_strip_nulls(jsonb_build_object(
        'watts', watts, 'voc_v', voc, 'isc_a', isc,
        'technology', case
          when d ~ 'BIFACIAL' then 'bifacial'
          when d ~ '\yMONO\y' then 'mono'
          when d ~ '\yPOLY\y' then 'poly'
        end,
        'tier1', case when d ~ 'TIER[ -]?1' then true end));
    else
      device := 'other';
    end if;
  end if;

  -- ── Shared keys for protection / switching gear ────────────────
  if p_category in ('breaker', 'rccb', 'spd', 'disconnect', 'isolator', 'fuse', 'fuseholder')
     and device not in ('other', 'combiner') then
    if vdc is null and vdc_pole is not null and poles is not null then
      vdc := vdc_pole * poles;
    end if;
    spec := spec || jsonb_strip_nulls(jsonb_build_object(
      'amperage_a', amps,
      'poles', poles,
      'pole_config', pole_config,
      'breaking_capacity_ka', ka,
      'curve', curve,
      'current_type', case when is_dc then 'DC' else 'AC' end,
      'voltage_dc_v', vdc,
      'voltage_dc_per_pole_v', vdc_pole,
      'voltage_ac_v', case when not is_dc then vac end,
      'voltage_v', coalesce(vdc, vac),
      'phase_class', case
        when is_dc then null
        when poles in (1, 2) then 'single'
        when poles in (3, 4) then 'three'
      end));
  end if;

  spec := spec || jsonb_strip_nulls(jsonb_build_object('device_type', device));
  return spec;
end;
$function$;
