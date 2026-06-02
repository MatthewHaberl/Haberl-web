'use client'

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getBezierPath,
  getStraightPath,
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

// Stroke styles by circuit type
const STROKE_DASH: Record<string, string | undefined> = {
  earth: '6 3',
}

export type EdgeRoutingType = 'smoothstep' | 'bezier' | 'straight'

export function CableEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  data,
  label,
}: EdgeProps) {
  const d = data as (CableEdgeData & { routingType?: EdgeRoutingType }) | undefined
  const color = CIRCUIT_COLOR[d?.circuitType ?? 'ac']
  const strokeDash = STROKE_DASH[d?.circuitType ?? '']
  const routing: EdgeRoutingType = d?.routingType ?? 'smoothstep'

  let path: string
  let labelX: number
  let labelY: number

  if (routing === 'bezier') {
    ;[path, labelX, labelY] = getBezierPath({
      sourceX, sourceY, sourcePosition,
      targetX, targetY, targetPosition,
    })
  } else if (routing === 'straight') {
    ;[path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  } else {
    ;[path, labelX, labelY] = getSmoothStepPath({
      sourceX, sourceY, sourcePosition,
      targetX, targetY, targetPosition,
      borderRadius: 12,
    })
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: 2.5,
          strokeDasharray: strokeDash,
        }}
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
