/**
 * The compliance reference behind the founders' workbook: what a South African
 * electrical contractor has to register for, what has to be drawn by an
 * attorney, and the order to do it in.
 *
 * Every threshold, form and fee here is a STARTING POINT to confirm with the
 * body itself — SA requirements move, and nothing in this file is legal or tax
 * advice. Keep that caveat on the page, not just in this comment.
 */

/** How hard a requirement is: law, law-if-you-take-that-work, or commercial reality. */
export type RegistrationTier = 'must' | 'maybe' | 'smart'

export interface Registration {
  name: string
  /** What the registration actually consists of — forms, returns, renewals. */
  detail: string
  body: string
  when: string
  tier: RegistrationTier
  tierLabel: string
}

export const TIER_LABEL: Record<RegistrationTier, string> = {
  must: 'Statutory',
  maybe: 'Conditional',
  smart: 'Commercial',
}

export const TIER_MEANING: Record<RegistrationTier, string> = {
  must: 'illegal to trade without it',
  maybe: 'depends on the work you take',
  smart: 'not law, but you will lose work without it',
}

export const REGISTRATIONS: Registration[] = [
  {
    name: 'Company registration',
    detail:
      'Name reservation, MOI, CoR 14.1 / 14.3, director appointments',
    body: 'CIPC',
    when:
      'Before anything else. Annual return every year on the anniversary, or the company is deregistered.',
    tier: 'must',
    tierLabel: 'Statutory',
  },
  {
    name: 'Beneficial ownership register',
    detail:
      'Filed with, and kept current alongside, the annual return',
    body: 'CIPC',
    when:
      'Within the prescribed window of incorporation, then updated on any ownership change.',
    tier: 'must',
    tierLabel: 'Statutory',
  },
  {
    name: 'Income tax',
    detail:
      'Issued automatically on incorporation; provisional tax follows',
    body: 'SARS',
    when:
      'On registration. Two provisional returns a year plus the annual ITR14.',
    tier: 'must',
    tierLabel: 'Statutory',
  },
  {
    name: 'VAT',
    detail:
      'Compulsory above the turnover threshold; voluntary registration possible well below it',
    body: 'SARS',
    when:
      'Compulsory once taxable turnover passes the threshold in any twelve months. Register early if your customers are businesses — you claim input VAT on stock and vehicles.',
    tier: 'maybe',
    tierLabel: 'Conditional',
  },
  {
    name: 'PAYE, UIF, SDL',
    detail:
      'Employer registration, then a monthly EMP201 and twice-yearly reconciliations',
    body: 'SARS',
    when:
      'The moment you pay anyone — including the two of you on salary. SDL only applies above the payroll threshold.',
    tier: 'must',
    tierLabel: 'Statutory',
  },
  {
    name: 'UIF employer registration',
    detail:
      'Separate from the SARS registration; monthly employee declarations',
    body: 'Dept of Employment & Labour (uFiling)',
    when:
      'On first employee. Declarations must be current or a claim is refused.',
    tier: 'must',
    tierLabel: 'Statutory',
  },
  {
    name: 'COIDA registration',
    detail:
      'Compensation Fund registration, then the annual Return of Earnings via CompEasy',
    body: 'Compensation Fund (Dept of Employment & Labour)',
    when:
      'On first employee. This is the injured-on-duty cover you mentioned — it covers the employee and it protects you from being sued directly for a workplace injury.',
    tier: 'must',
    tierLabel: 'Statutory',
  },
  {
    name: 'Letter of Good Standing',
    detail:
      'Issued once COIDA registration and assessments are paid up; renewed annually',
    body: 'Compensation Fund',
    when:
      'Before your first commercial or main-contractor site. Most sites will not let you through the gate without a current one.',
    tier: 'must',
    tierLabel: 'Statutory',
  },
  {
    name: 'Electrical contractor registration',
    detail:
      'Required under the Electrical Installation Regulations to the OHS Act 85 of 1993',
    body: 'Electrical Contracting Board of SA, for the Chief Inspector',
    when:
      'Before you do any electrical installation work for reward. Requires the company to employ a registered person and to hold the prescribed test instruments.',
    tier: 'must',
    tierLabel: 'Statutory',
  },
  {
    name: 'Registered person',
    detail:
      'Installation Electrician, Master Installation Electrician or single-phase tester — a personal registration, not the company\'s',
    body: 'Dept of Employment & Labour',
    when:
      'Before registration as a contractor. Only this person may issue a Certificate of Compliance, and only for work they inspected.',
    tier: 'must',
    tierLabel: 'Statutory',
  },
  {
    name: 'Bargaining council',
    detail:
      'Registration, monthly returns and levies, prescribed minimum rates, provident and sick-pay funds',
    body: 'National Bargaining Council for the Electrical Industry of SA',
    when:
      'If your work and staff fall inside its registered scope, membership and levies are compulsory — not optional. Confirm your scope with them before you hire; back-levies are painful.',
    tier: 'must',
    tierLabel: 'Statutory',
  },
  {
    name: 'Municipal / Eskom SSEG approval',
    detail:
      'Grid-tied PV application, approved inverter list, NRS 097-2-1 compliance, embedded generation agreement',
    body: 'Local municipality or Eskom',
    when:
      'Per installation, applied for before commissioning a grid-tied system. Requirements differ by municipality.',
    tier: 'must',
    tierLabel: 'Statutory',
  },
  {
    name: 'PV GreenCard',
    detail:
      'Installer accreditation plus a per-installation compliance report',
    body: 'SAPVIA',
    when:
      'Increasingly required by insurers, banks and municipalities on PV work, and a strong differentiator in a market full of cowboys.',
    tier: 'smart',
    tierLabel: 'Commercial',
  },
  {
    name: 'ECA(SA) membership',
    detail:
      'Voluntary trade association — workmanship guarantee, IR support, rate guidance',
    body: 'Electrical Contractors\' Association of SA',
    when:
      'Optional but worth it early: the guarantee scheme is a genuine sales asset for domestic customers.',
    tier: 'smart',
    tierLabel: 'Commercial',
  },
  {
    name: 'CIDB registration',
    detail:
      'Electrical class, graded by contract value',
    body: 'Construction Industry Development Board',
    when:
      'Only if you tender for public-sector work. Start at the lowest grade and climb as your track record builds.',
    tier: 'maybe',
    tierLabel: 'Conditional',
  },
  {
    name: 'Central Supplier Database',
    detail:
      'Single registration used by all organs of state',
    body: 'National Treasury',
    when:
      'Only if you want government or municipal work.',
    tier: 'maybe',
    tierLabel: 'Conditional',
  },
  {
    name: 'B-BBEE affidavit',
    detail:
      'A sworn affidavit is sufficient for an exempted micro enterprise — no paid verification needed',
    body: 'Commissioner of Oaths',
    when:
      'Get one immediately. Corporate customers ask for it on the first invoice, and at your turnover it costs nothing but a signature.',
    tier: 'smart',
    tierLabel: 'Commercial',
  },
  {
    name: 'Information Officer registration',
    detail:
      'POPIA — the CEO is the Information Officer by default and must be registered',
    body: 'Information Regulator',
    when:
      'You hold customer addresses, site photos, ID numbers and monitoring data in the portal. This one is genuinely enforceable and routinely ignored.',
    tier: 'must',
    tierLabel: 'Statutory',
  },
  {
    name: 'Construction work notification',
    detail:
      'Notification, or a permit for larger works, plus the Construction Regulations appointments',
    body: 'Dept of Employment & Labour',
    when:
      'Triggered by the size and nature of the construction work. Roof-mounted PV is work at height and pulls in fall-protection duties regardless of size.',
    tier: 'maybe',
    tierLabel: 'Conditional',
  },
  {
    name: 'Business bank account & signing mandate',
    detail:
      'Two-signature mandate above an agreed limit',
    body: 'Your bank',
    when:
      'Immediately after incorporation. Never run the company through a personal account, even for a week — it is the fastest way to lose the liability wall.',
    tier: 'smart',
    tierLabel: 'Commercial',
  },
]

