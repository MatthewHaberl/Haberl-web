// Single registry of every design / compliance rule the quoting engine knows.
// Sources: SANS 10142-1:2024 Ed 3.2, haberl-solar/docs/design-rules.md (field-
// learned rules with real-job WHY notes), and manufacturer datasheets (specs
// verified 2026-06-10 and stored in equipment_catalog notes).
//
// enforcement:
//  'calculator' — the BOM builder applies it automatically (quote-calculator.ts)
//  'verifier'   — runComplianceChecks() audits the final BOM (compliance.ts)
//  'both'       — applied by the calculator AND independently re-verified
//  'site'       — site-work reminder surfaced on every quote (info check)
//  'commercial' — pricing/process rule applied at quote level

export type RuleEnforcement = 'calculator' | 'verifier' | 'both' | 'site' | 'commercial'

export interface DesignRule {
  id: string
  category: string
  title: string
  rule: string
  why: string
  reference: string
  enforcement: RuleEnforcement
  /** id of the live compliance check this rule maps to, when verifier-enforced */
  checkId?: string
}

export const RULE_CATEGORIES = [
  'System Sizing',
  'String Design & Physics',
  'DC Protection',
  'AC & Distribution Board',
  'Earthing & Bonding',
  'Battery System',
  'EV Charger',
  'Cabling, Conduit & Glands',
  'Materials & BOM',
  'Pricing & Commercial',
  'Compliance & Paperwork',
] as const

