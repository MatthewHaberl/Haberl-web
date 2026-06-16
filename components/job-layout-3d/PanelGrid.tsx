'use client'

import { useMemo } from 'react'
import { panelGrid, panelOffsets, PANEL_W, PANEL_H, PANEL_THICKNESS } from '@/lib/solar/job-layout-3d'

interface PanelGridProps {
  panelCount: number
  faceW: number
  faceH: number
}

/** Renders a grid of solar panel meshes in the local space of a RoofFace. */
export function PanelGrid({ panelCount, faceW, faceH }: PanelGridProps) {
  const { cols, rows } = useMemo(
    () => panelGrid(panelCount, faceW, faceH),
    [panelCount, faceW, faceH],
  )
  const offsets = useMemo(
    () => panelOffsets(panelCount, cols, rows),
    [panelCount, cols, rows],
  )

  return (
    <>
      {offsets.map(([ox, oy], i) => (
        <mesh key={i} position={[ox, oy, PANEL_THICKNESS / 2 + 0.01]}>
          <boxGeometry args={[PANEL_W, PANEL_H, PANEL_THICKNESS]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
    </>
  )
}
