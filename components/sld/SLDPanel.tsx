'use client'

import { useState } from 'react'
import { Trash2, Plus, MousePointerClick, Copy, BarChart2 } from 'lucide-react'
import type { Node, Edge } from '@xyflow/react'
import { CLR } from './sld-nodes'
import type { CableEdgeData } from '@/lib/solar/sld-builder'

// ── Constants ─────────────────────────────────────────────────────────────────

const CABLE_TYPES = ['H1Z2Z2', 'CU', 'XLPE', 'Flex (HO5VV-F)', 'Al']
const CROSS_SECTIONS = ['1.5mm²', '2.5mm²', '4mm²', '6mm²', '10mm²', '16mm²', '25mm²', '35mm²', '50mm²', '70mm²', '95mm²']
const SEGMENT_ROUTE_TYPES = [
  'In conduit (surface)',
  'In conduit (buried)',
  'Through ceiling void',
  'Down wall (conduit)',
  'Overhead (open)',
  'Underground (direct burial)',
  'Open trunking',
  'Under floor',
  'Custom',
]

export const ADDABLE_NODES: Array<{ type: string; label: string; color: string }> = [
  { type: 'dcIsolator', label: 'DC Isolator',           color: CLR.dc   },
  { type: 'acIsolator', label: 'AC Isolator',            color: CLR.ac   },
  { type: 'spd',        label: 'Surge Protection (SPD)', color: CLR.dc   },
  { type: 'generator',  label: 'Generator',              color: '#6b7280' },
  { type: 'changeover', label: 'Changeover Switch',      color: '#6b7280' },
  { type: 'meter',      label: 'Energy Meter',           color: CLR.ac   },
  { type: 'evCharger',  label: 'EV Charger',             color: CLR.bat  },
  { type: 'custom',     label: 'Custom Block',           color: '#6b7280' },
  { type: 'textNote',   label: 'Text Note / Annotation', color: '#d97706' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionHead({ title }: { title: string }) {
  return (
    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-3 pb-1.5 mt-1 border-t border-border first:border-t-0 first:pt-0 first:mt-0">
      {title}
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 mb-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function TInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    />
  )
}

function NInput({ value, onChange, min = 0, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  return (
    <input
      type="number"
      value={value || ''}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      min={min}
      step={step}
      className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    />
  )
}

function SInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

// ── Conductor config ──────────────────────────────────────────────────────────

interface ConductorDef { key: string; label: string; short: string; color: string }

function getConductorDefs(circuitType: string, phases: number): ConductorDef[] {
  if (circuitType === 'dc' || circuitType === 'battery') {
    return [
      { key: 'positive', label: '+ (Positive)', short: '+',  color: CLR.dc    },
      { key: 'negative', label: '− (Negative)', short: '−',  color: '#111827' },
      { key: 'earth',    label: 'E (Earth)',    short: 'E',  color: CLR.earth },
    ]
  }
  if (circuitType === 'earth') {
    return [{ key: 'earth', label: 'E (Earth)', short: 'E', color: CLR.earth }]
  }
  if (phases >= 3) {
    return [
      { key: 'l1',      label: 'L1 (Phase 1)', short: 'L1', color: '#dc2626' },
      { key: 'l2',      label: 'L2 (Phase 2)', short: 'L2', color: '#f59e0b' },
      { key: 'l3',      label: 'L3 (Phase 3)', short: 'L3', color: '#2563eb' },
      { key: 'neutral', label: 'N (Neutral)',   short: 'N',  color: '#374151' },
      { key: 'earth',   label: 'E (Earth)',     short: 'E',  color: CLR.earth },
    ]
  }
  return [
    { key: 'live',    label: 'L (Live)',    short: 'L', color: '#dc2626' },
    { key: 'neutral', label: 'N (Neutral)', short: 'N', color: '#374151' },
    { key: 'earth',   label: 'E (Earth)',   short: 'E', color: CLR.earth },
  ]
}

function ConductorConfig({
  circuitType,
  phases = 1,
  conductors,
  onChange,
}: {
  circuitType: string
  phases?: number
  conductors: Record<string, boolean>
  onChange: (c: Record<string, boolean>) => void
}) {
  const [advanced, setAdvanced] = useState(false)
  const defs = getConductorDefs(circuitType, phases)
  const active = defs.filter((d) => conductors[d.key] !== false)

  if (!advanced) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {active.map((d) => (
          <span
            key={d.key}
            className="px-1.5 py-0.5 rounded text-white font-bold leading-none"
            style={{ background: d.color, fontSize: 10 }}
          >
            {d.short}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setAdvanced(true)}
          className="text-xs text-muted-foreground hover:text-foreground ml-auto"
        >
          Advanced ▾
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {defs.map((d) => (
        <label key={d.key} className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={conductors[d.key] !== false}
            onChange={(e) => onChange({ ...conductors, [d.key]: e.target.checked })}
            className="rounded"
          />
          <span
            className="w-5 h-5 rounded flex items-center justify-center text-white font-bold shrink-0"
            style={{ background: d.color, fontSize: 9 }}
          >
            {d.short}
          </span>
          <span className="text-foreground">{d.label}</span>
        </label>
      ))}
      <button
        type="button"
        onClick={() => setAdvanced(false)}
        className="text-xs text-muted-foreground hover:text-foreground self-end"
      >
        Simple ▴
      </button>
    </div>
  )
}

// ── Route segment editor ──────────────────────────────────────────────────────

interface Segment { id: string; routeType: string; lengthM: number }

function SegmentEditor({ segments, onChange }: { segments: Segment[]; onChange: (s: Segment[]) => void }) {
  const total = segments.reduce((sum, s) => sum + (s.lengthM || 0), 0)

  return (
    <div className="flex flex-col gap-1.5">
      {segments.map((seg) => (
        <div key={seg.id} className="flex gap-1 items-center">
          <select
            value={seg.routeType}
            onChange={(e) => onChange(segments.map((s) => s.id === seg.id ? { ...s, routeType: e.target.value } : s))}
            className="flex-1 h-7 rounded border border-border bg-background px-1.5 text-xs focus-visible:outline-none min-w-0"
          >
            {SEGMENT_ROUTE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="number"
            value={seg.lengthM || ''}
            onChange={(e) => onChange(segments.map((s) => s.id === seg.id ? { ...s, lengthM: parseFloat(e.target.value) || 0 } : s))}
            min={0}
            step={0.5}
            placeholder="m"
            className="w-14 h-7 rounded border border-border bg-background px-1.5 text-xs text-right focus-visible:outline-none"
          />
          <span className="text-xs text-muted-foreground shrink-0">m</span>
          <button
            type="button"
            onClick={() => onChange(segments.filter((s) => s.id !== seg.id))}
            className="text-muted-foreground hover:text-destructive shrink-0"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between mt-0.5">
        <button
          type="button"
          onClick={() => onChange([...segments, { id: `seg-${Date.now()}`, routeType: 'In conduit (surface)', lengthM: 1 }])}
          className="text-xs text-accent hover:text-accent/80 flex items-center gap-1"
        >
          <Plus size={11} /> Add segment
        </button>
        {total > 0 && <span className="text-xs font-semibold">Total: {total}m</span>}
      </div>
    </div>
  )
}

// ── Node editor ───────────────────────────────────────────────────────────────

function NodeEditor({
  node,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  node: Node
  onUpdate: (id: string, patch: Record<string, unknown>) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}) {
  const d = node.data as Record<string, unknown>
  const t = node.type ?? 'custom'

  const circuitType =
    ['solarArray', 'combiner', 'dcIsolator', 'spd'].includes(t) ? 'dc'
    : t === 'battery' ? 'battery'
    : t === 'earthing' ? 'earth'
    : 'ac'

  const phases = (d.phases as number) ?? 1
  const conductors = (d.conductors as Record<string, boolean>) ?? {}
  const set = (key: string, value: unknown) => onUpdate(node.id, { [key]: value })

  return (
    <div className="flex flex-col">
      <SectionHead title="General" />

      <FieldRow label="Label">
        <TInput value={String(d.label ?? '')} onChange={(v) => set('label', v)} />
      </FieldRow>

      {!['earthing'].includes(t) && (
        <FieldRow label="Model / make">
          <TInput value={String(d.model ?? d.inverterModel ?? '')} onChange={(v) => set('model', v)} placeholder="e.g. Sigenergy SE8K" />
        </FieldRow>
      )}

      {/* Solar array */}
      {t === 'solarArray' && (
        <>
          <SectionHead title="PV String" />
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="Panel count">
              <NInput value={d.panelCount as number ?? 0} onChange={(v) => set('panelCount', v)} min={1} />
            </FieldRow>
            <FieldRow label="W / panel">
              <NInput value={d.wpPerPanel as number ?? 0} onChange={(v) => set('wpPerPanel', v)} min={1} />
            </FieldRow>
          </div>
          <FieldRow label="Config (e.g. 4S)">
            <TInput value={String(d.config ?? '')} onChange={(v) => set('config', v)} placeholder="4S or 2S×3P" />
          </FieldRow>
        </>
      )}

      {/* Inverter */}
      {t === 'inverter' && (
        <>
          <SectionHead title="Inverter" />
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="kW">
              <NInput value={d.kw as number ?? 0} onChange={(v) => set('kw', v)} step={0.5} />
            </FieldRow>
            <FieldRow label="Phase">
              <SInput
                value={String(phases) + 'Ø'}
                onChange={(v) => set('phases', parseInt(v))}
                options={['1Ø', '3Ø']}
              />
            </FieldRow>
          </div>
        </>
      )}

      {/* Battery */}
      {t === 'battery' && (
        <>
          <SectionHead title="Battery Bank" />
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="Units">
              <NInput value={d.qty as number ?? 1} onChange={(v) => set('qty', v)} min={1} />
            </FieldRow>
            <FieldRow label="Total kWh">
              <NInput value={d.totalKwh as number ?? 0} onChange={(v) => set('totalKwh', v)} step={0.1} />
            </FieldRow>
          </div>
          <FieldRow label="Chemistry">
            <SInput
              value={String(d.chemistry ?? 'LiFePO4')}
              onChange={(v) => set('chemistry', v)}
              options={['LiFePO4', 'Li-NMC', 'Lead Acid', 'Other']}
            />
          </FieldRow>
        </>
      )}

      {/* Grid */}
      {t === 'grid' && (
        <>
          <SectionHead title="Grid Supply" />
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="Phase">
              <SInput
                value={String(phases) + 'Ø'}
                onChange={(v) => set('phases', parseInt(v))}
                options={['1Ø', '3Ø']}
              />
            </FieldRow>
            <FieldRow label="Main CB (A)">
              <NInput value={d.breakerA as number ?? 63} onChange={(v) => set('breakerA', v)} />
            </FieldRow>
          </div>
          <FieldRow label="Utility name">
            <TInput value={String(d.utility ?? '')} onChange={(v) => set('utility', v)} placeholder="Eskom / Tshwane / etc." />
          </FieldRow>
        </>
      )}

      {/* DB board */}
      {t === 'dbBoard' && (
        <>
          <SectionHead title="DB Board" />
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="Main CB (A)">
              <NInput value={d.mainBreakerA as number ?? 40} onChange={(v) => set('mainBreakerA', v)} />
            </FieldRow>
            <FieldRow label="RCCB (mA)">
              <NInput value={d.rccbA as number ?? 30} onChange={(v) => set('rccbA', v)} />
            </FieldRow>
          </div>
        </>
      )}

      {/* Earthing */}
      {t === 'earthing' && (
        <>
          <SectionHead title="Earthing" />
          <FieldRow label="Spike count">
            <NInput value={d.spikeCount as number ?? 2} onChange={(v) => set('spikeCount', v)} min={1} />
          </FieldRow>
          <FieldRow label="Conductor spec">
            <TInput value={String(d.spec ?? 'CU GY 10mm²')} onChange={(v) => set('spec', v)} />
          </FieldRow>
        </>
      )}

      {/* Generator */}
      {t === 'generator' && (
        <>
          <SectionHead title="Generator" />
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="kVA">
              <NInput value={d.kva as number ?? 5} onChange={(v) => set('kva', v)} step={0.5} />
            </FieldRow>
            <FieldRow label="Fuel type">
              <SInput
                value={String(d.fuelType ?? 'Diesel')}
                onChange={(v) => set('fuelType', v)}
                options={['Diesel', 'Petrol', 'Gas', 'Dual-fuel']}
              />
            </FieldRow>
          </div>
        </>
      )}

      {/* Text note content (only for textNote type) */}
      {t === 'textNote' && (
        <>
          <SectionHead title="Note Text" />
          <FieldRow label="Content">
            <textarea
              value={String(d.text ?? '')}
              onChange={(e) => set('text', e.target.value)}
              rows={4}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent resize-y"
              placeholder="Enter annotation text…"
            />
          </FieldRow>
          <label className="flex items-center gap-2 text-xs cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={!!d.bold}
              onChange={(e) => set('bold', e.target.checked)}
              className="rounded"
            />
            Bold text
          </label>
        </>
      )}

      {/* Conductors + SKU (hidden for textNote) */}
      {t !== 'textNote' && (
        <>
          <SectionHead title="Conductors" />
          <ConductorConfig
            circuitType={circuitType}
            phases={phases}
            conductors={conductors}
            onChange={(c) => set('conductors', c)}
          />

          <SectionHead title="Product / SKU" />
          <FieldRow label="Product name or model">
            <TInput
              value={String(d.productName ?? '')}
              onChange={(v) => set('productName', v)}
              placeholder="Search or enter model…"
            />
          </FieldRow>
          <p className="text-xs text-muted-foreground mb-2">
            Full store catalog link — coming with Phase 2 shop.
          </p>
        </>
      )}

      {/* Duplicate + Delete */}
      <div className="pt-3 mt-2 border-t border-border flex items-center justify-between">
        <button
          type="button"
          onClick={() => onDuplicate(node.id)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Copy size={12} /> Duplicate
        </button>
        <button
          type="button"
          onClick={() => onDelete(node.id)}
          className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80"
        >
          <Trash2 size={12} /> Remove
        </button>
      </div>
    </div>
  )
}

// ── Edge (cable) editor ───────────────────────────────────────────────────────

function EdgeEditor({
  edge,
  onUpdate,
  onDelete,
}: {
  edge: Edge
  onUpdate: (id: string, patch: Record<string, unknown>) => void
  onDelete: (id: string) => void
}) {
  const d = (edge.data ?? {}) as Record<string, unknown>
  const circuitType = (d.circuitType as string) ?? 'ac'

  const rawSpec = String(d.spec ?? '')
  const specParts = rawSpec.split(' ')
  const [cableType, setCableType] = useState(specParts[0] || 'CU')
  const [crossSection, setCrossSection] = useState(specParts[1] || '6mm²')

  const segments = (d.segments as Segment[]) ?? []
  const conductors = (d.conductors as Record<string, boolean>) ?? {}

  function set(key: string, value: unknown) {
    onUpdate(edge.id, { [key]: value })
  }

  function setCableTypeAndSpec(v: string) {
    setCableType(v)
    onUpdate(edge.id, { cableType: v, spec: `${v} ${crossSection}` })
  }

  function setCrossSectionAndSpec(v: string) {
    setCrossSection(v)
    onUpdate(edge.id, { crossSection: v, spec: `${cableType} ${v}` })
  }

  return (
    <div className="flex flex-col">
      <SectionHead title="Cable" />
      <div className="grid grid-cols-2 gap-2">
        <FieldRow label="Type">
          <SInput value={cableType} onChange={setCableTypeAndSpec} options={CABLE_TYPES} />
        </FieldRow>
        <FieldRow label="Cross-section">
          <SInput value={crossSection} onChange={setCrossSectionAndSpec} options={CROSS_SECTIONS} />
        </FieldRow>
      </div>
      <FieldRow label="Circuit">
        <SInput
          value={circuitType}
          onChange={(v) => set('circuitType', v)}
          options={['dc', 'ac', 'battery', 'earth']}
        />
      </FieldRow>
      <FieldRow label="Routing">
        <SInput
          value={String(d.routingType ?? 'smoothstep')}
          onChange={(v) => set('routingType', v)}
          options={['smoothstep', 'bezier', 'straight']}
        />
      </FieldRow>

      {/* Conductors */}
      <SectionHead title="Conductors" />
      <ConductorConfig
        circuitType={circuitType}
        conductors={conductors}
        onChange={(c) => set('conductors', c)}
      />

      {/* Route segments */}
      <SectionHead title="Route Segments" />
      <p className="text-xs text-muted-foreground mb-2">
        Split the run by installation method. Total length is calculated automatically.
      </p>
      <SegmentEditor
        segments={segments}
        onChange={(segs) => {
          const total = segs.reduce((sum, s) => sum + (s.lengthM || 0), 0)
          onUpdate(edge.id, { segments: segs, lengthM: total > 0 ? total : d.lengthM })
        }}
      />
      {segments.length === 0 && (
        <FieldRow label="Direct length (m)">
          <NInput value={d.lengthM as number ?? 0} onChange={(v) => set('lengthM', v)} step={0.5} />
        </FieldRow>
      )}

      {/* Delete */}
      <div className="pt-3 mt-2 border-t border-border">
        <button
          type="button"
          onClick={() => onDelete(edge.id)}
          className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80"
        >
          <Trash2 size={12} /> Remove this cable
        </button>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

// ── Diagram stats footer ──────────────────────────────────────────────────────

function DiagramStats({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const [open, setOpen] = useState(false)
  const totalCableM = edges.reduce((sum, e) => {
    const d = e.data as CableEdgeData | undefined
    const segs = d?.segments as Array<{ lengthM: number }> | undefined
    const len = segs?.length
      ? segs.reduce((s, sg) => s + (sg.lengthM || 0), 0)
      : (d?.lengthM ?? 0)
    return sum + len
  }, 0)

  const componentTypes: Record<string, number> = {}
  for (const n of nodes) {
    const t = n.type ?? 'unknown'
    componentTypes[t] = (componentTypes[t] ?? 0) + 1
  }

  return (
    <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 12px', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: 11, fontWeight: 700, color: '#6b7280',
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}
      >
        <BarChart2 size={12} />
        Diagram Stats
        <span style={{ marginLeft: 'auto', fontSize: 10 }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: '#9ca3af' }}>Components</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{nodes.length}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: '#9ca3af' }}>Cables</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>{edges.length}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: '#9ca3af' }}>Total cable</span>
            <span style={{ fontWeight: 600, color: '#111827' }}>~{totalCableM}m</span>
          </div>
          {Object.entries(componentTypes).map(([type, count]) => (
            <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af' }}>
              <span style={{ textTransform: 'capitalize' }}>{type.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span>{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export interface SLDPanelProps {
  selectedNode: Node | null
  selectedEdge: Edge | null
  nodes?: Node[]
  edges?: Edge[]
  onUpdateNode: (id: string, patch: Record<string, unknown>) => void
  onUpdateEdge: (id: string, patch: Record<string, unknown>) => void
  onDeleteNode: (id: string) => void
  onDeleteEdge: (id: string) => void
  onAddNode: (type: string) => void
  onDuplicateNode: (id: string) => void
  onDeselect: () => void
  connectMode?: boolean
  onToggleConnect?: () => void
}

export function SLDPanel({
  selectedNode,
  selectedEdge,
  nodes = [],
  edges = [],
  onUpdateNode,
  onUpdateEdge,
  onDeleteNode,
  onDeleteEdge,
  onAddNode,
  onDuplicateNode,
  onDeselect,
  connectMode = false,
  onToggleConnect,
}: SLDPanelProps) {
  const hasSelection = !!(selectedNode ?? selectedEdge)
  const title = selectedNode ? 'Component' : selectedEdge ? 'Cable' : connectMode ? 'Connect Mode' : 'Diagram'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #e5e7eb',
          background: '#f9fafb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </span>
        {hasSelection && (
          <button
            type="button"
            onClick={onDeselect}
            style={{ fontSize: 11, color: '#6b7280', cursor: 'pointer', background: 'none', border: 'none' }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>

        {selectedNode && (
          <NodeEditor node={selectedNode} onUpdate={onUpdateNode} onDelete={onDeleteNode} onDuplicate={onDuplicateNode} />
        )}

        {selectedEdge && !selectedNode && (
          <EdgeEditor edge={selectedEdge} onUpdate={onUpdateEdge} onDelete={onDeleteEdge} />
        )}

        {!hasSelection && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Connect mode banner */}
            {connectMode ? (
              <div style={{
                background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
                padding: '12px', display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', margin: 0 }}>
                  Connect Mode Active
                </p>
                <p style={{ fontSize: 11, color: '#3b82f6', margin: 0, lineHeight: 1.5 }}>
                  Drag from any coloured handle dot on a component to a handle on another component to draw a cable.
                </p>
                <button
                  type="button"
                  onClick={onToggleConnect}
                  style={{
                    fontSize: 11, fontWeight: 600, color: '#1d4ed8',
                    background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 6,
                    padding: '4px 8px', cursor: 'pointer', alignSelf: 'flex-start',
                  }}
                >
                  Exit Connect Mode
                </button>
              </div>
            ) : (
              /* Empty-state hint */
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af' }}>
                <MousePointerClick size={22} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Click to configure</p>
                <p style={{ fontSize: 11 }}>Select any block or cable to edit its parameters.</p>
              </div>
            )}

            {/* Add component */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Add Component
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {ADDABLE_NODES.map((n) => (
                  <button
                    key={n.type}
                    type="button"
                    onClick={() => onAddNode(n.type)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 6,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 12,
                      color: '#374151',
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'none')}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: n.color, flexShrink: 0 }} />
                    {n.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Legend
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { color: CLR.dc,    label: 'DC / PV circuits'  },
                  { color: CLR.bat,   label: 'Battery circuits'  },
                  { color: CLR.ac,    label: 'AC circuits'        },
                  { color: CLR.earth, label: 'Earthing'           },
                  { color: CLR.grid,  label: 'Grid supply'        },
                ].map(({ color, label }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#6b7280' }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }} />
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Diagram stats — always visible at panel bottom */}
      <DiagramStats nodes={nodes} edges={edges} />
    </div>
  )
}
