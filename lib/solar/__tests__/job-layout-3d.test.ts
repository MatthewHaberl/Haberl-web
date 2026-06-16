// Run with: npx tsx --test lib/solar/__tests__/job-layout-3d.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeRoofFace,
  panelGrid,
  panelOffsets,
  projectToBuilding,
  buildLayoutModel,
  PANEL_W,
  PANEL_H,
  PANEL_GAP,
} from '../job-layout-3d'

const EPS = 0.01  // tolerance in metres

// ── computeRoofFace ──────────────────────────────────────────────────────────

test('North face (az=0, pitch=30) — normal points toward −Z (north)', () => {
  const face = computeRoofFace({ azimuth: 0, pitch: 30, panelCount: 8 }, 0, 10, 8, 6)
  // Center Z should be negative (toward north = −Z)
  assert.ok(face.center[2] < 0, `Expected center.z < 0, got ${face.center[2]}`)
  // Center X should be ~0 (symmetric on north axis)
  assert.ok(Math.abs(face.center[0]) < EPS, `Expected center.x ≈ 0, got ${face.center[0]}`)
  // Center Y should be above wall height
  assert.ok(face.center[1] > 6, `Expected center.y > wallH(6), got ${face.center[1]}`)
})

test('East face (az=90, pitch=20) — normal points toward +X (east)', () => {
  const face = computeRoofFace({ azimuth: 90, pitch: 20, panelCount: 6 }, 1, 10, 8, 6)
  // Center X should be positive (toward east = +X)
  assert.ok(face.center[0] > 0, `Expected center.x > 0, got ${face.center[0]}`)
  // Center Z should be ~0 (symmetric on east axis)
  assert.ok(Math.abs(face.center[2]) < EPS, `Expected center.z ≈ 0, got ${face.center[2]}`)
})

test('South face (az=180, pitch=25) — normal points toward +Z (south)', () => {
  const face = computeRoofFace({ azimuth: 180, pitch: 25, panelCount: 4 }, 2, 10, 8, 6)
  assert.ok(face.center[2] > 0, `Expected center.z > 0, got ${face.center[2]}`)
})

test('Flat roof face — center Y equals wallH, faceH proportional', () => {
  const face = computeRoofFace({ azimuth: 0, pitch: 0, panelCount: 10 }, 0, 10, 8, 3)
  // With pitch=0, center Y should be at wallH (no rise)
  assert.ok(Math.abs(face.center[1] - 3) < EPS, `Expected center.y ≈ 3, got ${face.center[1]}`)
})

// ── panelGrid ───────────────────────────────────────────────────────────────

test('panelGrid — 7 panels on narrow face (4 m) → 3 cols × 3 rows', () => {
  // 4 m face: floor((4+0.05)/(1.134+0.05)) = 3 cols max
  const { cols, rows } = panelGrid(7, 4.0, 8)
  assert.equal(cols, 3)
  assert.equal(rows, 3)
})

test('panelGrid — 7 panels on wide face (10 m) → 7 cols × 1 row (all fit in one row)', () => {
  const { cols, rows } = panelGrid(7, 10, 8)
  assert.equal(cols, 7)
  assert.equal(rows, 1)
})

test('panelGrid — 1 panel → 1 col × 1 row', () => {
  const { cols, rows } = panelGrid(1, 10, 8)
  assert.equal(cols, 1)
  assert.equal(rows, 1)
})

test('panelGrid — 0 panels → 0 cols × 0 rows', () => {
  const { cols, rows } = panelGrid(0, 10, 8)
  assert.equal(cols, 0)
  assert.equal(rows, 0)
})

test('panelGrid — 14 panels on 10 m face → fits in ≤ 3 rows', () => {
  const { rows } = panelGrid(14, 10, 8)
  assert.ok(rows <= 3, `Expected rows ≤ 3, got ${rows}`)
})

// ── panelOffsets ─────────────────────────────────────────────────────────────

