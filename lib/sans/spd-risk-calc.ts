/**
 * SANS 10142-1 Annex Q — simplified surge-protection risk assessment.
 *
 * Method (Q.1.2.4–Q.1.2.6): look up the site's lightning ground-flash density
 * Ng (table Q.1.3 / SANS 10313), pick the band row in table Q.1.1 (residential)
 * or Q.1.2 (commercial/industrial), read the critical service-line length for
 * the environment. If the actual service line is longer, install at least the
 * tabulated SPD in the main DB — plus a class I arrester when an external
 * lightning-protection system is fitted.
 */
import type { Verdict } from './calculators'
import { SPD_BANDS_COMMERCIAL, SPD_BANDS_RESIDENTIAL, LIGHTNING_TOWNS, type SpdBand } from './tables/spd-risk'

export interface SpdRiskInput {
  structure: 'residential' | 'commercial'
  /** Lightning ground-flash density, flashes/km²/year. */
  ng: number
  environment: 'rural' | 'suburban' | 'urban'
  /** Kiosk → point of entry, metres (Q.1.2.5 note 2). */
  serviceLineM: number
  externalLps: boolean
}

export interface SpdRiskResult {
  band: SpdBand
  criticalLengthM: number | null
  spdType: string | null
  ratingKa: number | null
  required: boolean
  verdicts: Verdict[]
}

export function townNg(town: string): number | null {
  const hit = LIGHTNING_TOWNS.find((t) => t.town.toLowerCase() === town.trim().toLowerCase())
  return hit ? hit.ng : null
}

export function spdRisk(input: SpdRiskInput): SpdRiskResult | { error: string } {
  if (!(input.ng >= 0)) return { error: 'Enter the lightning ground-flash density (pick a town or type the Ng value)' }
  if (!(input.serviceLineM > 0)) return { error: 'Enter the service-line length (kiosk to point of entry)' }

  const bands = input.structure === 'residential' ? SPD_BANDS_RESIDENTIAL : SPD_BANDS_COMMERCIAL
  const band = bands.find((b) => input.ng >= b.ngMin && (b.ngMaxExclusive == null || input.ng < b.ngMaxExclusive))
  if (!band) return { error: 'No table band covers this Ng value' }

  const req = band.byEnvironment[input.environment]
  const required = req.exceedsM != null && input.serviceLineM > req.exceedsM

  const verdicts: Verdict[] = []
  const bandLabel = band.ngMaxExclusive == null ? `Ng ≥ ${band.ngMin}` : `${band.ngMin} ≤ Ng < ${band.ngMaxExclusive}`

  if (required) {
    verdicts.push({
      status: 'warning',
      headline: `SPD recommended: install at least a class II (${req.spdType}) SPD, ≥ ${req.ratingKa} kA, in the main DB`,
      detail: `Ng ${input.ng} puts the site in the ${bandLabel} band; in a ${input.environment} environment the critical service-line length is ${req.exceedsM} m and this line runs ${input.serviceLineM} m. Table ${input.structure === 'residential' ? 'Q.1.1' : 'Q.1.2'}.`,
      clauseRefs: ['Q.1.2.5', 'Q.1.2.6'],
    })
    if (input.externalLps) {
      verdicts.push({
        status: 'warning',
        headline: 'External lightning protection fitted → add a class I SPD',
        detail: 'With an external lightning-protection system, a class I (lightning-current) arrester goes in the main DB in conjunction with the class II SPD.',
        clauseRefs: ['Q.1.2.6', 'I.1.2'],
      })
    }
  } else {
    verdicts.push({
      status: 'pass',
      headline: 'SPD not required by the simplified assessment',
      detail: `Ng ${input.ng} (${bandLabel} band), ${input.environment} environment: the critical service-line length is ${req.exceedsM ?? '—'} m and this line runs ${input.serviceLineM} m. Structures the simplified method doesn't represent need a full SANS 62305-2 assessment (Q.1.1.1).`,
      clauseRefs: ['Q.1.2.5', 'Q.1.1.1'],
    })
  }

  return { band, criticalLengthM: req.exceedsM, spdType: req.spdType, ratingKa: req.ratingKa, required, verdicts }
}