/** Priced on day one, before the first site. */
export const INSURANCE: string[] = [
  'Public liability — third-party injury or property damage. Non-negotiable, and site access often depends on the cover amount.',
  'Contractors all risk — the works, materials on site, and plant, before handover.',
  'Professional indemnity — you design systems and issue certificates. Workmanship cover alone does not answer a design claim.',
  'Goods in transit and tools/plant all risk — a stolen bakkie full of instruments is a business-ending event at this stage.',
  'Vehicle fleet and SASRIA for civil-unrest exposure.',
  'Key-person and buy-and-sell life cover — the buy-and-sell agreement in Part four is worthless unless it is funded by a policy.',
]

export interface LegalDocument {
  title: string
  /** Who draws it, and by when. */
  who: string
  /** The clauses or contents that matter. */
  items: string[]
}

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    title: 'Shareholders\' agreement',
    who: 'Attorney · before trading',
    items: [
      'Shareholding, capital contributions, and loan accounts',
      'Vesting and leaver provisions — good leaver vs bad leaver',
      'Reserved matters: what needs both signatures',
      'Deadlock breaker and dispute escalation',
      'Pre-emptive rights, tag-along and drag-along',
      'Dividend and drawings policy',
      'Restraint of trade and confidentiality',
      'Warranties about what each of you brings in',
    ],
  },
  {
    title: 'Customised MOI',
    who: 'Attorney · filed at CIPC',
    items: [
      'Share classes and director appointment rules',
      'Restrictions on share transfer that match the shareholders\' agreement',
      'Quorum and voting so a 50/50 split cannot paralyse the board',
    ],
  },
  {
    title: 'Buy-and-sell agreement',
    who: 'Attorney + broker · before trading',
    items: [
      'Compulsory purchase of a deceased or disabled partner\'s shares',
      'Valuation formula agreed in advance',
      'Funded by life and disability policies on each other\'s lives',
      'Keeps a grieving spouse from becoming your business partner',
    ],
  },
  {
    title: 'IP assignment & licence',
    who: 'Attorney · before data migration',
    items: [
      'Deals with the platform, the brand, the domain and the customer database',
      'Either assigns them to the company for equity, or licenses them on stated terms',
      'States explicitly what happens to code and data if the partnership ends',
    ],
  },
  {
    title: 'Employment contracts',
    who: 'Template + attorney review',
    items: [
      'Written particulars as required by the BCEA',
      'Bargaining council rates and conditions where applicable',
      'Disciplinary code and grievance procedure',
      'Confidentiality, tools and vehicle use, POPIA undertaking',
      'Directors\' service agreements for the two of you, separate from the shareholding',
    ],
  },
  {
    title: 'Customer terms',
    who: 'Attorney · before the first quote goes out',
    items: [
      'Standard terms attached to every quote and referenced on every invoice',
      'Payment terms, deposits, ownership of materials until paid, interest on arrears',
      'Variations and how extra work gets priced and approved',
      'Workmanship guarantee period, and what voids it',
      'Consumer Protection Act compliance for domestic customers',
      'Limitation of liability, and exclusion of consequential loss',
    ],
  },
  {
    title: 'Subcontractor agreement',
    who: 'Template · before your first subbie',
    items: [
      'Proof of their own registration, CoC capability and Letter of Good Standing',
      'Indemnity back to you, and their own public liability cover',
      'Clear statement that they are not your employee — protects you at SARS and the CCMA',
    ],
  },
  {
    title: 'Health & safety pack',
    who: 'SHE consultant · before the first commercial site',
    items: [
      'OHS policy and the section 16(2) appointment letter',
      'Baseline and site-specific risk assessments',
      'Safe work procedures, including lock-out and work at height',
      'Fall protection plan for roof work',
      'Induction records, PPE issue register, toolbox talks',
      'Incident reporting procedure and first-aider appointment',
      'A reusable site H&S file template',
    ],
  },
  {
    title: 'POPIA pack',
    who: 'Template · website and portal',
    items: [
      'Privacy policy and consent wording on the site and portal',
      'PAIA manual',
      'Operator agreements with your hosting and email providers',
      'Data breach response procedure',
    ],
  },
  {
    title: 'Internal policies',
    who: 'Write yourselves · first month',
    items: [
      'Delegation of authority — the spend limits from question 16',
      'Procurement and supplier account policy',
      'Vehicle and fuel card policy',
      'Tool issue, return and loss policy',
      'Petty cash and expense claims',
      'Quoting and discount policy — who may discount, and by how much',
    ],
  },
]

