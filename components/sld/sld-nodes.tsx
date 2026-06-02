'use client'

import React from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import { Sun, Battery, Zap, Grid2x2, CircuitBoard, PlugZap, Combine, Box } from 'lucide-react'

// ── Brand / circuit colours ───────────────────────────────────────────────────
export const CLR = {
  dc:      '#f97316',  // orange  — PV / DC
  bat:     '#16a34a',  // green   — battery
  ac:      '#2563eb',  // blue    — AC
  earth:   '#65a30d',  // lime    — earthing
  grid:    '#7c3aed',  // purple  — grid
  inv:     '#1e3a5f',  // navy    — inverter
}

// Color for simple-block node types
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

// ── Shared handle style + tooltip ────────────────────────────────────────────
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
}

function NodeCard({ color, Icon, title, children, selected }: CardProps) {
  return (
    <div
      style={{
        minWidth: 190,
        maxWidth: 220,
        background: '#fff',
        border: `2px solid ${selected ? color : color + 'cc'}`,
        borderRadius: 8,
        boxShadow: selected
          ? `0 0 0 3px ${color}40, 0 2px 8px rgba(0,0,0,0.12)`
          : '0 2px 8px rgba(0,0,0,0.10)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 11,
        overflow: 'hidden',
        transition: 'box-shadow 0.15s',
      }}
    >
      <div
        style={{
          background: color,
          color: '#fff',
          padding: '5px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: 0.3,
        }}
      >
        <Icon size={12} />
        <span style={{ textTransform: 'uppercase' }}>{title}</span>
      </div>
      <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '' || value === 0) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#111827', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// ── Solar Array ───────────────────────────────────────────────────────────────
export function SolarArrayNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string; panelCount: number; panelModel: string
    wpPerPanel: number; totalKwp: number; config: string
  }
  const shortModel = d.panelModel ? d.panelModel.split(' ').slice(0, 3).join(' ') : ''

  return (
    <NodeCard color={CLR.dc} Icon={Sun} title={d.label || 'Solar Array'} selected={selected}>
      {d.panelCount > 0 && <Row label="Panels" value={`${d.panelCount} × ${d.wpPerPanel}W`} />}
      {shortModel && <Row label="Model" value={shortModel} />}
      {d.totalKwp > 0 && <Row label="Array" value={`${d.totalKwp} kWp`} />}
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
  }
  const n = Math.max(1, d.stringCount)

  return (
    <NodeCard color={CLR.dc} Icon={Combine} title={d.label} selected={selected}>
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

// ── Inverter ──────────────────────────────────────────────────────────────────
export function InverterNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string; model: string; kw: number
    phases: number; hasBattery: boolean; hasGenerator: boolean
  }
  const shortModel = d.model ? d.model.split(' ').slice(0, 4).join(' ') : ''

  return (
    <NodeCard color={CLR.inv} Icon={Zap} title="Inverter / Charger" selected={selected}>
      <Handle type="target" id="pv-in"   position={Position.Top}   style={H(CLR.dc)}               title="PV DC input" />
      <Handle type="target" id="bat-in"  position={Position.Left}  style={H(CLR.bat, { top: '45%' })} title="Battery input" />
      <Handle type="target" id="grid-in" position={Position.Right} style={H(CLR.ac,  { top: '35%' })} title="Grid AC input" />
      {d.hasGenerator && (
        <Handle type="target" id="gen-in" position={Position.Right} style={H(CLR.ac, { top: '65%' })} title="Generator input" />
      )}
      <Handle type="source" id="ac-out"  position={Position.Bottom} style={H(CLR.ac)} title="AC output → DB Board" />

      {shortModel && <Row label="Model" value={shortModel} />}
      {d.kw > 0 && <Row label="Power" value={`${d.kw} kW`} />}
      <Row label="Phase" value={`${d.phases}Ø`} />
      {d.hasBattery && <Row label="Battery port" value="Active" />}
      <Row label="EPS" value="Backup output" />
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
      <Handle type="source" id="bat-out" position={Position.Right} style={H(CLR.bat)} title="Battery output → Inverter" />
      {shortModel && <Row label="Model" value={shortModel} />}
      {d.qty > 0 && <Row label="Units" value={d.qty} />}
      {d.totalKwh > 0 && <Row label="Capacity" value={`${d.totalKwh} kWh`} />}
      {d.chemistry && <Row label="Chemistry" value={d.chemistry} />}
    </NodeCard>
  )
}

