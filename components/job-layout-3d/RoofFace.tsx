'use client'

import type { RoofFace3D } from '@/lib/solar/job-layout-3d'
import { PanelGrid } from './PanelGrid'

interface RoofFaceProps {
  face: RoofFace3D
}

/** A single angled roof plane with a panel grid in its local coordinate space. */
export function RoofFace({ face }: RoofFaceProps) {
  return (
    <group
      position={face.center}
      rotation={face.rotation}
    >
      {/* Roof surface */}
      <mesh>
        <planeGeometry args={[face.faceW, face.faceH]} />
        <meshStandardMaterial color="#94a3b8" side={2} roughness={0.8} />
      </mesh>

      {/* Panel array */}
      {face.panelCount > 0 && (
        <PanelGrid
          panelCount={face.panelCount}
          faceW={face.faceW}
          faceH={face.faceH}
        />
      )}
    </group>
  )
}
