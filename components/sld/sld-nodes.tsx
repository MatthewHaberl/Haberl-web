'use client'

import React from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import { Sun, Battery, Zap, Grid2x2, CircuitBoard, PlugZap, Combine, Box } from 'lucide-react'
import { getLugSpecsCached } from '@/lib/solar/lug-calculator'

// ── Brand / circuit colours ───────────────────────────────────────────────────
export const CLR = {
  dc:      '#f97316',  // orange  — PV / DC
  bat:     '#16a34a',  // green   — battery
  ac:      '#2563eb',  // blue    — AC
  earth:   '#65a30d',  // lime    — earthing
  grid:    '#7c3aed',  // purple  — grid
  inv:     '#1e3a5f',  // navy    — inverter
}

export const SIMPLE_BLOCK_COLOR: Record<string, string> = {
  dcIsolator:  CLR.dc,
  acIsolator:  CLR.ac,
  spd:         CLR.dc,
  generator:   '#6b7280',
  changeover:  '#6b7280',
  meter:       CLR.ac,
  evCharger:   CLR.bat,
  custom:      '#6b7280',
}

const H = (color: string, extra?: React.CSSProperties): React.CSSProperties => ({
  width: 12, height: 12,
  background: color,
  border: '2px solid #fff',
  borderRadius: '50%',
  cursor: 'crosshair',
  ...extra,
})

// ── Base card ─────────────────────────────────────────────────────────────────
interface CardProps {
  color: string
  Icon: React.ElementType
  title: string
  children: React.ReactNode
  selected?: boolean
  footer?: React.ReactNode
}

function NodeCard({ color, Icon, title, children, selected, footer }: CardProps) {
  return (
    <div style={{
      minWidth: 190, maxWidth: 230,
      background: '#fff',
      border: `2px solid ${selected ? color : color + 'cc'}`,
      borderRadius: 8,
      boxShadow: selected
        ? `0 0 0 3px ${color}40, 0 2px 8px rgba(0,0,0,0.12)`
        : '0 2px 8px rgba(0,0,0,0.10)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 11, overflow: 'hidden',
      transition: 'box-shadow 0.15s',
    }}>
      <div style={{
        background: color, color: '#fff',
        padding: '5px 10px',
        display: 'flex', alignItems: 'center', gap: 5,
        fontWeight: 700, fontSize: 11, letterSpacing: 0.3,
      }}>
        <Icon size={12} />
        <span style={{ textTransform: 'uppercase' }}>{title}</span>
      </div>
      <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {children}
      </div>
      {footer && (
        <div style={{
          padding: '5px 10px',
          background: '#f9fafb',
          borderTop: '1px solid #f0f0f0',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {footer}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value?: string | number | null; accent?: string }) {
  if (value === undefined || value === null || value === '' || value === 0) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontWeight: 600, color: accent ?? '#111827', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// Small inline badge chip
function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 5px', borderRadius: 3,
      background: color + '20', color, fontSize: 9, fontWeight: 700,
      border: `1px solid ${color}50`,
    }}>{label}</span>
  )
}

// ── Solar Array ───────────────────────────────────────────────────────────────
export function SolarArrayNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string; panelCount: number; panelModel: string
    wpPerPanel: number; totalKwp: number; config: string
    connectorType?: string; connectorQty?: number
    mountingRows?: number; mountingCols?: number; mountingOrientation?: string
    mountingLayout?: Array<{ id: string; count: number; orientation: string; mountType: string }>
    earthingRequired?: boolean; earthingMethod?: string
  }
  const shortModel = d.panelModel ? d.panelModel.split(' ').slice(0, 3).join(' ') : ''

  // Auto-calc kWp from panel count × watt if totalKwp not explicitly set
  const computedKwp = d.totalKwp > 0
    ? d.totalKwp
    : (d.panelCount > 0 && d.wpPerPanel > 0
        ? +((d.panelCount * d.wpPerPanel) / 1000).toFixed(2)
        : 0)

  const connectorLabel = d.connectorType && d.connectorQty
    ? `${d.connectorType} ×${d.connectorQty}`
    : d.connectorType || ''

  // Support custom per-row layout or fall back to simple rows × cols
  const mountingLabel = (() => {
    if (d.mountingLayout && d.mountingLayout.length > 0) {
      return d.mountingLayout
        .map((r) => `${r.count}×${r.orientation?.charAt(0).toUpperCase() ?? 'P'}`)
        .join(' + ')
    }
    if (d.mountingRows && d.mountingCols) {
      return `${d.mountingRows}r · ${d.mountingCols} ${d.mountingOrientation ?? 'portrait'}`
    }
    return ''
  })()

  const footer = (connectorLabel || mountingLabel || d.earthingRequired) ? (
    <>
      {connectorLabel && <Row label="Connector" value={connectorLabel} accent={CLR.dc} />}
      {mountingLabel && <Row label="Layout" value={mountingLabel} />}
      {d.earthingRequired && <Row label="Earth" value={d.earthingMethod || 'Required'} accent={CLR.earth} />}
    </>
  ) : undefined

  return (
    <NodeCard color={CLR.dc} Icon={Sun} title={d.label || 'Solar Array'} selected={selected} footer={footer}>
      {d.panelCount > 0 && <Row label="Panels" value={`${d.panelCount} × ${d.wpPerPanel}W`} />}
      {shortModel && <Row label="Model" value={shortModel} />}
      {computedKwp > 0 && <Row label="Array" value={`${computedKwp} kWp`} />}
      {d.config && <Row label="Config" value={d.config} />}
      <Handle type="source" id="dc-out" position={Position.Bottom} style={H(CLR.dc)} title="DC out → Combiner or Inverter" />
    </NodeCard>
  )
}

