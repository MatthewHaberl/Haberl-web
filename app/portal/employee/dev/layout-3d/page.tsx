'use client'

/**
 * Dev fixture for the 3D layout viewer — not linked from any navigation.
 * Visit: /portal/employee/dev/layout-3d
 *
 * Uses hardcoded data: 2-storey IBR, North 30° (8 panels) + West 25° (6 panels),
 * one DC string route + one AC run route.
 */

import dynamic from 'next/dynamic'
import { buildLayoutModel } from '@/lib/solar/job-layout-3d'
import type { CableRouteRow } from '@/lib/solar/job-layout-3d'

const JobLayout3DViewer = dynamic(
  () =>
    import('@/components/job-layout-3d/JobLayout3DViewer').then(
      (m) => m.JobLayout3DViewer,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center rounded-lg border border-border bg-muted text-sm text-muted-foreground" style={{ height: 480 }}>
        Loading 3D layout…
      </div>
    ),
  },
)

// Fixture: centroid at -26.2041° S, 28.0473° E (Johannesburg)
const CENTROID = { lat: -26.2041, lng: 28.0473 }

function offsetLatLng(baseLat: number, baseLng: number, dx: number, dz: number) {
  const cosLat = Math.cos(baseLat * Math.PI / 180)
  return {
    lat: baseLat - dz / 111320,       // dz south → decrease lat
    lng: baseLng + dx / (111320 * cosLat),
  }
}

// DC string: runs along the north roof face (5 m horizontally)
const dcPoints = [
  offsetLatLng(CENTROID.lat, CENTROID.lng, -2, -3),
  offsetLatLng(CENTROID.lat, CENTROID.lng,  2, -3),
  offsetLatLng(CENTROID.lat, CENTROID.lng,  2, -1),
]

// AC run: from inverter wall to the DB, short run
const acPoints = [
  offsetLatLng(CENTROID.lat, CENTROID.lng, -4, 2),
  offsetLatLng(CENTROID.lat, CENTROID.lng, -4, 4),
]

const FIXTURE_ROUTES: CableRouteRow[] = [
  {
    id: 'fix-dc-1',
    route_type: 'dc_string',
    label: 'PV string 1',
    points: dcPoints,
    measured_m: 5.8,
    vertical_m: 6,
    final_m: 13.0,
    sort_order: 0,
  },
  {
    id: 'fix-ac-1',
    route_type: 'ac_run',
    label: 'AC run 1',
    points: acPoints,
    measured_m: 2.2,
    vertical_m: 2,
    final_m: 4.6,
    sort_order: 1,
  },
]

const model = buildLayoutModel(
  [
    { azimuth: 0,   pitch: 30, panelCount: 8 },  // North face
    { azimuth: 270, pitch: 25, panelCount: 6 },  // West face
  ],
  'ibr',
  2,
  FIXTURE_ROUTES,
)

export default function Layout3DDevPage() {
  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto p-6">
      <div>
        <h1 className="text-lg font-bold text-primary">3D Layout — Dev Fixture</h1>
        <p className="text-sm text-muted-foreground mt-1">
          2-storey IBR · North 30° (8 panels) · West 25° (6 panels) · 1 DC string + 1 AC run
        </p>
      </div>

      <JobLayout3DViewer model={model} jobId="dev-fixture" />

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Model data</summary>
        <pre className="mt-2 p-3 bg-muted rounded overflow-auto">
          {JSON.stringify(model, null, 2)}
        </pre>
      </details>
    </div>
  )
}
