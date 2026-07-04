/**
 * SANS 10142-1 Ed 3.03 / Amendment 3 change register.
 *
 * Practical summary of every regulation change Amdt 3 introduces over the
 * in-force Ed 3.02, keyed to clause refs. Sourced from the TDMI Training
 * change register (26 June 2026). For legal application the official SANS
 * wording must always be consulted — this is a navigation aid, not the law.
 */

export interface Amdt3Change {
  /** Clause / location the change lands in ('6.1.13', 'annex-s', 'foreword'). */
  ref: string
  /** Clause ref to deep-link into the Ed 3.02 browser, when one exists there. */
  linkRef?: string
  change: string
  /** True where the change directly affects solar PV / battery / SSEG work. */
  pvRelevant?: boolean
}

export interface Amdt3Group {
  title: string
  changes: Amdt3Change[]
}

export const AMDT3_META = {
  edition: '3.03',
  year: '2026',
  source: 'TDMI Training change register, 26 June 2026 — comparison of Ed 3.02 markers to Ed 3.03',
  disclaimer:
    'A practical summary of Amdt 3 changes only. For legal and technical application the official SANS document wording must always be consulted.',
}

export const AMDT3_GROUPS: Amdt3Group[] = [
  {
    title: 'Foreword & references',
    changes: [
      { ref: 'foreword', linkRef: 'foreword', change: 'Confirms the 2026 amendment scope: referenced standards, installation requirements, special installations/locations, verification/certification, medical-location test report, and a new GP/PV/Battery test report.', pvRelevant: true },
      { ref: 'foreword → 8.6.6', linkRef: '8.6.6', change: "Adds an explanation of 'user or lessor of electrical installation' with reference to the Electrical Installation Regulations." },
      { ref: 'foreword → 8.6.15.2', change: 'Adds a Construction Regulation reference for structural / PV-mounting matters.', pvRelevant: true },
      { ref: 'contents 7.17', change: 'New section added: Caravans and mobile trailers.' },
      { ref: 'annex S', change: 'New informative annex: Test report for generating plants (GP) (PV/Battery) installations.', pvRelevant: true },
      { ref: 'normative refs', linkRef: '2', change: 'New references: IEC 62446-1:2018 (PV testing/commissioning), SANS 60364-4-44 (voltage/EM disturbances), SANS 60364-7-710 (medical), SANS 60364-7-717 (mobile units), SANS 60364-7-721 (caravans). Bibliography adds SANS 10142-1-2 (SSEG).', pvRelevant: true },
    ],
  },
  {
    title: 'Clause 6 — Installation requirements',
    changes: [
      { ref: '6.1.6', linkRef: '6.1.6', change: 'Neutral-to-earth connection rule expanded to include the new island-mode exception in 7.12.3.1.5.', pvRelevant: true },
      { ref: '6.1.13', change: 'NEW RULE: a multicore cable may not contain conductors from circuits supplied by different sources — e.g. inverter input and inverter output in the same multicore cable.', pvRelevant: true },
      { ref: '6.3.3.2(a)(3)', linkRef: '6.3.3.2', change: 'Specialised medical installations: solid green earth-conductor identification must refer to SANS 60364-7-710.' },
      { ref: '6.3.3.2(a)(4)', linkRef: '6.3.3.2', change: 'Phase conductor colours clarified: phase conductors must not be pink, green/yellow, green or black.' },
      { ref: '6.3.3.2(a)(5)', linkRef: '6.3.3.2', change: 'Durable colour marking at the ends of multicore cable conductors is allowed (sleeves or insulating tape).' },
      { ref: '6.7.1.2(c)', linkRef: '6.7.1', change: 'Where automatic disconnection by the main protective device is not practical, an earth-fault detection-and-disconnection device may be used at the point of control, provided touch-voltage exposure above 25 V is limited.' },
      { ref: '6.9.1.4', linkRef: '6.9.1', change: 'NEW RULE: a multicore cable must have only one disconnecting device.' },
      { ref: '6.11.3', linkRef: '6.11', change: "Using the alternative earth-fault detection device in 6.7.1.2(c) does not remove the supplier's responsibility to provide a supplier's earth terminal." },
    ],
  },
  {
    title: 'Clause 7 — Special installations / locations',
    changes: [
      { ref: '7.7', linkRef: '7.7', change: 'Medical locations must comply with SANS 60364-7-710 as well as SANS 10142-1.' },
      { ref: '7.12.1.1(c)', linkRef: '7.12.1', change: "Alternative supplies now explicitly include supply operating in parallel with the supplier's main supply (grid-tied systems).", pvRelevant: true },
      { ref: '7.12.1.1 note 2', linkRef: '7.12.1', change: 'Note 2 deleted by Amendment 3.' },
      { ref: '7.12.3.1.5', change: 'NEW: island-mode neutral/PE reference requirement for generating sets or power-converting equipment with backup functionality. Neutral and PE may only be connected while that part of the installation intentionally operates in island mode.', pvRelevant: true },
      { ref: '7.12.3.1.5', change: 'The neutral/PE reference must be internal to the generating set / power converter or within manufacturer-supplied control equipment — a separate external relay/contactor arrangement is NOT accepted.', pvRelevant: true },
      { ref: '7.12.3.1.5(a)–(e)', change: 'If an external system-reference conductor is manufacturer-prescribed: no upstream earth-fault detection devices, earth conductor sized as phase/neutral, downstream device testing under grid AND island modes, warning notice at the N-E link, and neutral-earth voltage rise must comply with 8.6.6.', pvRelevant: true },
      { ref: '7.17', change: 'NEW SECTION: caravans and mobile trailers must comply with SANS 60364-7-717 and SANS 60364-7-721.' },
    ],
  },
  {
    title: 'Clause 8 — Verification, testing & certification',
    changes: [
      { ref: 'clause 8 note', linkRef: '8', change: 'Where an installation includes a generating plant, a test report for that portion must be attached to the CoC.', pvRelevant: true },
      { ref: '8.4.7', linkRef: '8.4', change: 'NEW: Generating plants and PSCC. Where more than one source can operate in parallel, PSCC summation must be considered.', pvRelevant: true },
      { ref: '8.4.7.2', linkRef: '8.4', change: 'Battery banks/modules with a BMS: PSCC must come from the BMS nameplate, datasheet, manufacturer, or calculation.', pvRelevant: true },
      { ref: '8.4.7.3–8.4.7.4', linkRef: '8.4', change: 'Generating plants: PSCC from generator nameplate/datasheet/manufacturer/calculation; with multiple generators, PSCC recorded for all units.', pvRelevant: true },
      { ref: '8.6.1', linkRef: '8.6', change: 'Testing guidance expanded for hazardous and specialised locations, including the additional reports for hazardous and medical locations.' },
      { ref: '8.6.3 note', linkRef: '8.6', change: 'EGI earthing terminals typically include converter enclosures, AC/DC SPDs, PV modules and mounting bonding arrangements.', pvRelevant: true },
      { ref: '8.6.5.1–8.6.5.5', linkRef: '8.6.5', change: 'Earth-loop impedance updated: 5-second disconnection for devices above 63 A, manufacturer trip data, a formula for loop impedance at the main switch, measurement at the main switch, and a new neutral loop impedance test.' },
      { ref: '8.6.6', linkRef: '8.6.6', change: 'Elevated supply-neutral voltage procedure: notify supplier/user above 25 V; notify user/lessor for 0–25 V; above 50 V requires disconnection and supplier notification via Annex H.' },
      { ref: '8.6.8', linkRef: '8.6.8', change: 'Insulation-resistance testing reworked: AC and DC separated, AC/DC test voltages and conductor combinations specified, minimum 1.0 MΩ, sectional testing allowed per sub-DB (each section still ≥ 1.0 MΩ).' },
      { ref: '8.6.8.2', linkRef: '8.6.8', change: 'NEW: PV array DC insulation-resistance testing, linked to IEC 62446-1:2018.', pvRelevant: true },
      { ref: '8.6.15', change: 'NEW SECTION: Structural loads — PV support structures and mounting must comply with building regulations and SANS 60364-7-712; mechanical soundness may require a competent-person opinion; roof penetrations must be weatherproof.', pvRelevant: true },
      { ref: '8.6.16', change: 'NEW SECTION: Fire risks — comply with SANS 60364-7-712 and national/local fire regulations.', pvRelevant: true },
      { ref: '8.7', linkRef: '8.7', change: 'Test-report warning updated re CoC and approved formats; medical-location report carried through; new allowance for an Annex S report for the generating plant / PV / battery portion.', pvRelevant: true },
    ],
  },
  {
    title: 'Test reports & annexes',
    changes: [
      { ref: 'medical test report', change: 'Medical-location inspection and test report pages updated: installation description, classification, inspection checks, tests, responsibility/signature sections.' },
      { ref: 'hazardous test report', change: 'Responsibility/signature section updated.' },
      { ref: 'annex H', linkRef: 'H', change: 'Notification-of-potential-danger form updated: user details plus current/previous CoC and test-report references.' },
      { ref: 'annex L', linkRef: 'L', change: 'Classification of safety services for medical locations now refers to SANS 60364-7-710.' },
      { ref: 'annex S', change: 'NEW ANNEX: GP/PV/Battery test report — installation details (converters, storage, PV modules, phases, DC voltage, islanding settings, lightning/surge protection, SLD) plus tests (bonding continuity, ECC resistance/sizing, neutral loop impedance, PSCC, elevated neutral-to-external-earth voltage) and a registered-person declaration for the generating-plant portion.', pvRelevant: true },
    ],
  },
]

/** Every Amdt 3 change touching a given Ed 3.02 clause ref (or its children). */
export function amdt3ChangesFor(clauseRef: string): Amdt3Change[] {
  const out: Amdt3Change[] = []
  for (const group of AMDT3_GROUPS) {
    for (const c of group.changes) {
      if (!c.linkRef) continue
      if (c.linkRef === clauseRef || c.linkRef.startsWith(clauseRef + '.')) out.push(c)
    }
  }
  return out
}
