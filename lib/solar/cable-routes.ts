import { geoDistanceM } from './google-solar'
import type { CableRouteType } from '@/types/database'

/** Display + colour metadata per run type. Colours match the SLD legend. */
export const ROUTE_TYPE_META: Record<
  CableRouteType,
  { label: string; short: string; color: string; dashed?: boolean }
> = {
  dc_string: { label: 'PV string → Inverter (DC)', short: 'PV string', color: '#f97316' },
  ac_run:    { label: 'Inverter → DB (AC)',        short: 'AC run',    color: '#2563eb' },
  battery:   { label: 'Battery → Inverter',         short: 'Battery',   color: '#16a34a' },
  earth:     { label: 'Earth run',                  short: 'Earth',     color: '#65a30d', dashed: true },
}

export const ROUTE_TYPE_ORDER: CableRouteType[] = ['dc_string', 'ac_run', 'battery', 'earth']

export interface RoutePoint {
  lat: number
  lng: number
}

/** A route being edited client-side (DB row shape minus computed/meta fields). */
export interface RouteDraft {
  id: string
  route_type: CableRouteType
  label: string
  points: RoutePoint[]
  measured_m: number
  vertical_m: number
  slack_pct: number
}

/** Horizontal geodesic length of a drawn polyline. */
export function polylineLengthM(points: RoutePoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += geoDistanceM(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng)
  }
  return Math.round(total * 10) / 10
}

function parseStoreys(storeys: string | null | undefined): number {
  const n = parseInt(String(storeys ?? '1'), 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 3) : 1
}

/**
 * Default vertical allowance per run type. The satellite view only measures
 * the horizontal path — these cover the up/down legs (roof → wall-mounted
 * inverter, DB drops, spike runs). Always editable per route.
 */
export function defaultVerticalM(routeType: CableRouteType, storeys: string | null | undefined): number {
  switch (routeType) {
    case 'dc_string': return parseStoreys(storeys) * 3 // roof down to inverter
    case 'ac_run':    return 2                          // inverter ↔ DB wall drops
    case 'battery':   return 1                          // same room as inverter
    case 'earth':     return 2                          // DB down to spikes
  }
}

/** (measured + vertical) × (1 + slack), rounded UP to the next 0.5 m. */
export function computeFinalM(measuredM: number, verticalM: number, slackPct: number): number {
  const raw = (measuredM + verticalM) * (1 + slackPct / 100)
  return Math.ceil(raw * 2) / 2
}

export interface RouteTotals {
  /** Per-DC-run final lengths — worst case drives the voltage-drop check. */
  dcRunsM: number[]
  dcM: number
  acM: number
  batteryM: number
  earthM: number
  totalM: number
}

export function routeTotals(routes: RouteDraft[]): RouteTotals {
  const finals = routes.map((r) => ({ type: r.route_type, m: computeFinalM(r.measured_m, r.vertical_m, r.slack_pct) }))
  const sum = (type: CableRouteType) =>
    Math.round(finals.filter((f) => f.type === type).reduce((s, f) => s + f.m, 0) * 10) / 10
  const dcRunsM = finals.filter((f) => f.type === 'dc_string').map((f) => f.m)
  const totals = {
    dcRunsM,
    dcM: sum('dc_string'),
    acM: sum('ac_run'),
    batteryM: sum('battery'),
    earthM: sum('earth'),
    totalM: 0,
  }
  totals.totalM = Math.round((totals.dcM + totals.acM + totals.batteryM + totals.earthM) * 10) / 10
  return totals
}

/** Auto label like "PV string 2" based on how many of that type exist. */
export function nextRouteLabel(routeType: CableRouteType, routes: RouteDraft[]): string {
  const count = routes.filter((r) => r.route_type === routeType).length
  return `${ROUTE_TYPE_META[routeType].short} ${count + 1}`
}
