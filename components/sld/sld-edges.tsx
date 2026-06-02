'use client'

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react'
import type { CableEdgeData } from '@/lib/solar/sld-builder'
import { CLR } from './sld-nodes'

const CIRCUIT_COLOR: Record<string, string> = {
  dc:      CLR.dc,
  ac:      CLR.ac,
  battery: CLR.bat,
  earth:   CLR.earth,
}

export function CableEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  data,
  label,
}: EdgeProps) {
  const d = data as CableEdgeData | undefined
  const color = CIRCUIT_COLOR[d?.circuitType ?? 'ac']

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 12,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: color, strokeWidth: 2.5 }}
        markerEnd={`url(#rf__arrowclosed-${color.replace('#', '')})`}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              background: '#fff',
              border: `1.5px solid ${color}`,
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 9,
              color,
              fontWeight: 700,
              fontFamily: 'ui-monospace, monospace',
              whiteSpace: 'nowrap',
              lineHeight: 1.5,
              boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
            }}
          >
            {label as string}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const edgeTypes = {
  cable: CableEdge,
}
