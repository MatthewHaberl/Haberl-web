'use client'

import { Line } from '@react-three/drei'
import type { CableRoute3DData } from '@/lib/solar/job-layout-3d'
import { ROUTE_TYPE_META } from '@/lib/solar/cable-routes'

interface CableRoute3DProps {
  route: CableRoute3DData
}

/** Draws a single cable route as a coloured 3D polyline. */
export function CableRoute3D({ route }: CableRoute3DProps) {
  if (route.points3d.length < 2) return null
  const meta = ROUTE_TYPE_META[route.route_type]

  return (
    <Line
      points={route.points3d}
      color={meta.color}
      lineWidth={meta.dashed ? 2 : 3}
      dashed={meta.dashed ?? false}
      dashSize={0.3}
      gapSize={0.15}
    />
  )
}
