/**
 * Helpers for working with SANS clause references ('6.2.7.1.1', 'D.2.1',
 * 'foreword'). Sort keys and ancestor chains are derived purely from the ref
 * string so the UI never needs a recursive query.
 */

const FRONT_MATTER: Record<string, string> = {
  'table-of-changes': '000.000',
  foreword: '000.001',
  introduction: '000.002',
}

export const FRONT_MATTER_TITLES: Record<string, string> = {
  'table-of-changes': 'Table of Changes',
  foreword: 'Foreword',
  introduction: 'Introduction',
}

/** 'foreword' → '000.001' · '6.2.7' → '006.002.007' · 'D.2' → 'ZD.002' (annexes sort last). */
export function sortKeyFor(ref: string): string {
  const front = FRONT_MATTER[ref.toLowerCase()]
  if (front) return front
  return ref
    .split('.')
    .map((part) => (/^\d+$/.test(part) ? part.padStart(3, '0') : `Z${part.toUpperCase()}`))
    .join('.')
}

/** '6.2.7.1' → ['6', '6.2', '6.2.7'] · 'D.2' → ['D'] · 'foreword' → []. */
export function ancestorsOf(ref: string): string[] {
  if (FRONT_MATTER[ref.toLowerCase()]) return []
  const parts = ref.split('.')
  const chain: string[] = []
  for (let i = 1; i < parts.length; i++) chain.push(parts.slice(0, i).join('.'))
  return chain
}

export function parentOf(ref: string): string | null {
  const chain = ancestorsOf(ref)
  return chain.length ? chain[chain.length - 1] : null
}

/** True for 'A'..'R' style annex refs. */
export function isAnnexRef(ref: string): boolean {
  return /^[A-Z]/.test(ref) && !FRONT_MATTER[ref.toLowerCase()]
}

/** Human labels for the clause tag vocabulary used by the extraction pipeline. */
export const TAG_LABELS: Record<string, string> = {
  scope: 'Scope',
  definitions: 'Definitions',
  compliance: 'Compliance',
  general: 'General',
  load: 'Load estimation',
  'voltage-drop': 'Voltage drop',
  cables: 'Cables & conductors',
  'current-capacity': 'Current capacity',
  wireways: 'Conduit & wireways',
  'distribution-boards': 'Distribution boards',
  protection: 'Protection',
  'earth-leakage': 'Earth leakage',
  spd: 'Surge protection',
  'circuit-breakers': 'Circuit breakers',
  disconnection: 'Disconnection',
  fuses: 'Fuses',
  earthing: 'Earthing',
  bonding: 'Bonding',
  lighting: 'Lighting',
  sockets: 'Socket-outlets',
  appliances: 'Fixed appliances',
  'water-heaters': 'Water heaters',
  cooking: 'Cooking appliances',
  motors: 'Motors',
  'ev-charging': 'EV charging',
  'special-locations': 'Special locations',
  bathrooms: 'Bathrooms & showers',
  pools: 'Pools & fountains',
  saunas: 'Saunas',
  'construction-sites': 'Construction sites',
  agricultural: 'Agricultural',
  caravans: 'Caravans & marinas',
  medical: 'Medical locations',
  temporary: 'Temporary installs',
  elv: 'Extra-low voltage',
  stage: 'Stage & theatre',
  'emergency-lighting': 'Emergency lighting',
  'alternative-supply': 'Alternative supplies',
  pv: 'Solar PV',
  ups: 'UPS',
  generators: 'Generators',
  hv: 'High voltage',
  hazardous: 'Hazardous locations',
  dc: 'DC installations',
  'distribution-systems': 'Distribution systems',
  verification: 'Verification',
  inspection: 'Inspection',
  testing: 'Testing',
  coc: 'Certificate of Compliance',
  annex: 'Annex',
}

/** Top-level chapter descriptions for browse/dummies landing pages. */
export const CHAPTER_BLURBS: Record<string, string> = {
  '1': 'What the standard covers, and what it does not.',
  '2': 'Other standards this one references.',
  '3': 'Every defined term, from "accessible" to "wireway".',
  '4': 'Which component standards apply, plus notices and labels.',
  '5': 'The fundamentals: safety, voltage drop limits, disconnection, positioning.',
  '6': 'The big one — circuits, cables, current capacity, DBs, protection, earthing, sockets, appliances.',
  '7': 'Special locations: bathrooms, pools, PV & alternative supplies, DC, medical, construction sites.',
  '8': 'Verification, testing and the Certificate of Compliance.',
}
