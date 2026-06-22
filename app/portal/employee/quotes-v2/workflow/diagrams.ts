// ─────────────────────────────────────────────────────────────────────────────
// Workflow diagrams — the living "flow map" for Quotes v2.
//
// Each entry is a detailed SVG of one flow/configuration. They render inside the
// app's Workflow map page; a wrapper maps the four diagram CSS variables onto the
// app's brand tokens, so the markup below can stay theme-agnostic.
//
// Adding a new flow/configuration = add one entry to WORKFLOW_DIAGRAMS. That's it.
// (More flows — end-to-end overview, existing-system rules, per-config SLDs —
//  drop in here next.)
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkflowDiagram {
  id: string
  label: string
  description: string
  svg: string
}

const INTAKE_V2 = `<svg viewBox="0 0 960 560" xmlns="http://www.w3.org/2000/svg" font-family="var(--font-sans), system-ui, sans-serif" role="img">
<title>Intake v2 — customer, site and usage logic</title>
<desc>Customer with address and a business toggle revealing a contact person; site with its own separate address; usage auto-fills from inverter monitoring on existing systems.</desc>
<defs>
<marker id="c1" markerWidth="9" markerHeight="9" refX="6.5" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L6.5,3 L0,6 z" fill="var(--color-text-secondary)"/></marker>
</defs>
<text x="24" y="28" font-size="20" font-weight="700" fill="var(--color-text-primary)">Intake v2 — customer, site &amp; usage</text>
<text x="24" y="48" font-size="12.5" fill="var(--color-text-secondary)">Customer has its own address + a business toggle. The site has a separate address. Usage auto-fills from monitoring on existing systems.</text>
<line x1="24" y1="62" x2="936" y2="62" stroke="var(--color-border-tertiary)"/>
<rect x="24" y="80" width="300" height="206" rx="10" fill="var(--color-background-primary)" stroke="#1e3a5f" stroke-width="1.5"/>
<text x="40" y="102" font-size="10.5" font-weight="700" letter-spacing="0.5" fill="#1e3a5f">CUSTOMER</text>
<g font-size="12" fill="var(--color-text-primary)">
<text x="40" y="128">Name</text><line x1="120" y1="130" x2="306" y2="130" stroke="var(--color-border-tertiary)"/>
<text x="40" y="154">Email</text><line x1="120" y1="156" x2="306" y2="156" stroke="var(--color-border-tertiary)"/>
<text x="40" y="180">Address</text><line x1="120" y1="182" x2="276" y2="182" stroke="var(--color-border-tertiary)"/>
</g>
<rect x="280" y="170" width="34" height="15" rx="7" fill="var(--color-background-primary)" stroke="#1D9E75"/><text x="297" y="182" text-anchor="middle" font-size="9" font-weight="600" fill="#1D9E75">NEW</text>
<text x="40" y="210" font-size="12" font-weight="600" fill="var(--color-text-primary)">Business?</text>
<rect x="118" y="200" width="32" height="15" rx="7.5" fill="#1e3a5f"/><circle cx="142" cy="207.5" r="5.5" fill="#fff"/>
<text x="160" y="210" font-size="11" fill="var(--color-text-secondary)">on → contact person</text>
<rect x="40" y="222" width="274" height="52" rx="8" fill="var(--color-background-primary)" stroke="#1e3a5f" stroke-dasharray="4 3"/>
<text x="52" y="240" font-size="10" font-weight="700" fill="#1e3a5f">CONTACT PERSON</text>
<g font-size="11" fill="var(--color-text-primary)">
<text x="52" y="262">Name</text><line x1="120" y1="264" x2="300" y2="264" stroke="var(--color-border-tertiary)"/>
<text x="200" y="262">Email</text>
</g>
<rect x="360" y="80" width="262" height="150" rx="10" fill="var(--color-background-primary)" stroke="#1e3a5f" stroke-width="1.5"/>
<text x="376" y="102" font-size="10.5" font-weight="700" letter-spacing="0.5" fill="#1e3a5f">SITE</text>
<g font-size="12" fill="var(--color-text-primary)">
<text x="376" y="128">Label — Home / Business</text>
<text x="376" y="156">Site address</text><line x1="470" y1="158" x2="566" y2="158" stroke="var(--color-border-tertiary)"/>
<text x="376" y="186">Grid · Roof · Storeys</text>
</g>
<rect x="570" y="146" width="40" height="15" rx="7" fill="var(--color-background-primary)" stroke="#1D9E75"/><text x="590" y="158" text-anchor="middle" font-size="9" font-weight="600" fill="#1D9E75">OWN</text>
<text x="376" y="212" font-size="10.5" fill="var(--color-text-secondary)">≠ the customer's address</text>
<rect x="658" y="80" width="278" height="150" rx="10" fill="var(--color-background-primary)" stroke="var(--color-border-tertiary)"/>
<text x="674" y="102" font-size="10.5" font-weight="700" letter-spacing="0.5" fill="var(--color-text-secondary)">OPTIONS</text>
<g font-size="12" fill="var(--color-text-primary)">
<text x="674" y="130">• Option A — 8 kW hybrid</text>
<text x="674" y="156">• Option B — 12 kW hybrid</text>
</g>
<rect x="674" y="174" width="120" height="26" rx="7" fill="var(--color-background-primary)" stroke="#1e3a5f"/><text x="734" y="191" text-anchor="middle" font-size="11" font-weight="600" fill="#1e3a5f">+ Add option</text>
<g stroke="var(--color-text-secondary)" stroke-width="1.4" marker-end="url(#c1)" fill="none">
<line x1="324" y1="150" x2="358" y2="150"/>
<line x1="622" y1="150" x2="656" y2="150"/>
</g>
<text x="40" y="305" font-size="11.5" fill="var(--color-text-secondary)">One customer → many sites → many options. Customer address and site address are stored separately.</text>
<line x1="24" y1="324" x2="936" y2="324" stroke="var(--color-border-tertiary)"/>
<text x="24" y="348" font-size="13" font-weight="700" fill="var(--color-text-primary)">USAGE TAB — fills itself based on job type</text>
<rect x="24" y="392" width="130" height="44" rx="9" fill="var(--color-background-primary)" stroke="#1e3a5f" stroke-width="1.5"/><text x="89" y="419" text-anchor="middle" font-size="12.5" font-weight="700" fill="var(--color-text-primary)">Usage tab</text>
<text x="178" y="360" font-size="10.5" font-weight="700" fill="var(--color-text-secondary)">NEW INSTALL</text>
<rect x="210" y="368" width="220" height="30" rx="7" fill="var(--color-background-primary)" stroke="var(--color-border-tertiary)"/><text x="224" y="387" font-size="11.5" fill="var(--color-text-primary)">Manual entry — optional</text>
<rect x="210" y="404" width="220" height="30" rx="7" fill="var(--color-background-primary)" stroke="var(--color-border-tertiary)"/><text x="224" y="423" font-size="11.5" fill="var(--color-text-primary)">…or forecast only</text>
<text x="178" y="470" font-size="10.5" font-weight="700" fill="#D85A30">EXISTING</text>
<rect x="210" y="478" width="250" height="40" rx="8" fill="var(--color-background-primary)" stroke="#1D9E75" stroke-width="1.5"/><text x="335" y="496" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--color-text-primary)">Auto-filled from monitoring</text><text x="335" y="510" text-anchor="middle" font-size="9.5" fill="var(--color-text-secondary)">live data from the inverter</text>
<rect x="488" y="478" width="150" height="40" rx="8" fill="var(--color-background-primary)" stroke="var(--color-border-tertiary)"/><text x="563" y="502" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--color-text-primary)">Reason for upgrade?</text>
<rect x="666" y="460" width="270" height="32" rx="7" fill="var(--color-background-primary)" stroke="var(--color-border-tertiary)"/><text x="680" y="480" font-size="11" fill="var(--color-text-primary)">Higher usage → set expected increase</text>
<rect x="666" y="500" width="270" height="32" rx="7" fill="var(--color-background-primary)" stroke="var(--color-border-tertiary)"/><text x="680" y="520" font-size="11" fill="var(--color-text-primary)">Fault / swap → keep current usage</text>
<g stroke="var(--color-text-secondary)" stroke-width="1.4" marker-end="url(#c1)" fill="none">
<path d="M154,404 C182,404 182,383 208,383"/>
<path d="M154,420 C182,420 182,419 208,419"/>
<path d="M154,420 C182,420 182,498 208,498"/>
<line x1="460" y1="498" x2="486" y2="498"/>
<path d="M638,490 C652,490 652,476 664,476"/>
<path d="M638,506 C652,506 652,516 664,516"/>
</g>
</svg>`