export const DESIGN_RULES: DesignRule[] = [
  // ── System Sizing ───────────────────────────────────────────────────────────
  {
    id: 'SZ-01', category: 'System Sizing', title: 'Battery sized to essential load × backup hours',
    rule: 'Battery kWh = essential load (kW) × backup hours required — never sized to total household load. Rounded up to the next available battery size, with a floor of 2kWh per inverter kW.',
    why: 'Customers want lights, fridge, Wi-Fi and TV through load shedding — not the oven, geyser and pool pump. Sizing to total load doubles the price for no benefit.',
    reference: 'RULE-SZ-01', enforcement: 'calculator',
  },
  {
    id: 'SZ-02', category: 'System Sizing', title: 'DC:AC ratio between 1.0 and 1.3',
    rule: 'Panel kWp ÷ inverter kW must be ≥ 1.0 and ≤ 1.3. Outside the window the quote carries a warning.',
    why: 'Below 1.0 the inverter is underutilised; above 1.3 clipping losses become significant.',
    reference: 'RULE-SZ-02', enforcement: 'both', checkId: 'dc-ac-ratio',
  },
  {
    id: 'SZ-03', category: 'System Sizing', title: '1kWp per ~130kWh/month as the sizing anchor',
    rule: 'Auto-sizing starts from monthly kWh ÷ (5.3 PSH × 30 days × 80% system efficiency).',
    why: 'Gauteng averages 5.3 peak sun hours; 1kWp yields roughly 127kWh/month after losses.',
    reference: 'RULE-SZ-03', enforcement: 'calculator',
  },
  {
    id: 'SZ-04', category: 'System Sizing', title: 'Storey access premium on labour',
    rule: '2-storey roofs add R2,000 to labour; 3+ storeys add R5,000, shown as a separate labour line.',
    why: 'Second-storey panel work needs scaffolding or a boom — materially more time on site.',
    reference: 'RULE-SZ-04', enforcement: 'calculator',
  },

  // ── String Design & Physics ─────────────────────────────────────────────────
  {
    id: 'STR-01', category: 'String Design & Physics', title: 'DC breaker per string at Isc × 1.25',
    rule: 'Every string gets its own DC breaker rated at panel Isc × 1.25, rounded up to the next standard size (10/16/20/25/32/40A).',
    why: 'IEC/NEC 125% overcurrent rule for PV strings. Example: JA 585W Isc 13.89A → 17.4A → 20A breaker.',
    reference: 'RULE-STR-01 / SANS 10142-1 §6.7.1', enforcement: 'both', checkId: 'dc-isolation',
  },
  {
    id: 'STR-02', category: 'String Design & Physics', title: 'Cold-weather string voltage inside inverter max DC input',
    rule: 'Panels-in-series × Voc × 1.10 (Voc rise at −10°C, β ≈ −0.28%/°C) must stay below the inverter\'s max DC input voltage. Datasheet Voc is used — never Vmp.',
    why: 'Over-voltage on a cold clear morning destroys the inverter input stage and voids warranty. (The old paper rule used 41.3V for the JA 585W — that was its Vmp; real Voc is 52.16V.)',
    reference: 'RULE-STR-02 / datasheet physics', enforcement: 'verifier', checkId: 'string-voc',
  },
  {
    id: 'STR-03', category: 'String Design & Physics', title: 'Hot-weather string voltage above MPPT minimum',
    rule: 'Panels-in-series × Vmp (≈0.82 × Voc) × 0.86 hot derate must stay above the inverter\'s MPPT minimum voltage.',
    why: 'Strings that sag below the MPPT window on hot afternoons stop tracking exactly when generation should peak.',
    reference: 'RULE-STR-02 / datasheet physics', enforcement: 'verifier', checkId: 'mppt-min',
  },
  {
    id: 'STR-04', category: 'String Design & Physics', title: 'One string per MPPT unless panel count forces parallel',
    rule: 'String count derives from panel count and the inverter\'s series ceiling; strings spread one-per-MPPT first. Paralleling only happens when strings exceed MPPT count.',
    why: 'Mismatched strings sharing an MPPT cause tracking losses; most catalog inverters (e.g. Sigenergy: 1 string per MPPT by design) never need paralleling.',
    reference: 'RULE-STR-03', enforcement: 'calculator',
  },
  {
    id: 'STR-05', category: 'String Design & Physics', title: 'String current within MPPT input rating',
    rule: 'Panel Isc × parallel strings per MPPT must not exceed the inverter\'s max short-circuit current per MPPT (from datasheet notes).',
    why: 'Over-current strings derate or damage the MPPT stage — e.g. Sigenergy MPPTs are rated 20A Isc; one Trina 620 string (15.9A) fits, two paralleled do not.',
    reference: 'Datasheet / IEC 62548', enforcement: 'verifier', checkId: 'mppt-isc',
  },
  {
    id: 'STR-06', category: 'String Design & Physics', title: 'DC voltage drop ≤ 3% on the PV run',
    rule: 'Estimated drop on the 4mm² string run (2 × length × Imp × 0.00458Ω/m) must stay within 3% of string Vmp; otherwise the engine recommends 6mm².',
    why: 'SANS 10142-1 §5.3.2 voltage-drop limits; every percent of drop is a percent of yield lost forever.',
    reference: 'SANS 10142-1 §5.3.2', enforcement: 'verifier', checkId: 'dc-voltage-drop',
  },

  // ── DC Protection ───────────────────────────────────────────────────────────
  {
    id: 'DC-01', category: 'DC Protection', title: 'DC isolation + SPD on every install — even single strings',
    rule: 'Every PV array gets DC breaker(s) and a DC surge protection device between array and inverter. Never write "direct to MPPT — no combiner required".',
    why: 'SANS 10142-1 §7.12.4 requires DC isolation and §6.7.6 requires surge protection on solar systems unconditionally.',
    reference: 'SANS 10142-1 §7.12.4 / §6.7.6', enforcement: 'both', checkId: 'dc-spd',
  },
  {
    id: 'DC-02', category: 'DC Protection', title: 'String fuses only when strings share an MPPT',
    rule: 'gPV fuses (both poles, per string) are added when parallel strings share an MPPT; with one string per MPPT no fuse is needed — breaker + SPD still are.',
    why: 'A backfed parallel string can exceed the panel\'s reverse-current rating; a single string cannot.',
    reference: 'IEC 62548 / feedback 2026-06-01', enforcement: 'both', checkId: 'string-fuses',
  },
  {
    id: 'DC-03', category: 'DC Protection', title: 'One DC SPD per combiner output, not per string',
    rule: 'The DC SPD sits on the combiner output run to the inverter; strings do not get individual SPDs.',
    why: 'The SPD protects the shared output run — one per combiner is the correct (and cheaper) design.',
    reference: 'RULE-DC-01', enforcement: 'calculator',
  },
  {
    id: 'DC-04', category: 'DC Protection', title: 'Combiner config derived from string layout',
    rule: 'Combiner inputs/outputs follow the computed string count (shown as "n-in, n-out"), never guessed from panel count.',
    why: 'Real job audit: 2 combiners were once quoted because "lots of panels" — the site had one combiner point.',
    reference: 'RULE-DC-02', enforcement: 'calculator',
  },

  // ── AC & Distribution Board ─────────────────────────────────────────────────
  {
    id: 'AC-01', category: 'AC & Distribution Board', title: 'AC changeover/isolator on every hybrid install',
    rule: 'A 2P 63A changeover switch (grid/inverter isolation) is always on the BOM.',
    why: 'Maintenance isolation between grid and inverter output is a SANS requirement and a safety essential.',
    reference: 'RULE-AC-01 / SANS 10142-1 §7.12.4', enforcement: 'both', checkId: 'ac-isolation',
  },
  {
    id: 'AC-02', category: 'AC & Distribution Board', title: 'Essential loads DB minimum 12-way',
    rule: 'Default essential-loads DB is the 12-way (DB-SH12PN); only drop to 6-way when circuits are confirmed ≤4.',
    why: 'Customers always add circuits after install — an undersized DB is a guaranteed call-back.',
    reference: 'RULE-AC-02 / SANS 10142-1 §6.6', enforcement: 'both', checkId: 'essential-db',
  },
  {
    id: 'AC-03', category: 'AC & Distribution Board', title: 'Terminal bars + earth bar in every DB job',
    rule: 'Black + blue 12-way terminal bars and a green earth bar are explicit BOM lines on every essential-loads DB.',
    why: 'Consistently omitted from BOMs historically — without them the DB cannot be wired properly on install day.',
    reference: 'RULE-AC-03', enforcement: 'both', checkId: 'terminal-bars',
  },
  {
    id: 'AC-04', category: 'AC & Distribution Board', title: 'Type 2 AC SPD is mandatory',
    rule: 'A Chint Type 2 2P 40kA AC SPD is on every install without exception.',
    why: 'Highveld lightning makes AC surge protection non-negotiable; SANS 10142-1 §6.7.6 requires it for solar systems.',
    reference: 'RULE-AC-04 / SANS 10142-1 §6.7.6', enforcement: 'both', checkId: 'ac-spd',
  },

  // ── Earthing & Bonding ──────────────────────────────────────────────────────
  {
    id: 'ETH-01', category: 'Earthing & Bonding', title: 'Earth spike count by inverter size',
    rule: '≤3kW → 2 spikes; 4–5kW → 4; 6kW+ → 6. Always quoted with the soil-resistivity disclaimer; final count confirmed on site.',
    why: 'Gauteng soils range from hard red clay to sandy topsoil — resistivity varies enormously. Matthew-confirmed counts, 2026-06-01.',
    reference: 'RULE-ETH-01 / SANS 10142-1 §6.12 / SANS 10292', enforcement: 'both', checkId: 'earthing',
  },
  {
    id: 'ETH-02', category: 'Earthing & Bonding', title: 'Earthmuti per spike',
    rule: 'One 25kg Earthmuti bucket per earth spike, every install.',
    why: 'Dry high-resistivity Gauteng soil needs conductivity improvement at the rod contact point.',
    reference: 'RULE-ETH-02', enforcement: 'both', checkId: 'earthing',
  },
  {
    id: 'ETH-03', category: 'Earthing & Bonding', title: 'Earth bond runs to the main DB, not just the inverter',
    rule: 'Bare copper earth wire is measured from the spike field to the main DB earth bar.',
    why: 'Bonding only at the inverter is not compliant — the consumer earth terminal lives at the main DB (§6.11).',
    reference: 'RULE-ETH-03 / SANS 10142-1 §6.11–6.12', enforcement: 'calculator',
  },
  {
    id: 'ETH-04', category: 'Earthing & Bonding', title: 'Neutral-earth bonding verified in backup mode',
    rule: 'At commissioning, verify the N-E bonding arrangement keeps earth-leakage protection functional in grid AND backup mode.',
    why: 'The most common CoC failure point on hybrid systems (§7.12.3) — easily missed because it only shows up when the grid is down.',
    reference: 'SANS 10142-1 §7.12.3', enforcement: 'site', checkId: 'ne-bonding',
  },

  // ── Battery System ──────────────────────────────────────────────────────────
  {
    id: 'INV-01', category: 'Battery System', title: 'One monitoring device per inverter',
    rule: 'Every inverter gets a gateway/monitoring device unless it ships with a built-in dongle (e.g. Sunsynk) or the gateway is an explicit multi-inverter model.',
    why: 'Real error: one gateway quoted for a 2-inverter system — no app visibility on half the site.',
    reference: 'RULE-INV-01', enforcement: 'both', checkId: 'monitoring',
  },
  {
    id: 'INV-02', category: 'Battery System', title: 'BMS comms cable on every battery',
    rule: 'Every battery system includes the CAN/RS485 comms lead between BMS and inverter.',
    why: 'Without comms the BMS cannot manage charging — the battery will not charge correctly and may fault.',
    reference: 'RULE-INV-02', enforcement: 'both', checkId: 'battery-comms',
  },
  {
    id: 'INV-03', category: 'Battery System', title: 'Battery DC cable minimum 50mm²',
    rule: 'Battery power cables are 50mm² flex up to 200A (70mm² above), with crimped lugs — manufacturer spec wins where stated.',
    why: 'Undersized DC cable at high charge/discharge current is a voltage-drop and fire risk.',
    reference: 'RULE-INV-03', enforcement: 'calculator',
  },
  {
    id: 'INV-04', category: 'Battery System', title: 'DC fuse/disconnect between battery and inverter',
    rule: 'Every battery bank has a fuse holder or DC disconnect on the positive cable to the inverter.',
    why: 'Battery short-circuit protection is a SANS requirement (§7.12.4) — an unfused LFP bank is an arc-flash hazard.',
    reference: 'RULE-INV-04 / SANS 10142-1 §7.12.4', enforcement: 'both', checkId: 'battery-fuse',
  },
  {
    id: 'INV-05', category: 'Battery System', title: 'Sigenergy uses the Sigen Gateway — not a dongle',
    rule: 'SigenStor systems take the Sigen SP Home Gateway (one per inverter); SigenStack is a separate line incompatible with SigenStor/Hybrid inverters.',
    why: 'Confusion with Sunsynk\'s included dongle has caused wrong BOMs; SigenStack pairing is a hard incompatibility.',
    reference: 'RULE-INV-05 / feedback 2026-06-01', enforcement: 'calculator',
  },
  {
    id: 'INV-06', category: 'Battery System', title: 'Battery voltage class must match the inverter',
    rule: 'LV (48/52V) batteries connect only to LV inverters; HV stacks (≥90V) only to HV inverters. Classes come from verified datasheet specs in the catalog.',
    why: 'An HV battery on an LV inverter (or vice versa) destroys equipment instantly. E.g. Sungrow SH20T takes 100–700V — a 51.2V Sunsynk LFP can never connect to it.',
    reference: 'RULE-INV-06 / datasheets', enforcement: 'verifier', checkId: 'battery-class',
  },

  // ── EV Charger ──────────────────────────────────────────────────────────────
  {
    id: 'EV-01', category: 'EV Charger', title: 'EV charger never quoted without full protection (blocker class)',
    rule: 'Every EV circuit carries: Type B earth-leakage device (DC-sensitive), dedicated input DB, AC SPD, correctly sized MCB, armoured feed with SWA glands, and warning labels.',
    why: 'Type B RCD is a legal requirement for EV charging (IEC 61851, §6.16.8) — a standard Type A device cannot see DC fault current and will not trip.',
    reference: 'RULE-EV-01 / SANS 10142-1 §6.16.8 / §6.7.5', enforcement: 'both', checkId: 'ev-type-b',
  },
  {
    id: 'EV-02', category: 'EV Charger', title: 'EV commissioning labour is separate',
    rule: 'EV charger installation and commissioning labour is its own line (pairing, charge limits, testing).',
    why: 'Commissioning takes 1–2 hours beyond the electrical install — bundling it hides real cost.',
    reference: 'RULE-EV-02', enforcement: 'calculator',
  },

  // ── Cabling, Conduit & Glands ───────────────────────────────────────────────
  {
    id: 'CON-01', category: 'Cabling, Conduit & Glands', title: 'Conduit in 4m lengths, always rounded up',
    rule: 'Conduit quantity = ceil(route ÷ 4m); couplings = lengths − 1; saddles = ceil(route ÷ 1.25m); anchors = saddles × 2.',
    why: 'Conduit sells in 4m sticks; quoting in metres under-purchases. Fixings were historically the most-missed items.',
    reference: 'RULE-CON-01/03', enforcement: 'calculator',
  },
  {
    id: 'CON-02', category: 'Cabling, Conduit & Glands', title: 'Conduit sized by string count',
    rule: '20mm carries 1 string + earth; 25mm 2 strings + earth; 32mm 3 strings + earth.',
    why: 'Cable-fill limits (§6.5) — overfilled conduit traps heat and derates the cables inside.',
    reference: 'RULE-CON-02 / SANS 10142-1 §6.5', enforcement: 'calculator',
  },
  {
    id: 'CON-03', category: 'Cabling, Conduit & Glands', title: 'Glands at every DB entry/exit',
    rule: 'Minimum 2 nylon glands per DB (entry + exit), itemized on the BOM; one more per additional cable entry.',
    why: 'The DB\'s IP rating is void without sealed entries — and unsealed boards fail CoC inspection.',
    reference: 'RULE-CON-04', enforcement: 'both', checkId: 'db-glands',
  },
  {
    id: 'CON-04', category: 'Cabling, Conduit & Glands', title: 'Armoured cable terminates in SWA compression glands',
    rule: 'Every armoured (SWA) run gets proper compression glands at BOTH ends with the armour bonded to earth at the gland. A nylon gland is never acceptable on SWA.',
    why: 'The armour is the mechanical protection AND an earth path — §6.3.7 termination and §6.13 bonding both apply. This is verified automatically whenever any SWA line appears on a BOM.',
    reference: 'SANS 10142-1 §6.3.7 / §6.13', enforcement: 'verifier', checkId: 'armoured-glands',
  },
  {
    id: 'CON-05', category: 'Cabling, Conduit & Glands', title: 'All three solar cable colours',
    rule: 'Every PV BOM includes 4mm² red (+), 4mm² black (−), and green/yellow earth — all three, never just red and black.',
    why: 'Real audit: earth bonding wire was omitted on 3 consecutive quotes.',
    reference: 'RULE-CON-05 / SANS 10142-1 §6.3.3', enforcement: 'calculator',
  },
  {
    id: 'CON-06', category: 'Cabling, Conduit & Glands', title: 'Cable runs carry a 20% routing margin',
    rule: 'String run lengths get +20% for routing, loops and strain relief — never the exact measured distance.',
    why: 'On-site routing always adds length; short cable stops the install dead.',
    reference: 'RULE-CON-06', enforcement: 'calculator',
  },

  // ── Materials & BOM ─────────────────────────────────────────────────────────
  {
    id: 'MC4-01', category: 'Materials & BOM', title: 'MC4 connectors by formula, never by eye',
    rule: 'MC4 pairs = strings × 2 + 10% spare (minimum 2).',
    why: 'Visual estimates consistently run short — the formula comes from real job data.',
    reference: 'RULE-MC4-01', enforcement: 'calculator',
  },
  {
    id: 'BOM-01', category: 'Materials & BOM', title: 'Consumables line is mandatory',
    rule: 'Every quote carries a consumables allowance scaled to panel count (cable ties, ferrules, labels, silicone).',
    why: 'Omitted on 4 of 8 historical quotes — causes scope-creep disputes on site.',
    reference: 'RULE-CON-07', enforcement: 'calculator',
  },
  {
    id: 'BOM-02', category: 'Materials & BOM', title: 'BOM copied to the job for wastage tracking',
    rule: 'On quote acceptance the full BOM becomes the job materials register: planned → loaded → used → returned, with site-loss variance costed.',
    why: 'What leaves the warehouse but is neither installed nor returned is measurable loss — this is the control for it.',
    reference: 'Job pipeline 2026-06-09', enforcement: 'calculator',
  },

  // ── Pricing & Commercial ────────────────────────────────────────────────────
  {
    id: 'PRC-01', category: 'Pricing & Commercial', title: 'Markup is 15%, never 20%',
    rule: 'Sell = cost × 1.15. The Pastel "Price Exclusive" 20% is NOT the quoting markup.',
    why: 'Using Pastel prices directly produces wrong quotes.',
    reference: 'RULE-PRC-01', enforcement: 'commercial',
  },
  {
    id: 'PRC-02', category: 'Pricing & Commercial', title: 'No VAT on any quote',
    rule: 'VAT = R0.00 always — Haberl Electrical is not VAT registered.',
    why: 'Charging VAT as a non-vendor would be fraudulent.',
    reference: 'RULE-PRC-02', enforcement: 'commercial',
  },
  {
    id: 'PRC-03', category: 'Pricing & Commercial', title: 'Market-estimate items flagged for supplier confirmation',
    rule: 'Any item priced "~ market est." (Type B ELCB, SWA glands, gPV fuses, battery comms/cable set) raises a calculator warning until the supplier price is confirmed.',
    why: 'Market estimates vary ±20% — never order on an estimate.',
    reference: 'RULE-PRC-03', enforcement: 'calculator',
  },
  {
    id: 'PRC-04', category: 'Pricing & Commercial', title: 'Deposit by starred line items, not a flat percent',
    rule: 'Deposit = selected items (panels, inverter, battery, mounting, EV charger) shown in Rands — never "50% deposit".',
    why: 'Different jobs need different deposit structures; a flat percent is too blunt.',
    reference: 'Feedback 2026-06-01', enforcement: 'commercial',
  },
  {
    id: 'BCA-01', category: 'Pricing & Commercial', title: 'Body corporate disclaimer on sectional title',
    rule: 'Sectional-title/complex properties carry the disclaimer that written body corporate/HOA approval is the client\'s responsibility before an install date is confirmed.',
    why: 'Haberl carries no liability if approval is refused on the day.',
    reference: 'RULE-BCA-01', enforcement: 'commercial',
  },

  // ── Compliance & Paperwork ──────────────────────────────────────────────────
  {
    id: 'COC-01', category: 'Compliance & Paperwork', title: 'COC on every quote — fixed R1,500',
    rule: 'The Certificate of Compliance line is never optional and never omitted.',
    why: 'A CoC is a legal requirement for any electrical installation in South Africa (§8.7).',
    reference: 'RULE-CON-08 / SANS 10142-1 §8.7', enforcement: 'both', checkId: 'coc',
  },
  {
    id: 'COC-02', category: 'Compliance & Paperwork', title: 'SSEG registration for grid-tied systems',
    rule: 'Grid-tied embedded generation requires SSEG approval from the municipality/Eskom before connection — tracked as a job task.',
    why: 'NRS 097-2-1 and §7.12.7; unregistered SSEG risks disconnection and fines.',
    reference: 'SANS 10142-1 §7.12.7 / NRS 097-2-1', enforcement: 'site', checkId: 'sseg',
  },
  {
    id: 'COC-03', category: 'Compliance & Paperwork', title: 'No "Registered Electrical Contractor" claim',
    rule: 'Quotes and the website say "Electrical Contractor · SANS 10142 Compliant" — never "Registered Electrical Contractor".',
    why: 'Matthew is completing registration exams; claiming a registration not yet held is illegal.',
    reference: 'Feedback 2026-06-01', enforcement: 'commercial',
  },
]

export function rulesByCategory() {
  const grouped = new Map<string, DesignRule[]>()
  for (const category of RULE_CATEGORIES) grouped.set(category, [])
  for (const rule of DESIGN_RULES) {
    const list = grouped.get(rule.category) ?? []
    list.push(rule)
    grouped.set(rule.category, list)
  }
  return grouped
}
