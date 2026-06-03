'use client'

import { useState } from 'react'
import { Trash2, Plus, MousePointerClick, Copy, BarChart2, Layers } from 'lucide-react'
import type { Node, Edge } from '@xyflow/react'
import { CLR } from './sld-nodes'
import type { CableEdgeData } from '@/lib/solar/sld-builder'
import type { DiagramLayerState } from '@/types/sld-components'
import { getLugSpecsCached, estimateMountingStructure, calculateOptimalEarthPoints } from '@/lib/solar/lug-calculator'
import { CIRCUIT_LAYER_COLORS, toggleLayerVisibility, showAllLayers } from '@/lib/solar/circuit-layer-manager'

// ── Constants ─────────────────────────────────────────────────────────────────

const CABLE_TYPES = ['H1Z2Z2', 'CU', 'XLPE', 'Flex (HO5VV-F)', 'Al']
const CROSS_SECTIONS = ['1.5mm²', '2.5mm²', '4mm²', '6mm²', '10mm²', '16mm²', '25mm²', '35mm²', '50mm²', '70mm²', '95mm²']
const CONNECTOR_TYPES = ['MC4', 'Bootlace', 'Anderson', 'Crimped lug', 'Screw terminal', 'Other']
const MOUNTING_TYPES = ['Rail system', 'Ground mount', 'Ballasted', 'Custom bracket']
const EARTHING_SOURCES = ['Integrated', 'External spike', 'Rail system', 'Separate earth cable']
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
const CIRCUIT_LAYERS = ['live', 'neutral', 'earth', 'communication']
const PROTOCOLS = ['Modbus RTU', 'Modbus TCP', 'CAN', 'RS485', 'Digital I/O', 'WiFi', 'Ethernet', 'DLMS/COSEM', 'Other']

