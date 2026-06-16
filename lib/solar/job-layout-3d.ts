/**
 * job-layout-3d.ts — pure coordinate math for the 3D job layout visualiser.
 *
 * Coordinate system: right-handed, origin at building centroid.
 *   X = East, Y = Up, Z = South   (North = −Z, so compass bearing 0 → −Z)
 *
 * All distances in metres.
 */

import type { CableRouteType } from '@/types/database'
import type { RoutePoint } from './cable-routes'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DesignSegment {
  azimuth: number     // compass degrees: 0=N 90=E 180=S 270=W
  pitch: number       // degrees from horizontal (0=flat, 90=vertical)
  panelCount: number
}

export interface CableRouteRow {
  id: string
  route_type: CableRouteType
  label: string | null
  points: RoutePoint[]
  measured_m: number
  vertical_m: number
  final_m: number
  sort_order: number
}

/** Pre-processed 3D position for a roof face, ready for Three.js. */
export interface RoofFace3D {
  /** Compass azimuth (degrees). */
  azimuth: number
  /** Slope from horizontal (degrees). */
  pitch: number
  panelCount: number
  /** Centre of the face in world space [x, y, z]. */
  center: [number, number, number]
  /** Euler rotation [x, y, z] in radians for the PlaneGeometry. */
  rotation: [number, number, number]
  /** Width of the face along the eave (metres). */
  faceW: number
  /** Height of the face up the slope (metres). */
  faceH: number
  /** Label: "N face (8 panels)" */
  label: string
  /** Index into design_segments array. */
  index: number
}

/** A single 3D cable route, ready for <Line>. */
export interface CableRoute3DData {
  id: string
  route_type: CableRouteType
  label: string
  /** World-space 3-component positions for the <Line> points prop. */
  points3d: [number, number, number][]
  final_m: number
}

/** Full layout model consumed by the 3D viewer. */
export interface LayoutModel {
  buildingW: number
  buildingD: number
  wallH: number
  roofPeak: number
  /** Flat or pitched. */
  roofType: 'tile' | 'ibr' | 'flat'
  faces: RoofFace3D[]
  cableRoutes: CableRoute3DData[]
  /** World position for the inverter stub [x, y, z]. */
  inverterPos: [number, number, number]
  hasCableRoutes: boolean
  hasDesign: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Standard 585 W panel dimensions (metres). */
export const PANEL_W = 1.134
export const PANEL_H = 1.762
export const PANEL_THICKNESS = 0.04
export const PANEL_GAP = 0.05

const STOREY_H = 3.0
const DEFAULT_BUILDING_W = 10
const DEFAULT_BUILDING_D = 8

// ── Utility: compass → compass label ──────────────────────────────────────────

function compassLabel(azimuth: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const i = Math.round(((azimuth % 360) + 360) % 360 / 45) % 8
  return dirs[i]
}

// ── Panel grid geometry ────────────────────────────────────────────────────────

/** Compute (cols, rows) for N panels that best fit the face dimensions. */
export function panelGrid(panelCount: number, faceW: number, faceH: number): { cols: number; rows: number } {
  if (panelCount <= 0) return { cols: 0, rows: 0 }
  // Fit as many columns as possible given face width
  const maxCols = Math.max(1, Math.floor((faceW + PANEL_GAP) / (PANEL_W + PANEL_GAP)))
  const cols = Math.min(panelCount, maxCols)
  const rows = Math.ceil(panelCount / cols)
  return { cols, rows }
}

/** Panel local offsets within a face (centred, in face-local XY space).
 *  +X = along eave right, +Y = up the slope.
 */
export function panelOffsets(panelCount: number, cols: number, rows: number): [number, number][] {
  const offsets: [number, number][] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (offsets.length >= panelCount) break
      const x = (c - (cols - 1) / 2) * (PANEL_W + PANEL_GAP)
      const y = (r - (rows - 1) / 2) * (PANEL_H + PANEL_GAP)
      offsets.push([x, y])
    }
  }
  return offsets
}

// ── Roof face 3D placement ────────────────────────────────────────────────────

function degToRad(d: number): number { return d * Math.PI / 180 }

/**
 * Compute the 3D placement data for a roof face given azimuth + pitch.
 * The face sits at the top edge of the building wall, eave at wallH,
 * and rises by `faceH` up the slope.
 */
export function computeRoofFace(
  seg: DesignSegment,
  index: number,
  buildingW: number,
  buildingD: number,
  wallH: number,
): RoofFace3D {
  const az = degToRad(seg.azimuth)
  // Outward normal in XZ plane (where the face looks toward)
  const nx = Math.sin(az)
  const nz = -Math.cos(az)   // North = −Z

  const pitchRad = degToRad(seg.pitch)
  const faceW = buildingW
  // Slant height: how far up the slope to reach the ridge
  const faceH = seg.pitch > 0
    ? (buildingD / 2) / Math.cos(pitchRad)
    : buildingD / 2

  // Eave centre sits at the building top-edge in the outward direction
  const eaveX = nx * (buildingD / 2)
  const eaveZ = nz * (buildingD / 2)

  // Face centre: halfway up the slope from eave
  const slopeOffset = faceH / 2
  const centerX = eaveX + nx * slopeOffset * Math.cos(pitchRad)
  const centerY = wallH + slopeOffset * Math.sin(pitchRad)
  const centerZ = eaveZ + nz * slopeOffset * Math.cos(pitchRad)

  // Rotation: PlaneGeometry starts horizontal (facing up), we:
  //   1. Tilt by pitch around the eave axis (perpendicular to azimuth direction)
  //   2. Yaw to face the right compass direction
  const rotX = -(Math.PI / 2 - pitchRad)  // tilt up from flat
  const rotY = -az                          // yaw to compass direction

  return {
    azimuth: seg.azimuth,
    pitch: seg.pitch,
    panelCount: seg.panelCount,
    center: [centerX, centerY, centerZ],
    rotation: [rotX, rotY, 0],
    faceW,
    faceH,
    label: `${compassLabel(seg.azimuth)} face (${seg.panelCount} panels)`,
    index,
  }
}

