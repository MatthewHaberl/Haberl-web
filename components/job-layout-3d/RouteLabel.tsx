'use client'

import { Html } from '@react-three/drei'
import type { CableRoute3DData } from '@/lib/solar/job-layout-3d'
import { ROUTE_TYPE_META } from '@/lib/solar/cable-routes'

interface RouteLabelProps {
  route: CableRoute3DData
}

/** A floating HTML label pinned to the midpoint of a cable route. */
export function RouteLabel({ route }: RouteLabelProps) {
  if (route.points3d.length < 2) return null

  const mid = route.points3d[Math.floor(route.points3d.length / 2)]
  const meta = ROUTE_TYPE_META[route.route_type]
  const text = route.label || meta.short
  const lengthStr = `${route.final_m.toFixed(1)} m`

  return (
    <Html
      position={mid}
      center
      distanceFactor={12}
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.75)',
          color: meta.color,
          padding: '2px 6px',
          borderRadius: 4,
          fontSize: 11,
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          lineHeight: 1.4,
        }}
      >
        {text}
        <span style={{ color: '#94a3b8', marginLeft: 4 }}>{lengthStr}</span>
      </div>
    </Html>
  )
}