export const ADDABLE_NODES: Array<{ type: string; label: string; color: string }> = [
  { type: 'connector',  label: 'Connector / Lug',        color: '#64748b' },
  { type: 'dcIsolator', label: 'DC Isolator',           color: CLR.dc    },
  { type: 'acIsolator', label: 'AC Isolator',            color: CLR.ac    },
  { type: 'spd',        label: 'Surge Protection (SPD)', color: CLR.dc    },
  { type: 'generator',  label: 'Generator',              color: '#6b7280' },
  { type: 'changeover', label: 'Changeover Switch',      color: '#6b7280' },
  { type: 'meter',      label: 'Energy Meter',           color: CLR.ac    },
  { type: 'evCharger',  label: 'EV Charger',             color: CLR.bat   },
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

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer mb-1.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
      <span>{label}</span>
    </label>
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
  circuitType, phases = 1, conductors, onChange,
}: {
  circuitType: string; phases?: number
  conductors: Record<string, boolean>; onChange: (c: Record<string, boolean>) => void
}) {
  const [advanced, setAdvanced] = useState(false)
  const defs = getConductorDefs(circuitType, phases)
  const active = defs.filter((d) => conductors[d.key] !== false)

  if (!advanced) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {active.map((d) => (
          <span key={d.key} className="px-1.5 py-0.5 rounded text-white font-bold leading-none" style={{ background: d.color, fontSize: 10 }}>
            {d.short}
          </span>
        ))}
        <button type="button" onClick={() => setAdvanced(true)} className="text-xs text-muted-foreground hover:text-foreground ml-auto">
          Advanced ▾
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {defs.map((d) => (
        <label key={d.key} className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={conductors[d.key] !== false} onChange={(e) => onChange({ ...conductors, [d.key]: e.target.checked })} className="rounded" />
          <span className="w-5 h-5 rounded flex items-center justify-center text-white font-bold shrink-0" style={{ background: d.color, fontSize: 9 }}>{d.short}</span>
          <span className="text-foreground">{d.label}</span>
        </label>
      ))}
      <button type="button" onClick={() => setAdvanced(false)} className="text-xs text-muted-foreground hover:text-foreground self-end">Simple ▴</button>
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
            min={0} step={0.5} placeholder="m"
            className="w-14 h-7 rounded border border-border bg-background px-1.5 text-xs text-right focus-visible:outline-none"
          />
          <span className="text-xs text-muted-foreground shrink-0">m</span>
          <button type="button" onClick={() => onChange(segments.filter((s) => s.id !== seg.id))} className="text-muted-foreground hover:text-destructive shrink-0">
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

// ── Per-row mounting layout editor ───────────────────────────────────────────

interface MountingRow {
  id: string
  count: number
  orientation: 'portrait' | 'landscape'
  mountType: string
}

function RowLayoutEditor({ rows, onChange }: { rows: MountingRow[]; onChange: (rows: MountingRow[]) => void }) {
  const total = rows.reduce((s, r) => s + (r.count || 0), 0)
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, idx) => (
        <div key={row.id} className="flex gap-1 items-center">
          <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">{idx + 1}</span>
          <input
            type="number"
            value={row.count || ''}
            onChange={(e) => onChange(rows.map((r) => r.id === row.id ? { ...r, count: parseInt(e.target.value) || 0 } : r))}
            min={1}
            placeholder="n"
            title="Panels in this row"
            className="w-10 h-7 rounded border border-border bg-background px-1 text-xs text-center focus-visible:outline-none"
          />
          <select
            value={row.orientation}
            onChange={(e) => onChange(rows.map((r) => r.id === row.id ? { ...r, orientation: e.target.value as 'portrait' | 'landscape' } : r))}
            className="w-20 h-7 rounded border border-border bg-background px-1 text-xs focus-visible:outline-none shrink-0"
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
          <select
            value={row.mountType}
            onChange={(e) => onChange(rows.map((r) => r.id === row.id ? { ...r, mountType: e.target.value } : r))}
            className="flex-1 h-7 rounded border border-border bg-background px-1 text-xs focus-visible:outline-none min-w-0"
          >
            {MOUNTING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="button" onClick={() => onChange(rows.filter((r) => r.id !== row.id))} className="text-muted-foreground hover:text-destructive shrink-0">
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between mt-0.5">
        <button
          type="button"
          onClick={() => onChange([...rows, { id: `row-${Date.now()}`, count: 1, orientation: 'portrait', mountType: 'Rail system' }])}
          className="text-xs text-accent hover:text-accent/80 flex items-center gap-1"
        >
          <Plus size={11} /> Add row
        </button>
        {total > 0 && <span className="text-xs font-semibold">{total} panels total</span>}
      </div>
    </div>
  )
}

// ── Mounting structure auto-calc display ──────────────────────────────────────

function MountingStructurePreview({ panelCount, rows, cols, orientation, mountType }: {
  panelCount: number; rows: number; cols: number; orientation: string; mountType: string
}) {
  if (!panelCount || !rows || !cols) return null
  const layout = { rows, columns: cols, orientation: (orientation as 'portrait' | 'landscape') || 'portrait' }
  const items = estimateMountingStructure(panelCount, layout, (mountType?.toLowerCase().replace(/\s+/g, '_') as any) || 'rail_system')

  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 8px', marginTop: 4 }}>
      <div className="text-xs text-muted-foreground font-semibold mb-1">Mounting structure (estimated)</div>
      {items.map((item, i) => (
        <div key={i} className="text-xs text-foreground flex justify-between gap-2">
          <span style={{ color: '#6b7280' }}>•</span>
          <span className="flex-1">{item.description}</span>
        </div>
      ))}
    </div>
  )
}

// ── Node editor ───────────────────────────────────────────────────────────────

