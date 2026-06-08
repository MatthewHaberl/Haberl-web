/**
 * LuxPower adapter — no public cloud API.
 * LuxPower sites require a local RS485 collector (Raspberry Pi / mini-PC)
 * that POSTs to /api/monitoring/local-push. This stub surfaces a clear error.
 */
import type { BrandAdapter, BrandCredentials, NormalisedReading } from '../types'
import { AdapterError } from '../types'

export const luxpowerAdapter: BrandAdapter = {
  async fetchReading(_credentials: BrandCredentials): Promise<NormalisedReading> {
    throw new AdapterError(
      'LuxPower has no public cloud API. Install a local RS485 collector at this site to enable monitoring.',
      'luxpower',
      false
    )
  },
}