test('panelOffsets — 7 panels produces exactly 7 offsets', () => {
  const offsets = panelOffsets(7, 3, 3)
  assert.equal(offsets.length, 7)
})

test('panelOffsets — offsets are centred (mean X ≈ 0, mean Y ≈ 0)', () => {
  const offsets = panelOffsets(9, 3, 3)
  const meanX = offsets.reduce((s, [x]) => s + x, 0) / offsets.length
  const meanY = offsets.reduce((s, [, y]) => s + y, 0) / offsets.length
  assert.ok(Math.abs(meanX) < EPS, `Expected meanX ≈ 0, got ${meanX}`)
  assert.ok(Math.abs(meanY) < EPS, `Expected meanY ≈ 0, got ${meanY}`)
})

// ── projectToBuilding ─────────────────────────────────────────────────────────

test('projectToBuilding — centroid maps to (0, 0)', () => {
  const centroid = { lat: -26.0, lng: 28.0 }
  const [x, z] = projectToBuilding(centroid, centroid)
  assert.ok(Math.abs(x) < EPS, `Expected x ≈ 0, got ${x}`)
  assert.ok(Math.abs(z) < EPS, `Expected z ≈ 0, got ${z}`)
})

test('projectToBuilding — 5 m east offset → x ≈ 5, z ≈ 0', () => {
  const centroid = { lat: -26.0, lng: 28.0 }
  const cosLat = Math.cos(-26.0 * Math.PI / 180)
  const deltaLng = 5 / (111320 * cosLat)
  const point = { lat: -26.0, lng: 28.0 + deltaLng }
  const [x, z] = projectToBuilding(point, centroid)
  assert.ok(Math.abs(x - 5) < EPS, `Expected x ≈ 5, got ${x}`)
  assert.ok(Math.abs(z) < EPS, `Expected z ≈ 0, got ${z}`)
})

test('projectToBuilding — 5 m north offset → x ≈ 0, z ≈ −5', () => {
  const centroid = { lat: -26.0, lng: 28.0 }
  const deltaLat = 5 / 111320
  const point = { lat: -26.0 + deltaLat, lng: 28.0 }
  const [x, z] = projectToBuilding(point, centroid)
  assert.ok(Math.abs(x) < EPS, `Expected x ≈ 0, got ${x}`)
  assert.ok(Math.abs(z - (-5)) < EPS, `Expected z ≈ −5, got ${z}`)
})

// ── buildLayoutModel ─────────────────────────────────────────────────────────

test('buildLayoutModel — null segments produces model with hasDesign=false', () => {
  const model = buildLayoutModel(null, 'tile', 2, [])
  assert.equal(model.hasDesign, false)
  assert.equal(model.faces.length, 0)
})

test('buildLayoutModel — 2 segments produces 2 faces', () => {
  const model = buildLayoutModel(
    [{ azimuth: 0, pitch: 30, panelCount: 8 }, { azimuth: 180, pitch: 30, panelCount: 6 }],
    'ibr', 2, [],
  )
  assert.equal(model.hasDesign, true)
  assert.equal(model.faces.length, 2)
})

test('buildLayoutModel — storeys=2 → wallH=6', () => {
  const model = buildLayoutModel([{ azimuth: 0, pitch: 30, panelCount: 4 }], 'tile', 2, [])
  assert.equal(model.wallH, 6)
})

test('buildLayoutModel — flat roofType → roofPeak equals wallH', () => {
  const model = buildLayoutModel([{ azimuth: 0, pitch: 0, panelCount: 4 }], 'flat', 1, [])
  assert.ok(Math.abs(model.roofPeak - model.wallH) < EPS)
})

test('buildLayoutModel — no cable routes → hasCableRoutes=false', () => {
  const model = buildLayoutModel([{ azimuth: 0, pitch: 20, panelCount: 6 }], 'tile', 1, [])
  assert.equal(model.hasCableRoutes, false)
})