// ── Lat/lng → building-relative XZ ───────────────────────────────────────────

export interface LatLng { lat: number; lng: number }

/** Compute centroid of all points across all routes. */
export function routesCentroid(routes: CableRouteRow[]): LatLng | null {
  const all: LatLng[] = routes.flatMap((r) => r.points)
  if (all.length === 0) return null
  return {
    lat: all.reduce((s, p) => s + p.lat, 0) / all.length,
    lng: all.reduce((s, p) => s + p.lng, 0) / all.length,
  }
}

/**
 * Project a lat/lng point to building-relative world XZ coordinates.
 * Flat-earth approximation — accurate to ±0.1 m within 200 m of centroid.
 */
export function projectToBuilding(
  point: LatLng,
  centroid: LatLng,
): [number, number] {
  const cosLat = Math.cos(centroid.lat * Math.PI / 180)
  const x = (point.lng - centroid.lng) * 111320 * cosLat  // East = +X
  const z = -(point.lat - centroid.lat) * 111320           // North = −Z
  return [x, z]
}

// ── Cable routes → 3D polylines ───────────────────────────────────────────────

/**
 * Convert a cable route's lat/lng points into world-space 3D coordinates.
 * All points start at roof level (wallH + 0.1 m above).
 * A synthetic drop segment is appended using vertical_m.
 */
export function buildCableRoute3D(
  route: CableRouteRow,
  centroid: LatLng,
  wallH: number,
  inverterY: number,
): CableRoute3DData {
  const roofY = wallH + 0.1

  const pts3d: [number, number, number][] = route.points.map((p) => {
    const [x, z] = projectToBuilding(p, centroid)
    return [x, roofY, z]
  })

  // Append vertical drop segment if there are points
  if (pts3d.length > 0) {
    const last = pts3d[pts3d.length - 1]
    const dropY = route.route_type === 'earth' ? 0.1 : inverterY
    // Point directly above final position at roof height, then drop
    pts3d.push([last[0], dropY, last[2]])
  }

  return {
    id: route.id,
    route_type: route.route_type,
    label: route.label ?? '',
    points3d: pts3d,
    final_m: route.final_m,
  }
}

// ── Main model builder ────────────────────────────────────────────────────────

export function buildLayoutModel(
  designSegments: DesignSegment[] | null | undefined,
  roofType: 'tile' | 'ibr' | 'flat' | null | undefined,
  storeys: number | null | undefined,
  cableRoutes: CableRouteRow[],
  buildingWidthM?: number | null,
  buildingDepthM?: number | null,
): LayoutModel {
  const resolvedRoofType = (roofType === 'flat' ? 'flat' : roofType ?? 'tile') as 'tile' | 'ibr' | 'flat'
  const resolvedStoreys = storeys && storeys > 0 ? storeys : 1
  const wallH = resolvedStoreys * STOREY_H
  const buildingW = buildingWidthM && buildingWidthM > 0 ? buildingWidthM : DEFAULT_BUILDING_W
  const buildingD = buildingDepthM && buildingDepthM > 0 ? buildingDepthM : DEFAULT_BUILDING_D

  // Ridge height: mid-span rise based on average pitch
  const segments = designSegments ?? []
  const avgPitch = segments.length > 0
    ? segments.reduce((s, seg) => s + seg.pitch, 0) / segments.length
    : 20
  const roofPeak = resolvedRoofType === 'flat'
    ? wallH
    : wallH + (buildingD / 2) * Math.tan(degToRad(avgPitch))

  const faces = segments.map((seg, i) =>
    computeRoofFace(seg, i, buildingW, buildingD, wallH)
  )

  // Inverter stub: mid-height on the closest face's wall, or front wall default
  const inverterY = wallH * 0.45
  const inverterPos: [number, number, number] = [-buildingW / 2 + 0.6, inverterY, buildingD / 2 - 0.3]

  // Cable routes
  const centroid = routesCentroid(cableRoutes)
  const cableRoutes3D: CableRoute3DData[] = centroid
    ? cableRoutes
        .filter((r) => r.points.length >= 2)
        .map((r) => buildCableRoute3D(r, centroid, wallH, inverterY))
    : []

  return {
    buildingW,
    buildingD,
    wallH,
    roofPeak,
    roofType: resolvedRoofType,
    faces,
    cableRoutes: cableRoutes3D,
    inverterPos,
    hasCableRoutes: cableRoutes3D.length > 0,
    hasDesign: segments.length > 0,
  }
}