// ── Grid Supply ───────────────────────────────────────────────────────────────
export function GridNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string; utility: string; voltage: number
    phases: number; breakerA: number
  }

  return (
    <NodeCard color={CLR.grid} Icon={PlugZap} title={d.label || 'Grid Supply'} selected={selected}>
      <Handle type="source" id="ac-out" position={Position.Left} style={H(CLR.ac)} title="Grid AC → Inverter" />
      {d.utility && <Row label="Utility" value={d.utility} />}
      <Row label="Voltage" value={`${d.voltage}V`} />
      <Row label="Phase" value={`${d.phases}Ø`} />
      {d.breakerA > 0 && <Row label="Main CB" value={`${d.breakerA}A`} />}
    </NodeCard>
  )
}

// ── Distribution Board ────────────────────────────────────────────────────────
export function DBBoardNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string; mainBreakerA: number; rccbA: number; phases: number
  }

  return (
    <NodeCard color={CLR.ac} Icon={CircuitBoard} title={d.label || 'Distribution Board'} selected={selected}>
      <Handle type="target" id="ac-in"     position={Position.Top}   style={H(CLR.ac)}                     title="AC input from Inverter" />
      <Handle type="source" id="earth-out" position={Position.Right} style={H(CLR.earth, { top: '50%' })} title="Earth → Earthing system" />
      {d.mainBreakerA > 0 && <Row label="Main CB" value={`${d.mainBreakerA}A DP`} />}
      {d.rccbA > 0 && <Row label="RCCB" value={`${d.rccbA} mA`} />}
      <Row label="Phase" value={`${d.phases}Ø`} />
    </NodeCard>
  )
}

// ── Earthing System ───────────────────────────────────────────────────────────
export function EarthingNode({ data, selected }: NodeProps) {
  const d = data as { label: string; spikeCount: number; spec: string }

  return (
    <NodeCard color={CLR.earth} Icon={Grid2x2} title={d.label || 'Earthing'} selected={selected}>
      <Handle type="target" id="earth-in" position={Position.Left} style={H(CLR.earth)} title="Earth input from DB Board" />
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
      <Handle type="target" id="in"  position={Position.Top}    style={H(color)} />
      <Handle type="source" id="out" position={Position.Bottom} style={H(color)} />
      {/* Left + right for parallel connections */}
      <Handle type="target" id="in-l"  position={Position.Left}  style={H(color, { top: '50%', opacity: 0.4 })} />
      <Handle type="source" id="out-r" position={Position.Right} style={H(color, { top: '50%', opacity: 0.4 })} />
      {d.model   && <Row label="Model"   value={d.model} />}
      {d.rating  && <Row label="Rating"  value={d.rating} />}
      {d.kva     && <Row label="Rating"  value={`${d.kva} kVA`} />}
      {d.kw      && <Row label="Power"   value={`${d.kw} kW`} />}
      {d.fuelType && <Row label="Fuel"   value={d.fuelType} />}
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
      <div
        style={{
          width: '100%',
          height: '100%',
          minWidth: 160,
          background: '#fefce8',
          border: `1.5px dashed ${selected ? '#ca8a04' : '#d97706'}`,
          borderRadius: 6,
          padding: '6px 10px',
          boxShadow: selected ? '0 0 0 3px rgba(234,179,8,0.25)' : undefined,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 10,
          color: '#78350f',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.5,
          fontWeight: d.bold ? 700 : 400,
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {d.text || 'Click to select, then edit in panel →'}
      </div>
    </>
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
  // Simple blocks
  dcIsolator:  SimpleBlockNode,
  acIsolator:  SimpleBlockNode,
  spd:         SimpleBlockNode,
  generator:   SimpleBlockNode,
  changeover:  SimpleBlockNode,
  meter:       SimpleBlockNode,
  evCharger:   SimpleBlockNode,
  custom:      SimpleBlockNode,
  // Annotation
  textNote:    TextNoteNode,
}