// ── DC Combiner ───────────────────────────────────────────────────────────────
export function CombinerNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string; stringCount: number; fuseRating: string
    hasSpd: boolean; config: string
    // new fields
    plastic?: boolean; metal?: boolean; requiresEarth?: boolean; earthingSource?: string
  }
  const n = Math.max(1, d.stringCount)

  const materialChips: React.ReactNode[] = []
  if (d.plastic) materialChips.push(<Chip key="pl" label="Plastic" color="#6b7280" />)
  if (d.metal)   materialChips.push(<Chip key="mt" label="Metal" color="#374151" />)

  const footer = (d.requiresEarth || materialChips.length > 0) ? (
    <>
      {materialChips.length > 0 && (
        <div style={{ display: 'flex', gap: 4 }}>{materialChips}</div>
      )}
      {d.requiresEarth && (
        <Row label="Earth" value={d.earthingSource || 'Required'} accent={CLR.earth} />
      )}
    </>
  ) : undefined

  return (
    <NodeCard color={CLR.dc} Icon={Combine} title={d.label} selected={selected} footer={footer}>
      {Array.from({ length: n }, (_, i) => {
        const pct = n === 1 ? 50 : 10 + (i / (n - 1)) * 80
        return (
          <Handle
            key={i}
            type="target"
            id={`str-${i}`}
            position={Position.Top}
            style={H(CLR.dc, { left: `${pct}%`, transform: 'translateX(-50%)' })}
          />
        )
      })}
      <Row label="Strings" value={n} />
      <Row label="Fuses" value={`${n} × ${d.fuseRating}`} />
      {d.hasSpd && <Row label="SPD" value="Type 2 included" />}
      <Handle type="source" id="dc-out" position={Position.Bottom} style={H(CLR.dc)} title="DC out → Inverter PV input" />
    </NodeCard>
  )
}

// ── Inverter — new layout: Grid=Left, Battery=Bottom, AC out=Right ────────────
export function InverterNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string; model: string; kw: number
    phases: number; hasBattery: boolean; hasGenerator: boolean
    // new fields
    outputCount?: number; hasEpsOutput?: boolean
    pvConnectorType?: string; pvConnectorQty?: number
    acOutCableSpec?: string; acOut2CableSpec?: string
  }
  const shortModel = d.model ? d.model.split(' ').slice(0, 4).join(' ') : ''
  const outputCount = d.outputCount ?? 1
  const hasEps = d.hasEpsOutput ?? false

  // Auto-calc lug spec from connected cable (stored in node data for display)
  const acOutLugs = d.acOutCableSpec ? getLugSpecsCached(d.acOutCableSpec) : null
  const pvConnLabel = d.pvConnectorType
    ? `${d.pvConnectorType}${d.pvConnectorQty ? ` ×${d.pvConnectorQty}` : ''}`
    : ''

  const footer = (pvConnLabel || acOutLugs) ? (
    <>
      {pvConnLabel && <Row label="PV conn" value={pvConnLabel} accent={CLR.dc} />}
      {acOutLugs && (
        <Row
          label={`AC out lugs`}
          value={`${acOutLugs.count}×${acOutLugs.size} Cu`}
          accent={CLR.ac}
        />
      )}
    </>
  ) : undefined

  return (
    <NodeCard color={CLR.inv} Icon={Zap} title="Inverter / Charger" selected={selected} footer={footer}>
      {/* PV DC input — top (unchanged) */}
      <Handle type="target" id="pv-in"    position={Position.Top}   style={H(CLR.dc)}                      title="PV DC input" />
      {/* Grid / SCOM — LEFT */}
      <Handle type="target" id="grid-in"  position={Position.Left}  style={H(CLR.grid, { top: '35%' })}    title="Grid / SCOM input" />
      {/* Generator — LEFT (below grid) */}
      {d.hasGenerator && (
        <Handle type="target" id="gen-in" position={Position.Left}  style={H(CLR.ac, { top: '65%' })}      title="Generator input" />
      )}
      {/* Battery — BOTTOM left */}
      <Handle type="target" id="bat-in"   position={Position.Bottom} style={H(CLR.bat, { left: '28%' })}   title="Battery port" />
      {/* Main AC output — RIGHT */}
      <Handle type="source" id="ac-out"   position={Position.Right}  style={H(CLR.ac, { top: '50%' })}     title="AC output → DB Board" />
      {/* EPS / backup output — BOTTOM right (if configured) */}
      {(hasEps || outputCount >= 2) && (
        <Handle type="source" id="ac-out-2" position={Position.Bottom} style={H(CLR.ac, { left: '72%' })} title="EPS / backup output" />
      )}

      {shortModel && <Row label="Model" value={shortModel} />}
      {d.kw > 0 && <Row label="Power" value={`${d.kw} kW`} />}
      <Row label="Phase" value={`${d.phases}Ø`} />
      {d.hasBattery && <Row label="Battery port" value="Active" />}
      {hasEps && <Row label="EPS out" value="Backup" accent={CLR.ac} />}
    </NodeCard>
  )
}