const DESIGN_WORKSPACE_V2 = `<svg viewBox="0 0 960 600" xmlns="http://www.w3.org/2000/svg" font-family="var(--font-sans), system-ui, sans-serif" role="img">
<title>Diagram workspace v2 — inverter-centric</title>
<desc>Four-sided inverter with PV on top, AC-in left, AC-out right and battery below; component palette; toggleable layers; earthing bonds everything; BOM pops up.</desc>
<defs>
<marker id="b1" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,0 L6,3 L0,6 z" fill="var(--color-text-secondary)"/></marker>
</defs>
<text x="24" y="28" font-size="20" font-weight="700" fill="var(--color-text-primary)">Diagram workspace v2 — inverter at the centre</text>
<text x="24" y="48" font-size="12.5" fill="var(--color-text-secondary)">PV on top · AC-in left · AC-out right · battery below. Earthing bonds everything. Add strings, MPPTs, chargers, meters. BOM pops up.</text>
<line x1="24" y1="62" x2="936" y2="62" stroke="var(--color-border-tertiary)"/>
<rect x="24" y="78" width="150" height="306" rx="10" fill="var(--color-background-primary)" stroke="var(--color-border-tertiary)"/>
<text x="36" y="98" font-size="10.5" font-weight="700" letter-spacing="0.5" fill="var(--color-text-secondary)">+ ADD COMPONENT</text>
<g font-size="11">
<circle cx="42" cy="116" r="4" fill="#f97316"/><text x="54" y="120" fill="var(--color-text-primary)">PV string</text>
<circle cx="42" cy="140" r="4" fill="#f97316"/><text x="54" y="144" fill="var(--color-text-primary)">DC combiner</text>
<circle cx="42" cy="164" r="4" fill="#f97316"/><text x="54" y="168" fill="var(--color-text-primary)">MPPT (Victron)</text>
<circle cx="42" cy="188" r="4" fill="#1e3a5f"/><text x="54" y="192" fill="var(--color-text-primary)">Inverter</text>
<circle cx="42" cy="212" r="4" fill="#2563eb"/><text x="54" y="216" fill="var(--color-text-primary)">Grid-tie inverter</text>
<circle cx="42" cy="236" r="4" fill="#16a34a"/><text x="54" y="240" fill="var(--color-text-primary)">Battery</text>
<circle cx="42" cy="260" r="4" fill="#2563eb"/><text x="54" y="264" fill="var(--color-text-primary)">EV / DC charger</text>
<circle cx="42" cy="284" r="4" fill="var(--color-text-secondary)"/><text x="54" y="288" fill="var(--color-text-primary)">Meter</text>
<circle cx="42" cy="308" r="4" fill="#2563eb"/><text x="54" y="312" fill="var(--color-text-primary)">DB board</text>
<circle cx="42" cy="332" r="4" fill="#65a30d"/><text x="54" y="336" fill="var(--color-text-primary)">Earthing</text>
</g>
<rect x="24" y="396" width="150" height="160" rx="10" fill="var(--color-background-primary)" stroke="var(--color-border-tertiary)"/>
<text x="36" y="416" font-size="10.5" font-weight="700" letter-spacing="0.5" fill="var(--color-text-secondary)">LAYERS — tap to toggle</text>
<g font-size="11">
<text x="36" y="438" fill="var(--color-text-primary)">DC</text><rect x="124" y="429" width="30" height="14" rx="7" fill="#1e3a5f"/><circle cx="147" cy="436" r="5" fill="#fff"/>
<text x="36" y="462" fill="var(--color-text-primary)">Battery</text><rect x="124" y="453" width="30" height="14" rx="7" fill="#1e3a5f"/><circle cx="147" cy="460" r="5" fill="#fff"/>
<text x="36" y="486" fill="var(--color-text-primary)">AC</text><rect x="124" y="477" width="30" height="14" rx="7" fill="#1e3a5f"/><circle cx="147" cy="484" r="5" fill="#fff"/>
<text x="36" y="510" fill="var(--color-text-primary)">Earth</text><rect x="124" y="501" width="30" height="14" rx="7" fill="#1e3a5f"/><circle cx="147" cy="508" r="5" fill="#fff"/>
<text x="36" y="534" fill="var(--color-text-secondary)">Data</text><rect x="124" y="525" width="30" height="14" rx="7" fill="var(--color-border-tertiary)"/><circle cx="131" cy="532" r="5" fill="var(--color-text-secondary)"/>
</g>
<rect x="190" y="78" width="746" height="424" rx="10" fill="var(--color-background-primary)" stroke="var(--color-border-tertiary)"/>
<g font-size="10">
<rect x="250" y="104" width="66" height="28" rx="6" fill="var(--color-background-primary)" stroke="#f97316"/><text x="283" y="122" text-anchor="middle" fill="var(--color-text-primary)">String 1</text>
<rect x="330" y="104" width="66" height="28" rx="6" fill="var(--color-background-primary)" stroke="#f97316"/><text x="363" y="122" text-anchor="middle" fill="var(--color-text-primary)">String 2</text>
<rect x="410" y="104" width="66" height="28" rx="6" fill="var(--color-background-primary)" stroke="#f97316"/><text x="443" y="122" text-anchor="middle" fill="var(--color-text-primary)">String 3</text>
</g>
<rect x="320" y="158" width="140" height="30" rx="7" fill="var(--color-background-primary)" stroke="#f97316" stroke-width="1.4"/><text x="390" y="178" text-anchor="middle" font-size="11" font-weight="600" fill="var(--color-text-primary)">DC combiner / MPPT</text>
<g stroke="#f97316" stroke-width="2" fill="none" marker-end="url(#b1)">
<line x1="283" y1="132" x2="360" y2="158"/>
<line x1="363" y1="132" x2="390" y2="158"/>
<line x1="443" y1="132" x2="420" y2="158"/>
<line x1="400" y1="188" x2="455" y2="226"/>
</g>
<text x="468" y="150" font-size="9.5" fill="var(--color-text-secondary)">10 strings → combine</text>
<text x="468" y="162" font-size="9.5" fill="var(--color-text-secondary)">into combiners as you like</text>
<rect x="430" y="226" width="120" height="118" rx="10" fill="var(--color-background-primary)" stroke="#1e3a5f" stroke-width="2.5"/>
<text x="490" y="289" text-anchor="middle" font-size="13" font-weight="700" fill="var(--color-text-primary)">Inverter</text>
<text x="490" y="305" text-anchor="middle" font-size="10.5" fill="var(--color-text-secondary)">15 kW</text>
<text x="490" y="243" text-anchor="middle" font-size="9.5" font-weight="700" fill="#f97316">▲ DC / PV</text>
<text x="438" y="288" font-size="9.5" font-weight="700" fill="#2563eb">AC in</text>
<text x="542" y="288" text-anchor="end" font-size="9.5" font-weight="700" fill="#2563eb">AC out</text>
<text x="490" y="335" text-anchor="middle" font-size="9.5" font-weight="700" fill="#16a34a">Battery ▼</text>
<rect x="206" y="262" width="74" height="34" rx="7" fill="var(--color-background-primary)" stroke="#7c3aed" stroke-width="1.4"/><text x="243" y="283" text-anchor="middle" font-size="11" font-weight="600" fill="var(--color-text-primary)">Grid</text>
<rect x="300" y="264" width="50" height="30" rx="7" fill="var(--color-background-primary)" stroke="var(--color-text-secondary)"/><text x="325" y="283" text-anchor="middle" font-size="10" fill="var(--color-text-primary)">Meter</text>
<g stroke-width="2" fill="none" marker-end="url(#b1)">
<line x1="280" y1="279" x2="299" y2="279" stroke="#7c3aed"/>
<line x1="350" y1="279" x2="430" y2="285" stroke="#2563eb"/>
</g>
<rect x="600" y="150" width="120" height="32" rx="7" fill="var(--color-background-primary)" stroke="#2563eb" stroke-width="1.4"/><text x="660" y="170" text-anchor="middle" font-size="10.5" font-weight="600" fill="var(--color-text-primary)">Grid-tie inverter</text>
<rect x="600" y="240" width="120" height="40" rx="8" fill="var(--color-background-primary)" stroke="#2563eb" stroke-width="1.6"/><text x="660" y="259" text-anchor="middle" font-size="11" font-weight="600" fill="var(--color-text-primary)">DB board</text><text x="660" y="272" text-anchor="middle" font-size="9.5" fill="var(--color-text-secondary)">AC loads</text>
<rect x="600" y="300" width="120" height="32" rx="7" fill="var(--color-background-primary)" stroke="#2563eb" stroke-width="1.4"/><text x="660" y="320" text-anchor="middle" font-size="10.5" font-weight="600" fill="var(--color-text-primary)">EV charger</text>
<g stroke="#2563eb" stroke-width="2" fill="none" marker-end="url(#b1)">
<line x1="550" y1="278" x2="600" y2="262"/>
<line x1="660" y1="182" x2="660" y2="240"/>
<line x1="660" y1="280" x2="660" y2="300"/>
</g>
<rect x="430" y="382" width="120" height="40" rx="8" fill="var(--color-background-primary)" stroke="#16a34a" stroke-width="1.6"/><text x="490" y="401" text-anchor="middle" font-size="11" font-weight="600" fill="var(--color-text-primary)">Battery</text><text x="490" y="414" text-anchor="middle" font-size="9.5" fill="var(--color-text-secondary)">10.2 kWh</text>
<line x1="490" y1="344" x2="490" y2="382" stroke="#16a34a" stroke-width="2" fill="none" marker-end="url(#b1)"/>
<line x1="240" y1="452" x2="900" y2="452" stroke="#65a30d" stroke-width="1.6" stroke-dasharray="6 4"/>
<text x="240" y="446" font-size="10" font-weight="700" fill="#65a30d">EARTHING LAYER — bonds everything (⏚)</text>
<g stroke="#65a30d" stroke-width="1.3" stroke-dasharray="3 3">
<line x1="325" y1="294" x2="325" y2="452"/>
<line x1="490" y1="422" x2="490" y2="452"/>
<line x1="660" y1="332" x2="660" y2="452"/>
</g>
<rect x="190" y="510" width="746" height="40" rx="10" fill="var(--color-background-primary)" stroke="#1e3a5f" stroke-width="1.4"/>
<text x="210" y="535" font-size="12.5" font-weight="700" fill="#1e3a5f">▲  Bill of materials</text>
<text x="360" y="535" font-size="11.5" fill="var(--color-text-secondary)">slides up over the canvas when you want it — stays out of the way otherwise</text>
<text x="916" y="535" text-anchor="end" font-size="12.5" font-weight="700" fill="var(--color-text-primary)">R 142 800</text>
</svg>`

export const WORKFLOW_DIAGRAMS: WorkflowDiagram[] = [
  {
    id: 'intake',
    label: 'Intake — customer, site & usage',
    description: 'How a quote is captured: customer (with business toggle), site with its own address, and the usage tab that auto-fills from monitoring on existing systems.',
    svg: INTAKE_V2,
  },
  {
    id: 'design-workspace',
    label: 'Design & Quote workspace',
    description: 'The inverter-centric SLD canvas: four-sided inverter, component palette, toggleable layers, earthing layer, and the pop-up bill of materials.',
    svg: DESIGN_WORKSPACE_V2,
  },
]