function NodeEditor({
  node, edges, onUpdate, onDelete, onDuplicate,
}: {
  node: Node; edges: Edge[]
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

  // Find connected AC output edge for lug auto-calc
  const acOutEdge = edges.find((e) => e.source === node.id && e.sourceHandle === 'ac-out')
  const acOutSpec = (acOutEdge?.data as CableEdgeData)?.spec ?? (d.acOutCableSpec as string | undefined) ?? ''
  const acOutLugs = acOutSpec ? getLugSpecsCached(acOutSpec) : null

  const acOut2Edge = edges.find((e) => e.source === node.id && e.sourceHandle === 'ac-out-2')
  const acOut2Spec = (acOut2Edge?.data as CableEdgeData)?.spec ?? (d.acOut2CableSpec as string | undefined) ?? ''
  const acOut2Lugs = acOut2Spec ? getLugSpecsCached(acOut2Spec) : null

  return (
    <div className="flex flex-col">
      <SectionHead title="General" />

      <FieldRow label="Label">
        <TInput value={String(d.label ?? '')} onChange={(v) => set('label', v)} />
      </FieldRow>

      {!['earthing', 'textNote'].includes(t) && (
        <FieldRow label="Model / make">
          <TInput value={String(d.model ?? d.inverterModel ?? '')} onChange={(v) => set('model', v)} placeholder="e.g. Sigenergy SE8K" />
        </FieldRow>
      )}

      {/* ── Solar Array ──────────────────────────────────────────────────────── */}
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

          <SectionHead title="Connector" />
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="Type">
              <SInput value={String(d.connectorType ?? 'MC4')} onChange={(v) => set('connectorType', v)} options={CONNECTOR_TYPES} />
            </FieldRow>
            <FieldRow label="Qty">
              <NInput value={d.connectorQty as number ?? (d.panelCount as number ?? 0)} onChange={(v) => set('connectorQty', v)} min={1} />
            </FieldRow>
          </div>

          <SectionHead title="Mounting Layout" />
          {(() => {
            const layout = (d.mountingLayout as MountingRow[] | undefined) ?? []
            if (layout.length > 0) {
              return (
                <>
                  <RowLayoutEditor
                    rows={layout}
                    onChange={(rows) => set('mountingLayout', rows)}
                  />
                  <MountingStructurePreview
                    panelCount={layout.reduce((s, r) => s + (r.count || 0), 0) || (d.panelCount as number ?? 0)}
                    rows={layout.length}
                    cols={Math.max(...layout.map((r) => (r as MountingRow).count || 1))}
                    orientation={layout[0]?.orientation ?? 'portrait'}
                    mountType={layout[0]?.mountType ?? 'Rail system'}
                  />
                  <button
                    type="button"
                    onClick={() => set('mountingLayout', [])}
                    className="text-xs text-muted-foreground hover:text-foreground mt-1"
                  >
                    ← Simple grid
                  </button>
                </>
              )
            }
            // Simple grid mode
            return (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <FieldRow label="Rows">
                    <NInput value={d.mountingRows as number ?? 1} onChange={(v) => set('mountingRows', v)} min={1} />
                  </FieldRow>
                  <FieldRow label="Cols">
                    <NInput value={d.mountingCols as number ?? (d.panelCount as number ?? 7)} onChange={(v) => set('mountingCols', v)} min={1} />
                  </FieldRow>
                  <FieldRow label="Orient.">
                    <SInput
                      value={String(d.mountingOrientation ?? 'portrait')}
                      onChange={(v) => set('mountingOrientation', v)}
                      options={['portrait', 'landscape']}
                    />
                  </FieldRow>
                </div>
                <FieldRow label="Mount type">
                  <SInput value={String(d.mountingType ?? 'Rail system')} onChange={(v) => set('mountingType', v)} options={MOUNTING_TYPES} />
                </FieldRow>
                <MountingStructurePreview
                  panelCount={d.panelCount as number ?? 0}
                  rows={d.mountingRows as number ?? 1}
                  cols={d.mountingCols as number ?? (d.panelCount as number ?? 7)}
                  orientation={String(d.mountingOrientation ?? 'portrait')}
                  mountType={String(d.mountingType ?? 'Rail system')}
                />
                <button
                  type="button"
                  onClick={() => set('mountingLayout', [
                    {
                      id: `row-${Date.now()}`,
                      count: d.panelCount as number ?? 0,
                      orientation: (String(d.mountingOrientation ?? 'portrait')) as 'portrait' | 'landscape',
                      mountType: String(d.mountingType ?? 'Rail system'),
                    },
                  ])}
                  className="text-xs text-accent hover:text-accent/80 mt-1 flex items-center gap-1"
                >
                  <Plus size={11} /> Custom rows
                </button>
              </>
            )
          })()}

          <SectionHead title="Earthing" />
          <CheckRow label="Requires earth" checked={!!d.earthingRequired} onChange={(v) => set('earthingRequired', v)} />
          {d.earthingRequired && (
            <>
              <FieldRow label="Earth method">
                <SInput value={String(d.earthingMethod ?? 'Rail system')} onChange={(v) => set('earthingMethod', v)} options={EARTHING_SOURCES} />
              </FieldRow>
              <FieldRow label="Earth points (suggested: {n})">
                <div className="flex gap-2 items-center">
                  <NInput
                    value={d.earthPointCount as number ?? calculateOptimalEarthPoints(d.panelCount as number ?? 0)}
                    onChange={(v) => set('earthPointCount', v)}
                    min={1}
                  />
                  <button
                    type="button"
                    onClick={() => set('earthPointCount', calculateOptimalEarthPoints(d.panelCount as number ?? 0))}
                    className="text-xs text-accent whitespace-nowrap"
                  >
                    Auto
                  </button>
                </div>
              </FieldRow>
            </>
          )}
        </>
      )}

      {/* ── Combiner ─────────────────────────────────────────────────────────── */}
      {t === 'combiner' && (
        <>
          <SectionHead title="Combiner Box" />
          <FieldRow label="String count">
            <NInput value={d.stringCount as number ?? 2} onChange={(v) => set('stringCount', v)} min={1} />
          </FieldRow>
          <FieldRow label="Fuse rating">
            <TInput value={String(d.fuseRating ?? '20A')} onChange={(v) => set('fuseRating', v)} placeholder="20A" />
          </FieldRow>
          <CheckRow label="SPD (Type 2) included" checked={!!d.hasSpd} onChange={(v) => set('hasSpd', v)} />

          <SectionHead title="Material & Earthing" />
          <CheckRow label="Plastic housing" checked={!!d.plastic} onChange={(v) => set('plastic', v)} />
          <CheckRow label="Metal frame / enclosure" checked={!!d.metal} onChange={(v) => set('metal', v)} />
          <CheckRow label="Requires earth connection" checked={!!d.requiresEarth} onChange={(v) => set('requiresEarth', v)} />
          {d.requiresEarth && (
            <FieldRow label="Earthing source">
              <SInput value={String(d.earthingSource ?? 'Integrated')} onChange={(v) => set('earthingSource', v)} options={EARTHING_SOURCES} />
            </FieldRow>
          )}
        </>
      )}

      {/* ── Inverter ─────────────────────────────────────────────────────────── */}
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

          <SectionHead title="I/O Configuration" />
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="AC outputs">
              <SInput value={String(d.outputCount ?? 1)} onChange={(v) => set('outputCount', parseInt(v))} options={['1', '2']} />
            </FieldRow>
            <FieldRow label="PV connector">
              <SInput value={String(d.pvConnectorType ?? 'MC4')} onChange={(v) => set('pvConnectorType', v)} options={CONNECTOR_TYPES} />
            </FieldRow>
          </div>
          <CheckRow label="Has EPS / backup output" checked={!!d.hasEpsOutput} onChange={(v) => set('hasEpsOutput', v)} />
          <CheckRow label="Has generator input" checked={!!d.hasGenerator} onChange={(v) => set('hasGenerator', v)} />

          <SectionHead title="Output 1 — Main AC" />
          <FieldRow label="Connector type">
            <SInput value={String(d.acOutConnectorType ?? 'Bootlace')} onChange={(v) => set('acOutConnectorType', v)} options={CONNECTOR_TYPES} />
          </FieldRow>
          <FieldRow label="Cable spec (from connected cable)">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-foreground flex-1 truncate">
                {acOutSpec || '— connect a cable first —'}
              </span>
            </div>
          </FieldRow>
          {acOutLugs && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 8px', marginBottom: 8 }}>
              <div className="text-xs font-semibold text-blue-700 mb-1">Auto-calculated lugs</div>
              <div className="text-xs text-blue-600">{acOutLugs.count}× {acOutLugs.size} Cu lugs</div>
              <div className="text-xs text-blue-400 mt-0.5">({acOutSpec})</div>
            </div>
          )}
          <FieldRow label="Earth conductor">
            <SInput
              value={String(d.acOutEarth ?? 'Combined')}
              onChange={(v) => set('acOutEarth', v)}
              options={['Combined', 'Separate', 'Separate (3-core)','Separate (5-core)']}
            />
          </FieldRow>

          {(d.hasEpsOutput || Number(d.outputCount) >= 2) && (
            <>
              <SectionHead title="Output 2 — EPS / Backup" />
              <FieldRow label="Connector type">
                <SInput value={String(d.acOut2ConnectorType ?? 'Bootlace')} onChange={(v) => set('acOut2ConnectorType', v)} options={CONNECTOR_TYPES} />
              </FieldRow>
              {acOut2Lugs && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 8px', marginBottom: 8 }}>
                  <div className="text-xs font-semibold text-blue-700 mb-1">Auto-calculated lugs</div>
                  <div className="text-xs text-blue-600">{acOut2Lugs.count}× {acOut2Lugs.size} Cu lugs</div>
                </div>
              )}
              <FieldRow label="Earth conductor">
                <SInput value={String(d.acOut2Earth ?? 'Combined')} onChange={(v) => set('acOut2Earth', v)} options={['Combined', 'Separate', 'Separate (3-core)']} />
              </FieldRow>
            </>
          )}
        </>
      )}

      {/* ── Battery ───────────────────────────────────────────────────────────── */}
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
            <SInput value={String(d.chemistry ?? 'LiFePO4')} onChange={(v) => set('chemistry', v)} options={['LiFePO4', 'Li-NMC', 'Lead Acid', 'Other']} />
          </FieldRow>
        </>
      )}

      {/* ── Grid ──────────────────────────────────────────────────────────────── */}
      {t === 'grid' && (
        <>
          <SectionHead title="Grid Supply" />
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="Phase">
              <SInput value={String(phases) + 'Ø'} onChange={(v) => set('phases', parseInt(v))} options={['1Ø', '3Ø']} />
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

      {/* ── DB Board ──────────────────────────────────────────────────────────── */}
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

      {/* ── Earthing ──────────────────────────────────────────────────────────── */}
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

      {/* ── Generator ────────────────────────────────────────────────────────── */}
      {t === 'generator' && (
        <>
          <SectionHead title="Generator" />
          <div className="grid grid-cols-2 gap-2">
            <FieldRow label="kVA">
              <NInput value={d.kva as number ?? 5} onChange={(v) => set('kva', v)} step={0.5} />
            </FieldRow>
            <FieldRow label="Fuel type">
              <SInput value={String(d.fuelType ?? 'Diesel')} onChange={(v) => set('fuelType', v)} options={['Diesel', 'Petrol', 'Gas', 'Dual-fuel']} />
            </FieldRow>
          </div>
        </>
      )}

      {/* ── Text Note ────────────────────────────────────────────────────────── */}
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
            <input type="checkbox" checked={!!d.bold} onChange={(e) => set('bold', e.target.checked)} className="rounded" />
            Bold text
          </label>
        </>
      )}

      {/* ── Connector / Lug ──────────────────────────────────────────────────── */}
      {t === 'connector' && (
        <>
          <SectionHead title="Connector" />
          <FieldRow label="Type">
            <SInput value={String(d.connectorType ?? 'MC4')} onChange={(v) => { set('connectorType', v); set('label', v) }} options={CONNECTOR_TYPES} />
          </FieldRow>
          <FieldRow label="Qty">
            <NInput value={d.qty as number ?? 1} onChange={(v) => set('qty', v)} min={1} />
          </FieldRow>
          <FieldRow label="Notes / pin ref">
            <TInput value={String(d.notes ?? '')} onChange={(v) => set('notes', v)} placeholder="e.g. +/− pair, male side" />
          </FieldRow>
        </>
      )}

      {/* ── Conductors + SKU ─────────────────────────────────────────────────── */}
      {!['textNote', 'connector'].includes(t) && (
        <>
          <SectionHead title="Conductors" />
          <ConductorConfig circuitType={circuitType} phases={phases} conductors={conductors} onChange={(c) => set('conductors', c)} />

          <SectionHead title="Product / SKU" />
          <FieldRow label="Product name or model">
            <TInput value={String(d.productName ?? '')} onChange={(v) => set('productName', v)} placeholder="Search or enter model…" />
          </FieldRow>
          <p className="text-xs text-muted-foreground mb-2">Full store catalog link — coming with Phase 2 shop.</p>
        </>
      )}

      {/* Duplicate + Delete */}
      <div className="pt-3 mt-2 border-t border-border flex items-center justify-between">
        <button type="button" onClick={() => onDuplicate(node.id)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Copy size={12} /> Duplicate
        </button>
        <button type="button" onClick={() => onDelete(node.id)} className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80">
          <Trash2 size={12} /> Remove
        </button>
      </div>
    </div>
  )
}

