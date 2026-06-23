-- ============================================================
-- Migration 036: editable audit rules
-- The "soft rules" for assessing existing systems (and sanity-checking new
-- designs), now editable in-app under Settings -> Audit Rules. Seeded from the
-- wiki reference (Solar System Audit Rules). Distinct from the calculator's
-- DESIGN_RULES registry. Re-runnable: seed uses ON CONFLICT (code) DO NOTHING.
-- ============================================================

create table if not exists public.audit_rules (
  id          uuid primary key default uuid_generate_v4(),
  code        text unique not null,
  category    text not null,
  severity    text not null default 'warn',  -- block | warn | info
  title       text not null,
  detail      text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.audit_rules enable row level security;

create policy "Staff read audit rules"
  on public.audit_rules for select
  using (public.current_role() in ('field_worker', 'manager', 'admin'));

create policy "Admin insert audit rules"
  on public.audit_rules for insert
  with check (public.current_role() = 'admin');

create policy "Admin update audit rules"
  on public.audit_rules for update
  using (public.current_role() = 'admin');

create policy "Admin delete audit rules"
  on public.audit_rules for delete
  using (public.current_role() = 'admin');

insert into public.audit_rules (code, category, severity, title, detail) values
  ('ARR-01','Array & strings','warn','Opposing orientations on one MPPT','E/W or N/S panels on the same MPPT/string cause current mismatch (8-25% loss). Split per MPPT, or only combine if strings are even, same tilt, no shading.'),
  ('ARR-02','Array & strings','block','Unequal parallel strings on one MPPT','e.g. 4 + 6 is a permanent mismatch. Equalise to 4 + 4.'),
  ('ARR-03','Array & strings','warn','Mixed panel wattage or model in a string','Mismatch plus spares and warranty headaches.'),
  ('ARR-04','Array & strings','block','String Voc (cold) exceeds inverter max DC input','Over-voltage destroys the inverter. Use the coldest local temperature.'),
  ('ARR-05','Array & strings','warn','String Vmpp outside the inverter MPPT window','Poor tracking and clipping, lost yield.'),
  ('ARR-06','Array & strings','warn','Array current exceeds MPPT max input current','Clipping; check Isc headroom.'),
  ('ARR-07','Array & strings','info','Shading on part of a string','Drags the whole string; consider optimisers or re-stringing.'),
  ('INV-01','Inverter sizing','warn','DC:AC ratio outside ~1.0-1.3','Under = wasted inverter; over = heavy clipping.'),
  ('INV-02','Inverter sizing','warn','Inverter power below essential/peak load','Trips under load; size to the real peak.'),
  ('INV-03','Inverter sizing','block','Phase mismatch','Single-phase unit where supply/load is three-phase, or badly unbalanced across phases.'),
  ('INV-04','Inverter sizing','info','System type does not match the goal','Sanity-check hybrid/grid-tie/off-grid against backup expectations.'),
  ('PRO-01','Protection','block','Feeder breaker not re-sized after an inverter change','A 25 A feed is correct for 5 kW but wrong after a 15 kW upgrade. Recompute OCPD on every inverter change.'),
  ('PRO-02','Protection','warn','DC isolator / string fuse under-rated','Rating should be at least Isc x 1.25.'),
  ('PRO-03','Protection','warn','AC OCPD not sized to inverter output and cable','Nuisance trips or under-protection.'),
  ('PRO-04','Protection','info','Surge protection missing or under-rated','High value in SA - lightning and unstable grid.'),
  ('BAT-01','Battery','warn','Usable kWh below overnight/backup load','Will not last the night; drives battery sizing.'),
  ('BAT-02','Battery','warn','Battery C-rate below inverter/load power','Battery cannot deliver what the inverter demands.'),
  ('BAT-03','Battery','block','Mixing battery brands, chemistries or ages on one bus','BMS conflicts and safety.'),
  ('BAT-04','Battery','block','BMS comms protocol not supported by the inverter','Battery will not talk to the inverter.'),
  ('ERT-01','Earthing','block','No or insufficient earth electrode / main bonding','Safety and non-compliant.'),
  ('ERT-02','Earthing','warn','PV array frames / DC side not earthed','Shock and lightning path.'),
  ('ERT-03','Earthing','info','Equipotential bonding incomplete','Good-practice nudge.'),
  ('ENV-01','Environment','warn','Inverter poorly ventilated or unshaded','Overheat shutdowns - very common in SA climate.'),
  ('ENV-02','Environment','warn','Cable run voltage drop over limit','Lost yield; follow SANS guidance.'),
  ('ENV-03','Environment','info','Weak-grid overvoltage trips on return','Common with unstable supply; note for the customer.')
on conflict (code) do nothing;