// ── Battery Bank ──────────────────────────────────────────────────────────────
export function BatteryNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string; model: string; qty: number
    totalKwh: number; chemistry: string
  }
  const shortModel = d.model ? d.model.split(' ').slice(0, 3).join(' ') : ''

  return (
    <NodeCard color={CLR.bat} Icon={Battery} title={d.label || 'Battery Bank'} selected={selected}>
      {/* Battery connects UP to inverter's bottom */}
      <Handle type="source" id="bat-out" position={Position.Top} style={H(CLR.bat)} title="Battery output → Inverter" />
      {shortModel && <Row label="Model" value={shortModel} />}
      {d.qty > 0 && <Row label="Units" value={d.qty} />}
      {d.totalKwh > 0 && <Row label="Capacity" value={`${d.totalKwh} kWh`} />}
      {d.chemistry && <Row label="Chemistry" value={d.chemistry} />}
    </NodeCard>
  )
}

// ── Grid Supply — output on RIGHT (faces inverter LEFT) ───────────────────────
export function GridNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string; utility: string; voltage: number
    phases: number; breakerA: number
  }

  return (
    <NodeCard color={CLR.grid} Icon={PlugZap} title={d.label || 'Grid Supply'} selected={selected}>
      {/* Grid is on the LEFT of inverter — so output goes RIGHT */}
      <Handle type="source" id="ac-out" position={Position.Right} style={H(CLR.ac)} title="Grid AC → Inverter" />
      {d.utility && <Row label="Utility" value={d.utility} />}
      <Row label="Voltage" value={`${d.voltage}V`} />
      <Row label="Phase" value={`${d.phases}Ø`} />
      {d.breakerA > 0 && <Row label="Main CB" value={`${d.breakerA}A`} />}
    </NodeCard>
  )
}

// ── Distribution Board — input on LEFT (inverter AC out on RIGHT) ─────────────
export function DBBoardNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string; mainBreakerA: number; rccbA: number; phases: number
  }

  return (
    <NodeCard color={CLR.ac} Icon={CircuitBoard} title={d.label || 'Distribution Board'} selected={selected}>
      {/* AC input from inverter RIGHT → comes in from the LEFT */}
      <Handle type="target" id="ac-in"     position={Position.Left}   style={H(CLR.ac)}                      title="AC input from Inverter" />
      {/* Earth goes DOWN to earthing system */}
      <Handle type="source" id="earth-out" position={Position.Bottom} style={H(CLR.earth, { left: '70%' })} title="Earth → Earthing system" />
      {d.mainBreakerA > 0 && <Row label="Main CB" value={`${d.mainBreakerA}A DP`} />}
      {d.rccbA > 0 && <Row label="RCCB" value={`${d.rccbA} mA`} />}
      <Row label="Phase" value={`${d.phases}Ø`} />
    </NodeCard>
  )
}

// ── Earthing System — input on TOP (below DB Board) ───────────────────────────
export function EarthingNode({ data, selected }: NodeProps) {
  const d = data as { label: string; spikeCount: number; spec: string }

  return (
    <NodeCard color={CLR.earth} Icon={Grid2x2} title={d.label || 'Earthing'} selected={selected}>
      {/* Earth cable comes from DB above */}
      <Handle type="target" id="earth-in" position={Position.Top} style={H(CLR.earth)} title="Earth input from DB Board" />
      {d.spikeCount > 0 && <Row label="Spikes" value={`${d.spikeCount} × 1200mm`} />}
      {d.spec && <Row label="Conductor" value={d.spec} />}
      <Row label="System" value="TN-C-S" />
    </NodeCard>
  )
}