export interface Phase {
  when: string
  title: string
  items: string[]
}

export const SEQUENCE: Phase[] = [
  {
    when: 'Before any money',
    title: 'Answer the questions',
    items: [
      'Both of you complete Part one separately, then compare and reconcile every difference.',
      'Write the outcome into a plain-language term sheet — two pages, no legalese. This is what you hand the attorney.',
      'Confirm which of you is the registered person, and confirm the ECB\'s current contractor registration requirements directly with them.',
    ],
  },
  {
    when: 'Weeks 1–2',
    title: 'Stand up the entity',
    items: [
      'Reserve the name and register the company with a customised MOI.',
      'Attorney drafts the shareholders\' agreement, buy-and-sell, and the IP assignment from your term sheet. Sign all three before trading.',
      'Open the bank account with a two-signature mandate. Appoint the accountant. Set up the accounting package and the chart of accounts.',
      'Broker prices the insurance schedule and the buy-and-sell policies.',
    ],
  },
  {
    when: 'Weeks 2–6',
    title: 'Get legal to trade',
    items: [
      'Electrical contractor registration; confirm the registered person\'s own registration is current.',
      'SARS employer registration; VAT if you are registering voluntarily.',
      'COIDA registration, then chase the Letter of Good Standing — it takes longer than you expect and gates commercial work.',
      'UIF registration. Confirm bargaining council scope before the first payslip.',
      'B-BBEE affidavit. Information Officer registration.',
    ],
  },
  {
    when: 'Weeks 4–8',
    title: 'Make it operable',
    items: [
      'Customer terms finalised and wired into the quote document the platform generates.',
      'Employment contracts issued to all four of you, including directors\' service agreements.',
      'H&S pack in place and a site file template loaded into the job pipeline.',
      'Supplier accounts opened — and a written note of every personal surety signed to open them.',
      'Add the CoC register, the compliance calendar and the employee document vault to the platform.',
    ],
  },
  {
    when: 'Month 3',
    title: 'First review',
    items: [
      'Re-run the seventeen questions marked Settle first. Three months of real trading changes answers, and it is much easier to amend an agreement now than at the point it matters.',
      'Check the first set of management accounts actually reconciles, and that both of you can read it.',
    ],
  },
]