// ── Edge (cable) editor ───────────────────────────────────────────────────────

function EdgeEditor({
  edge, onUpdate, onDelete,
}: {
  edge: Edge
  onUpdate: (id: string, patch: Record<string, unknown>) => void
  onDelete: (id: string) => void
}) {
  const d = (edge.data ?? {}) as Record<string, unknown>
  const circuitType = (d.circuitType as string) ?? 'ac'
  const circuitLayer = (d.circuitLayer as string) ?? ''
  const isCommunication = circuitType === 'communication' || circuitLayer === 'communication'
  const isDirect = !!(d.isDirect as boolean | undefined)

  const rawSpec = String(d.spec ?? '')
  const specParts = rawSpec.split(' ')
  const [cableType, setCableType] = useState(specParts[0] || 'CU')
  const [crossSection, setCrossSection] = useState(specParts[1] || '6mm²')

  const segments = (d.segments as Segment[]) ?? []
  const conductors = (d.conductors as Record<string, boolean>) ?? {}

  // Auto-calc lugs from cable spec
  const lugSpecs = rawSpec ? getLugSpecsCached(rawSpec) : null

  function set(key: string, value: unknown) { onUpdate(edge.id, { [key]: value }) }

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
      <SectionHead title="Circuit Layer" />
      <FieldRow label="Layer">
        <SInput
          value={circuitLayer || circuitType}
          onChange={(v) => {
            const isComms = v === 'communication'
            onUpdate(edge.id, {
              circuitLayer: v,
              circuitType: isComms ? 'communication' : (v === 'earth' ? 'earth' : circuitType),
            })
          }}
          options={CIRCUIT_LAYERS}
        />
      </FieldRow>

      {/* Direct connection — for battery banks, stackable inverter stacks */}
      <CheckRow
        label="Direct connection (no cable — bus bar / stackable)"
        checked={isDirect}
        onChange={(v) => set('isDirect', v)}
      />
      {isDirect && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '6px 8px', marginBottom: 8 }}>
          <div className="text-xs font-semibold text-green-700">Direct Bus</div>
          <div className="text-xs text-green-600 mt-0.5">Renders as a thick solid line. Use for Sigenergy stacks or direct battery connections.</div>
        </div>
      )}

      {!isCommunication && !isDirect && (
        <>
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
            <SInput value={circuitType} onChange={(v) => set('circuitType', v)} options={['dc', 'ac', 'battery', 'earth']} />
          </FieldRow>
          <FieldRow label="Routing">
            <SInput value={String(d.routingType ?? 'smoothstep')} onChange={(v) => set('routingType', v)} options={['smoothstep', 'bezier', 'straight']} />
          </FieldRow>

          {/* Lug auto-calc display */}
          {lugSpecs && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 8px', marginBottom: 8 }}>
              <div className="text-xs font-semibold text-blue-700 mb-1">Lug specification (auto-calculated)</div>
              <div className="text-xs text-blue-600">{lugSpecs.count}× {lugSpecs.size} {lugSpecs.material ?? 'Cu'} lugs</div>
              <div className="text-xs text-blue-400 mt-0.5">Based on: {rawSpec}</div>
            </div>
          )}

          <FieldRow label="Connector type">
            <SInput value={String(d.connectorType ?? 'Bootlace')} onChange={(v) => set('connectorType', v)} options={CONNECTOR_TYPES} />
          </FieldRow>

          <SectionHead title="Conductors" />
          <ConductorConfig circuitType={circuitType} conductors={conductors} onChange={(c) => set('conductors', c)} />

          <SectionHead title="Route Segments" />
          <p className="text-xs text-muted-foreground mb-2">Split the run by installation method.</p>
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

          {/* Waypoints info */}
          {((d.waypoints as unknown[])?.length ?? 0) > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '6px 8px', marginTop: 4, marginBottom: 8 }}>
              <div className="text-xs text-green-700">
                {(d.waypoints as unknown[]).length} waypoint{(d.waypoints as unknown[]).length !== 1 ? 's' : ''} set · Select cable to drag them
              </div>
              <button type="button" onClick={() => set('waypoints', [])} className="text-xs text-red-500 mt-1">Clear waypoints</button>
            </div>
          )}
        </>
      )}

      {/* Communication-specific fields */}
      {isCommunication && (
        <>
          <SectionHead title="Communication Protocol" />
          <FieldRow label="Source protocol">
            <SInput
              value={String((d.sourceProtocol as string[] | undefined)?.[0] ?? '')}
              onChange={(v) => set('sourceProtocol', v ? [v] : [])}
              options={['', ...PROTOCOLS]}
            />
          </FieldRow>
          <FieldRow label="Target protocol">
            <SInput
              value={String((d.targetProtocol as string[] | undefined)?.[0] ?? '')}
              onChange={(v) => set('targetProtocol', v ? [v] : [])}
              options={['', ...PROTOCOLS]}
            />
          </FieldRow>
          {(d.sourceProtocol as string[] | undefined)?.[0] && (d.targetProtocol as string[] | undefined)?.[0] &&
           (d.sourceProtocol as string[])[0] !== (d.targetProtocol as string[])[0] && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '6px 8px', marginBottom: 8 }}>
              <div className="text-xs text-red-600 font-semibold">⚠ Protocol mismatch</div>
              <div className="text-xs text-red-500 mt-0.5">
                {(d.sourceProtocol as string[])[0]} vs {(d.targetProtocol as string[])[0]} — may require adapter
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer mt-2 text-red-700">
                <input
                  type="checkbox"
                  checked={!!d.overrideProtocolMismatch}
                  onChange={(e) => {
                    onUpdate(edge.id, { overrideProtocolMismatch: e.target.checked, compatible: !e.target.checked ? false : true })
                  }}
                  className="rounded"
                />
                Override mismatch (custom integration)
              </label>
            </div>
          )}
          <FieldRow label="Connection label">
            <TInput value={String(d.spec ?? '')} onChange={(v) => set('spec', v)} placeholder="e.g. Modbus RTU 9600bps" />
          </FieldRow>
        </>
      )}

      {/* Delete */}
      <div className="pt-3 mt-2 border-t border-border">
        <button type="button" onClick={() => onDelete(edge.id)} className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80">
          <Trash2 size={12} /> Remove this cable
        </button>
      </div>
    </div>
  )
}

