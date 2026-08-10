/**
 * LuxPower adapter — no public cloud API.
 * LuxPower sites require a local RS485 collector (Raspberry Pi / mini-PC)
 * that POSTs to /api/monitoring/local-push. This stub surfaces a clear error.
 */
import type { BrandAdapter, NormalisedReading } from '../types'
import { AdapterError } from '../types'

export const luxpowerAdapter: BrandAdapter = {
  // Credentials are accepted by the BrandAdapter contract but ignored here —
  // this stub always throws, so the parameter is omitted entirely.
  async fetchReading(): Promise<NormalisedReading> {
    throw new AdapterError(
      'LuxPower has no public cloud API. Install a local RS485 collector at this site to enable monitoring.',
      'luxpower',
      false
    )
  },
}
