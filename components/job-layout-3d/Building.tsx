'use client'

import type { LayoutModel } from '@/lib/solar/job-layout-3d'
import { RoofFace } from './RoofFace'

interface BuildingProps {
  model: LayoutModel
}

/**
 * Renders the building shell: box walls, ridge cap, and roof faces.
 * All dimensions come from the LayoutModel computed in job-layout-3d.ts.
 */
export function Building({ model }: BuildingProps) {
  const { buildingW, buildingD, wallH, roofType, faces } = model

  return (
    <group>
      {/* Walls */}
      <mesh position={[0, wallH / 2, 0]}>
        <boxGeometry args={[buildingW, wallH, buildingD]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.9} />
      </mesh>

      {/* Floor slab */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[buildingW + 2, 0.1, buildingD + 2]} />
        <meshStandardMaterial color="#cbd5e1" roughness={1} />
      </mesh>

      {/* Roof faces (pitched) */}
      {roofType !== 'flat' && faces.map((face) => (
        <RoofFace key={face.index} face={face} />
      ))}

      {/* Flat roof cap */}
      {roofType === 'flat' && (
        <mesh position={[0, wallH + 0.05, 0]}>
          <boxGeometry args={[buildingW, 0.1, buildingD]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.8} />
        </mesh>
      )}

      {/* Flat roof panels */}
      {roofType === 'flat' && faces.map((face) => (
        <RoofFace key={face.index} face={face} />
      ))}

      {/* Inverter stub box */}
      <mesh position={model.inverterPos}>
        <boxGeometry args={[0.5, 0.4, 0.2]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  )
}