// ── Diagram stats ─────────────────────────────────────────────────────────────

function DiagramStats({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const [open, setOpen] = useState(false)
  const totalCableM = edges.reduce((sum, e) => {
    const d = e.data as CableEdgeData | undefined
    const segs = d?.segments
    const len = segs?.length ? segs.reduce((s, sg) => s + (sg.lengthM || 0), 0) : (d?.lengthM ?? 0)
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

// ── Layer visibility section ──────────────────────────────────────────────────

function LayerVisibilitySection({
  layers, onChange,
}: {
  layers: DiagramLayerState
  onChange: (s: DiagramLayerState) => void
}) {
  const defs = [
    { key: 'live' as const,          label: 'Live (L)',       color: CIRCUIT_LAYER_COLORS.live          },
    { key: 'neutral' as const,       label: 'Neutral (N)',    color: CIRCUIT_LAYER_COLORS.neutral       },
    { key: 'earth' as const,         label: 'Earth (E)',      color: CIRCUIT_LAYER_COLORS.earth         },
    { key: 'communication' as const, label: 'Communication',  color: CIRCUIT_LAYER_COLORS.communication },
  ]

  return (
    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          <Layers size={12} />
          Circuit Layers
        </div>
        <button
          type="button"
          onClick={() => onChange(showAllLayers())}
          style={{ fontSize: 10, color: '#6b7280', cursor: 'pointer', background: 'none', border: 'none' }}
        >
          Show all
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {defs.map(({ key, label, color }) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={() => onChange(toggleLayerVisibility(layers, key))}
              style={{ accentColor: color }}
            />
            <div style={{ width: 12, height: 12, borderRadius: 3, background: layers[key] ? color : '#d1d5db', flexShrink: 0, transition: 'background 0.15s' }} />
            <span style={{ color: layers[key] ? '#374151' : '#9ca3af' }}>{label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export interface SLDPanelProps {
  selectedNode: Node | null
  selectedEdge: Edge | null
  nodes?: Node[]
  edges?: Edge[]
  layerVisibility?: DiagramLayerState
  onLayerVisibilityChange?: (s: DiagramLayerState) => void
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
  selectedNode, selectedEdge,
  nodes = [], edges = [],
  layerVisibility = { live: true, neutral: true, earth: true, communication: true },
  onLayerVisibilityChange = () => {},
  onUpdateNode, onUpdateEdge,
  onDeleteNode, onDeleteEdge,
  onAddNode, onDuplicateNode,
  onDeselect,
  connectMode = false,
  onToggleConnect,
}: SLDPanelProps) {
  const hasSelection = !!(selectedNode ?? selectedEdge)
  const title = selectedNode ? 'Component' : selectedEdge ? 'Cable' : connectMode ? 'Connect Mode' : 'Diagram'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid #e5e7eb',
        background: '#f9fafb',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </span>
        {hasSelection && (
          <button type="button" onClick={onDeselect} style={{ fontSize: 11, color: '#6b7280', cursor: 'pointer', background: 'none', border: 'none' }}>
            ✕
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>

        {selectedNode && (
          <NodeEditor
            node={selectedNode}
            edges={edges}
            onUpdate={onUpdateNode}
            onDelete={onDeleteNode}
            onDuplicate={onDuplicateNode}
          />
        )}

        {selectedEdge && !selectedNode && (
          <EdgeEditor edge={selectedEdge} onUpdate={onUpdateEdge} onDelete={onDeleteEdge} />
        )}

        {!hasSelection && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Connect mode banner */}
            {connectMode ? (
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', margin: 0 }}>Connect Mode Active</p>
                <p style={{ fontSize: 11, color: '#3b82f6', margin: 0, lineHeight: 1.5 }}>
                  Drag from any coloured handle dot on a component to a handle on another component to draw a cable.
                </p>
                <button
                  type="button"
                  onClick={onToggleConnect}
                  style={{ fontSize: 11, fontWeight: 600, color: '#1d4ed8', background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', alignSelf: 'flex-start' }}
                >
                  Exit Connect Mode
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af' }}>
                <MousePointerClick size={22} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Click to configure</p>
                <p style={{ fontSize: 11 }}>Select any block or cable to edit its parameters.</p>
                <p style={{ fontSize: 10, marginTop: 6, color: '#9ca3af' }}>
                  Click a cable + drag the <strong>+</strong> button to add waypoints and reroute it.
                </p>
              </div>
            )}

            {/* Layer visibility */}
            <LayerVisibilitySection layers={layerVisibility} onChange={onLayerVisibilityChange} />

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
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px', borderRadius: 6,
                      background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', fontSize: 12, color: '#374151',
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
                  { color: CLR.dc,    label: 'DC / PV circuits'    },
                  { color: CLR.bat,   label: 'Battery circuits'     },
                  { color: CLR.ac,    label: 'AC circuits'          },
                  { color: CLR.earth, label: 'Earthing'             },
                  { color: CLR.grid,  label: 'Grid supply'          },
                  { color: '#f97316', label: 'Communication cables' },
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

      {/* Diagram stats — always at panel bottom */}
      <DiagramStats nodes={nodes} edges={edges} />
    </div>
  )
}
