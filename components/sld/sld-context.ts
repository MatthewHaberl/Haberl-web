'use client'

import { createContext, useContext } from 'react'
import type { DiagramLayerState } from '@/types/sld-components'

interface SLDContextType {
  layerVisibility: DiagramLayerState
  onWaypointChange: (edgeId: string, waypoints: Array<{ x: number; y: number }>) => void
  onEdgeLabelMove: (edgeId: string, offsetX: number, offsetY: number) => void
}

const DEFAULT_LAYERS: DiagramLayerState = { live: true, neutral: true, earth: true, communication: true }

export const SLDContext = createContext<SLDContextType>({
  layerVisibility: DEFAULT_LAYERS,
  onWaypointChange: () => {},
  onEdgeLabelMove: () => {},
})

export function useSLDContext() {
  return useContext(SLDContext)
}
