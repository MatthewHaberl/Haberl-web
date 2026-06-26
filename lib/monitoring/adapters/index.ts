import type { BrandAdapter, MonitoringBrand } from '../types'
import { AdapterError } from '../types'
import { solarmanAdapter } from './solarman'
import { sunsynkAdapter }  from './sunsynk'
import { sigenegyAdapter } from './sigenergy'
import { foxessAdapter }   from './foxess'
import { growattAdapter }  from './growatt'
import { victronAdapter }  from './victron'
import { solaxAdapter }    from './solax'
import { solisAdapter }    from './solis'
import { goodweAdapter }   from './goodwe'
import { huaweiAdapter }   from './huawei'
import { dessmonitorAdapter } from './dessmonitor'
import { luxpowerAdapter } from './luxpower'

function notImplemented(brand: MonitoringBrand): BrandAdapter {
  return {
    async fetchReading() {
      throw new AdapterError(`${brand} adapter not yet implemented`, brand, false)
    },
  }
}

const adapters: Record<MonitoringBrand, BrandAdapter> = {
  // Sunsynk's own cloud (api.sunsynk.net) — app login only, no Solarman account
  sunsynk:   sunsynkAdapter,
  // Solarman cloud backend — Deye reports here
  deye:      solarmanAdapter,
  // Individual cloud APIs
  sigenergy: sigenegyAdapter,
  foxess:    foxessAdapter,
  growatt:   growattAdapter,
  victron:   victronAdapter,
  solax:     solaxAdapter,
  solis:     solisAdapter,
  goodwe:    goodweAdapter,
  huawei:    huaweiAdapter,
  // Eybond cloud (SmartESS / WatchPower apps) — reverse-engineered, login only
  dessmonitor: dessmonitorAdapter,
  // Local RS485 only — no public cloud API
  luxpower:  luxpowerAdapter,
  // Local push endpoint (Pi/ESP device POSTs to /api/monitoring/local-push)
  local:     notImplemented('local'),
}

export function getAdapter(brand: MonitoringBrand): BrandAdapter {
  return adapters[brand]
}

export { AdapterError }
