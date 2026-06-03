'use client'

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getBezierPath,
  getStraightPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react'
import type { CableEdgeData } from '@/lib/solar/sld-builder'
import { CLR } from './sld-nodes'
import { useSLDContext } from './sld-context'
import { isLayerVisible } from '@/lib/solar/circuit-layer-manager'

const CIRCUIT_COLOR: Record<string, string> = {
  dc:            CLR.dc,
  ac:            CLR.ac,
  battery:       CLR.bat,
  earth:         CLR.earth,
  communication: '#f97316',
}

const STROKE_DASH: Record<string, string | undefined> = {
  earth:         '6 3',
  communication: '5 4',
}

export type EdgeRoutingType = 'smoothstep' | 'bezier' | 'straight'

// Build a polyline SVG path through all waypoints
function buildPolylinePath(
  sx: number, sy: number,
  tx: number, ty: number,
  waypoints: Array<{ x: number; y: number }>,
): [string, number, number] {
  const pts = [{ x: sx, y: sy }, ...waypoints, { x: tx, y: ty }]
  const path = 'M ' + pts.map((p) => `${p.x} ${p.y}`).join(' L ')
  const mid = pts[Math.floor(pts.length / 2)]
  return [path, mid.x, mid.y]
}

export function CableEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  data,
  label,
  selected,
}: EdgeProps) {
  const d = data as CableEdgeData | undefined
  const { layerVisibility, onWaypointChange } = useSLDContext()
  const { screenToFlowPosition } = useReactFlow()

  // Layer visibility check
  const circuitLayer = (d as any)?.circuitLayer as string | undefined
  if (circuitLayer && !isLayerVisible(layerVisibility, circuitLayer)) {
    return null
  }

  const colorKey = circuitLayer ?? d?.circuitType ?? 'ac'
  const color = CIRCUIT_COLOR[colorKey] ?? '#808080'
  const strokeDash = STROKE_DASH[circuitLayer ?? d?.circuitType ?? '']
  const routing = (d as any)?.routingType as EdgeRoutingType ?? 'smoothstep'
  const waypoints = (d as any)?.waypoints as Array<{ x: number; y: number }> ?? []
  const isCommunication = circuitLayer === 'communication' || d?.circuitType === ('communication' as any)

  let path: string
  let labelX: number
  let labelY: number

  if (waypoints.length > 0) {
    ;[path, labelX, labelY] = buildPolylinePath(sourceX, sourceY, targetX, targetY, waypoints)
  } else if (routing === 'bezier') {
    ;[path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  } else if (routing === 'straight') {
    ;[path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  } else {
    ;[path, labelX, labelY] = getSmoothStepPath({
      sourceX, sourceY, sourcePosition,
      targetX, targetY, targetPosition,
      borderRadius: 12,
    })
  }

  // Waypoint drag: captures initial flow position, updates on move
  const startWpDrag = (idx: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.preventDefault()
    const fp0 = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const ox = waypoints[idx].x
    const oy = waypoints[idx].y
    // Take snapshot of waypoints at drag start so all indices are consistent
    const snapshot = waypoints.map((w) => ({ ...w }))

    const onMove = (mv: PointerEvent) => {
      const fp = screenToFlowPosition({ x: mv.clientX, y: mv.clientY })
      const next = snapshot.map((wp, i) =>
        i === idx ? { x: ox + fp.x - fp0.x, y: oy + fp.y - fp0.y } : wp,
      )
      onWaypointChange(id, next)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Click on midpoint "+" to add a waypoint there
  const addWaypoint = (e: React.MouseEvent) => {
    e.stopPropagation()
    onWaypointChange(id, [...waypoints, { x: labelX, y: labelY }])
  }

  // Right-click a waypoint to remove it
  const removeWaypoint = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onWaypointChange(id, waypoints.filter((_, i) => i !== idx))
  }

  const lugSpec = (d as any)?.lugs as { count: number; size: string } | undefined
  const lugSuffix = lugSpec ? ` (${lugSpec.count}×${lugSpec.size})` : ''
  const dispLabel = (label as string | undefined) ?? ''

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: color,
          strokeWidth: isCommunication ? 1.5 : 2.5,
          strokeDasharray: strokeDash,
          opacity: isCommunication ? 0.75 : 1,
        }}
        interactionWidth={12}
      />

      <EdgeLabelRenderer>
        {/* Draggable waypoint handles (visible when edge is selected) */}
        {selected && waypoints.map((wp, idx) => (
          <div
            key={idx}
            className="nodrag nopan"
            onPointerDown={(e) => startWpDrag(idx, e)}
            onContextMenu={(e) => removeWaypoint(idx, e)}
            title="Drag to reroute · Right-click to remove"
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${wp.x}px,${wp.y}px)`,
              width: 14, height: 14,
              background: color, border: '2px solid #fff',
              borderRadius: '50%', cursor: 'grab',
              pointerEvents: 'all',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              zIndex: 1001,
            }}
          />
        ))}

        {/* Add-waypoint button at path midpoint (only when selected with no waypoints) */}
        {selected && waypoints.length === 0 && (
          <div
            className="nodrag nopan"
            onClick={addWaypoint}
            title="Click to add a waypoint — then drag it to reroute the cable"
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              width: 18, height: 18,
              background: '#fff', border: `2px dashed ${color}`,
              borderRadius: '50%', cursor: 'pointer',
              pointerEvents: 'all',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color, fontWeight: 700,
              zIndex: 1000, opacity: 0.8,
            }}
          >
            +
          </div>
        )}

        {/* Communication protocol badge */}
        {isCommunication && (
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
              background: (d as any)?.overrideProtocolMismatch
                ? '#fef3c7'
                : (d as any)?.compatible === false ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${(d as any)?.compatible === false ? '#fca5a5' : '#86efac'}`,
              borderRadius: 4, padding: '2px 6px',
              fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap',
              color: (d as any)?.compatible === false ? '#dc2626' : '#16a34a',
            }}
          >
            {(d as any)?.overrideProtocolMismatch ? '🔓 ' : (d as any)?.compatible === false ? '⚠ ' : '✓ '}
            {((d as any)?.sourceProtocol as string[] | undefined)?.join('/') ?? ''}
            {((d as any)?.targetProtocol as string[] | undefined)?.length
              ? ` → ${((d as any)?.targetProtocol as string[]).join('/')}`
              : ''}
          </div>
        )}

        {/* Cable label (power circuits) */}
        {dispLabel && !isCommunication && (
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              background: '#fff', border: `1.5px solid ${color}`,
              borderRadius: 4, padding: '2px 6px',
              fontSize: 9, color, fontWeight: 700,
              fontFamily: 'ui-monospace, monospace',
              whiteSpace: 'nowrap', lineHeight: 1.5,
              boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
            }}
          >
            {dispLabel}{lugSuffix}
          </div>
        )}

        {/* Communication label (minimal) */}
        {dispLabel && isCommunication && (
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${labelX}px,${labelY - 14}px)`,
              background: '#fff8f0', border: `1px dashed ${color}`,
              borderRadius: 4, padding: '2px 6px',
              fontSize: 8, color,
              fontFamily: 'ui-monospace, monospace',
              whiteSpace: 'nowrap', opacity: 0.85,
              pointerEvents: 'none',
            }}
          >
            {dispLabel}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
}

export const edgeTypes = {
  cable: CableEdge,
}