// ── Simple Block (isolators, SPD, generator, meter, EV, custom) ───────────────
export function SimpleBlockNode({ data, selected, type }: NodeProps) {
  const d = data as {
    label: string; model?: string; rating?: string
    kva?: number; kw?: number; fuelType?: string
    color?: string
  }
  const color = d.color ?? SIMPLE_BLOCK_COLOR[type ?? 'custom'] ?? '#6b7280'

  return (
    <NodeCard color={color} Icon={Box} title={d.label || 'Component'} selected={selected}>
      <Handle type="target" id="in"    position={Position.Top}    style={H(color)} />
      <Handle type="source" id="out"   position={Position.Bottom} style={H(color)} />
      <Handle type="target" id="in-l"  position={Position.Left}   style={H(color, { top: '50%', opacity: 0.4 })} />
      <Handle type="source" id="out-r" position={Position.Right}  style={H(color, { top: '50%', opacity: 0.4 })} />
      {d.model    && <Row label="Model"   value={d.model} />}
      {d.rating   && <Row label="Rating"  value={d.rating} />}
      {d.kva      && <Row label="Rating"  value={`${d.kva} kVA`} />}
      {d.kw       && <Row label="Power"   value={`${d.kw} kW`} />}
      {d.fuelType && <Row label="Fuel"    value={d.fuelType} />}
    </NodeCard>
  )
}

// ── Text Note ─────────────────────────────────────────────────────────────────
export function TextNoteNode({ data, selected }: NodeProps) {
  const d = data as { text: string; bold?: boolean }
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={140}
        minHeight={40}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: '#d97706', border: '1px solid #fff' }}
        lineStyle={{ borderColor: '#d97706', borderWidth: 1 }}
      />
      <div style={{
        width: '100%', height: '100%', minWidth: 160,
        background: '#fefce8',
        border: `1.5px dashed ${selected ? '#ca8a04' : '#d97706'}`,
        borderRadius: 6, padding: '6px 10px',
        boxShadow: selected ? '0 0 0 3px rgba(234,179,8,0.25)' : undefined,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 10, color: '#78350f',
        whiteSpace: 'pre-wrap', lineHeight: 1.5,
        fontWeight: d.bold ? 700 : 400,
        overflow: 'hidden', boxSizing: 'border-box',
      }}>
        {d.text || 'Click to select, then edit in panel →'}
      </div>
    </>
  )
}

// ── Connector / Termination Block ─────────────────────────────────────────────
// Small inline block representing a physical connection point (MC4, lug, Anderson, etc.)
export function ConnectorNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; connectorType?: string; qty?: number; color?: string }
  const color = d.color ?? '#64748b'
  const displayName = d.label || d.connectorType || 'Connector'

  return (
    <div style={{
      minWidth: 72, maxWidth: 120,
      background: '#fff',
      border: `2px solid ${selected ? color : color + 'aa'}`,
      borderRadius: 5,
      boxShadow: selected
        ? `0 0 0 3px ${color}30, 0 1px 4px rgba(0,0,0,0.12)`
        : '0 1px 3px rgba(0,0,0,0.10)',
      fontFamily: 'system-ui, sans-serif',
      overflow: 'hidden',
    }}>
      <Handle type="target" id="in"    position={Position.Top}    style={H(color)} />
      <Handle type="target" id="in-l"  position={Position.Left}   style={H(color, { top: '50%', opacity: 0.55 })} />
      <Handle type="source" id="out-r" position={Position.Right}  style={H(color, { top: '50%', opacity: 0.55 })} />
      <Handle type="source" id="out"   position={Position.Bottom} style={H(color)} />
      <div style={{ padding: '5px 8px', textAlign: 'center', borderTop: `3px solid ${color}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>{displayName}</div>
        {d.qty && d.qty > 1 && (
          <div style={{ fontSize: 9, color, marginTop: 1 }}>×{d.qty}</div>
        )}
      </div>
    </div>
  )
}

// ── Node type registry ────────────────────────────────────────────────────────
export const nodeTypes = {
  solarArray:  SolarArrayNode,
  combiner:    CombinerNode,
  inverter:    InverterNode,
  battery:     BatteryNode,
  grid:        GridNode,
  dbBoard:     DBBoardNode,
  earthing:    EarthingNode,
  dcIsolator:  SimpleBlockNode,
  acIsolator:  SimpleBlockNode,
  spd:         SimpleBlockNode,
  generator:   SimpleBlockNode,
  changeover:  SimpleBlockNode,
  meter:       SimpleBlockNode,
  evCharger:   SimpleBlockNode,
  custom:      SimpleBlockNode,
  connector:   ConnectorNode,
  textNote:    TextNoteNode,
}
