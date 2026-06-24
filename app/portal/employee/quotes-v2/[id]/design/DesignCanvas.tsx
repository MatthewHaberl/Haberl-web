'use client'

import '@xyflow/react/dist/style.css'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, X, PencilLine, Layers, Magnet, Maximize2, Minimize2, Cable, RotateCcw, Boxes } from 'lucide-react'
import { nodeTypes } from '@/components/sld/sld-nodes'
import { edgeTypes } from '@/components/sld/sld-edges'
import {
  designToFlow, nodeIdToRef, panelGroupKwp, type SystemDesign,
} from '@/lib/solar/system-design'
import type { CableEdgeData } from '@/lib/solar/sld-builder'
import { useDesign } from './DesignProvider'

// Cable editor option lists (mirror the legacy SLD panel).
const CABLE_MATERIALS = ['CU', 'Al', 'H1Z2Z2', 'XLPE', 'Flex (HO5VV-F)']
const CABLE_SIZES = ['1.5mm²', '2.5mm²', '4mm²', '6mm²', '10mm²', '16mm²', '25mm²', '35mm²', '50mm²', '70mm²', '95mm²']
const SEGMENT_ROUTE_TYPES = [
  'In conduit (surface)', 'In conduit (buried)', 'Through ceiling void', 'Down wall (conduit)',
  'Overhead (open)', 'Underground (direct burial)', 'Open trunking', 'Under floor', 'Custom',
]

type RouteSeg = { id: string; routeType: string; lengthM: number }
let segSeq = 0
const newSegId = () => `seg-${Date.now().toString(36)}-${++segSeq}`

function conductorSummary(circuitType: string, threePhase: boolean): string {
  if (circuitType === 'earth') return 'E only'
  if (circuitType === 'dc' || circuitType === 'battery') return '+ / − / E'
  if (circuitType === 'communication') return 'data'
  return threePhase ? 'L1 / L2 / L3 / N / E' : 'L / N / E'
}

const NODE_COLORS: Record<string, string> = {
  solarArray: '#f97316', combiner: '#f97316', inverter: '#1e3a5f',
  battery: '#16a34a', grid: '#7c3aed', dbBoard: '#2563eb', earthing: '#65a30d',
}

// Toggleable layers — hiding one removes BOTH its components and its cables.
const CIRCUIT_LAYERS: Array<{ key: string; label: string; color: string }> = [
  { key: 'pv', label: 'PV', color: '#f59e0b' },
  { key: 'dc', label: 'DC', color: '#f97316' },
  { key: 'battery', label: 'Battery', color: '#16a34a' },
  { key: 'ac', label: 'AC', color: '#2563eb' },
  { key: 'earth', label: 'Earth', color: '#65a30d' },
  { key: 'data', label: 'Data', color: '#a855f7' },
]
const ALL_LAYERS_ON: Record<string, boolean> = { pv: true, dc: true, battery: true, ac: true, earth: true, data: true }

// Which layer a node belongs to (drives node visibility when a layer is hidden).
function nodeLayer(node: Node): string {
  switch (node.type) {
    case 'solarArray': return 'pv'
    case 'combiner': case 'dcIsolator': return 'dc'
    case 'battery': case 'busblock': return 'battery'
    case 'inverter': case 'grid': case 'dbBoard': case 'acIsolator':
    case 'meter': case 'changeover': case 'spd': case 'evCharger': case 'generator': return 'ac'
    case 'earthing': return 'earth'
    case 'comms': case 'meterComms': return 'data'
    default: return 'always' // textNote, connector, custom — never hidden by a layer
  }
}

function nodeSize(n: Node): { w: number; h: number } {
  const a = n as { width?: number; height?: number; measured?: { width?: number; height?: number } }
  return { w: a.measured?.width ?? a.width ?? 170, h: a.measured?.height ?? a.height ?? 90 }
}

// Nudge a dropped node out of any overlap with the others (simple separation pass).
function resolveOverlap(nodes: Node[], movedId: string, start: { x: number; y: number }, size: { w: number; h: number }): { x: number; y: number } {
  const margin = 14
  const pos = { ...start }
  for (let iter = 0; iter < 8; iter++) {
    let bumped = false
    for (const o of nodes) {
      if (o.id === movedId) continue
      const os = nodeSize(o)
      const ax2 = pos.x + size.w, ay2 = pos.y + size.h
      const bx2 = o.position.x + os.w, by2 = o.position.y + os.h
      const ox = Math.min(ax2, bx2) - Math.max(pos.x, o.position.x)
      const oy = Math.min(ay2, by2) - Math.max(pos.y, o.position.y)
      if (ox > 0 && oy > 0) {
        if (ox < oy) pos.x += (pos.x + ax2 < o.position.x + bx2 ? -(ox + margin) : (ox + margin))
        else pos.y += (pos.y + ay2 < o.position.y + by2 ? -(oy + margin) : (oy + margin))
        bumped = true
      }
    }
    if (!bumped) break
  }
  return pos
}

// Which layer an edge belongs to (from its circuit type).
function edgeLayer(edge: Edge): string {
  const ct = (edge.data as { circuitType?: string } | undefined)?.circuitType
  switch (ct) {
    case 'communication': return 'data'
    case 'dc': return 'dc'
    case 'ac': return 'ac'
    case 'battery': return 'battery'
    case 'earth': return 'earth'
    default: return 'always'
  }
}

// Only structural fields force a diagram rebuild — positions live in layout and
// are applied by designToFlow, so dragging never fights the rebuild.
function structureSig(d: SystemDesign, gridSupply?: string): string {
  return JSON.stringify({
    g: gridSupply ?? '',
    p: d.panels.map((p) => [p.id, p.panelCount, p.panelWatts, p.panelModel]),
    dc: d.dcCombiners.length,
    i: d.inverters.map((u) => [u.catalogId, u.kw, u.model, u.qty, u.phases]),
    b: d.batteries.map((b) => [b.catalogId, b.kwh, b.qty, b.model]),
    bk: [d.bank.perBatteryDisconnect, d.bank.busbar, d.bank.mainDisconnect, d.bank.cableSizeMm2, d.bank.cutoffVoltage],
    e: [d.earthing.spikeCount, d.earthing.spec],
    em: [
      ...d.earthing.conductors.map((c) => `${c.fromId}>${c.toId}:${c.sizeMm2}:${c.kind}`),
      ...d.earthing.electrodes.map((x) => `el:${x.id}:${x.spikeCount}:${x.arrangement}:${x.groupSize}:${x.linkMm2}`),
      ...d.earthing.bars.map((x) => `bar:${x.id}:${x.label}`),
    ],
    // Inspector overrides change cables/ports, so they must force a rebuild too.
    ov: JSON.stringify(d.layout.edgeOverrides ?? {}),
    no: JSON.stringify(d.layout.nodeOverrides ?? {}),
  })
}

function NodeInspector({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const { design, dispatch, setActiveStep } = useDesign()
  const ref = nodeIdToRef(nodeId)
  if (!ref) return null

  const Header = ({ title }: { title: string }) => (
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
    </div>
  )
  const DeleteBtn = ({ label }: { label: string }) => (
    <button
      type="button"
      onClick={() => { dispatch({ type: 'removeNode', id: nodeId }); onClose() }}
      className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="h-3.5 w-3.5" /> {label}
    </button>
  )
  const GoTo = ({ step, label }: { step: number; label: string }) => (
    <button
      type="button"
      onClick={() => setActiveStep(step)}
      className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline"
    >
      <PencilLine className="h-3.5 w-3.5" /> {label}
    </button>
  )

  if (ref.kind === 'panel') {
    const g = design.panels[ref.index]
    if (!g) return null
    return (
      <div>
        <Header title={`String ${ref.index + 1}`} />
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Panel count</span>
            <input
              type="number" min={0} step={1}
              value={g.panelCount || ''}
              onChange={(e) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { panelCount: Math.max(0, Math.round(Number(e.target.value) || 0)) } })}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Watts/panel</span>
            <input
              type="number" min={0} step={5}
              value={g.panelWatts || ''}
              onChange={(e) => dispatch({ type: 'updatePanelGroup', id: g.id, patch: { panelWatts: Number(e.target.value) || 0 } })}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            />
          </label>
          <p className="text-xs text-muted-foreground">{panelGroupKwp(g).toFixed(2)} kWp{g.panelModel ? ` · ${g.panelModel}` : ''}</p>
        </div>
        <DeleteBtn label="Remove string" />
      </div>
    )
  }

  if (ref.kind === 'inverter') {
    const u = design.inverters[0]
    return (
      <div>
        <Header title="Inverter" />
        {u ? (
          <div className="text-sm">
            <p className="font-medium text-foreground">{u.model || 'Inverter'}</p>
            <p className="text-xs text-muted-foreground">{u.kw.toFixed(1)} kW · ×{u.qty} · {u.phases}-phase</p>
          </div>
        ) : <p className="text-xs text-muted-foreground">No inverter.</p>}
        <GoTo step={3} label="Change in Inverter section" />
        {u && <DeleteBtn label="Remove inverter" />}
      </div>
    )
  }

  if (ref.kind === 'battery') {
    const b = design.batteries[0]
    return (
      <div>
        <Header title="Battery" />
        {b ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">{b.model || 'Battery'}</p>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Modules</span>
              <input
                type="number" min={1} step={1}
                value={b.qty}
                onChange={(e) => dispatch({ type: 'updateBattery', patch: { qty: Math.max(1, Math.round(Number(e.target.value) || 1)) } })}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              />
            </label>
            <p className="text-xs text-muted-foreground">{(b.kwh * b.qty).toFixed(1)} kWh total</p>
          </div>
        ) : <p className="text-xs text-muted-foreground">No battery.</p>}
        <GoTo step={4} label="Change in Batteries section" />
        {b && <DeleteBtn label="Remove battery" />}
      </div>
    )
  }

  if (ref.kind === 'earth') {
    return (
      <div>
        <Header title="Earthing" />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Earth spikes</span>
          <input
            type="number" min={0} step={1}
            value={design.earthing.spikeCount ?? ''}
            onChange={(e) => dispatch({ type: 'setEarthing', patch: { spikeCount: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) } })}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
        </label>
        <GoTo step={6} label="Open Earthing section" />
      </div>
    )
  }

  // combiner / grid / db — informational in Phase 1
  return (
    <div>
      <Header title={ref.kind === 'db' ? 'Distribution board' : ref.kind === 'combiner' ? 'DC combiner' : 'Grid supply'} />
      <p className="text-xs text-muted-foreground">Derived automatically from the design. Editing arrives in a later phase.</p>
    </div>
  )
}

// Click a cable → edit material / size / runs / phase / length (persisted as an override).
function CableInspector({ edge, onClose }: { edge: Edge; onClose: () => void }) {
  const { dispatch } = useDesign()
  const data = (edge.data ?? {}) as CableEdgeData
  const ct = (data.circuitType as string) ?? 'ac'
  const isAc = ct === 'ac'
  const isComms = ct === 'communication'
  const material = (data.cableType as string) || (data.spec?.split(' ')[0] ?? 'CU')
  const size = (data.crossSection as string) || (data.spec?.match(/\d+mm²/)?.[0] ?? '6mm²')
  const runs = Math.max(1, Math.round(Number((data as { runs?: number }).runs) || 1))
  const lengthM = Number(data.lengthM) || 0
  const threePhase = (data.conductors as Record<string, boolean> | undefined)?.l1 === true

  const set = (patch: Record<string, unknown>) => dispatch({ type: 'setEdgeOverride', id: edge.id, patch })
  const setSpec = (mat: string, sz: string) => set({ cableType: mat, crossSection: sz, spec: `${mat} ${sz}` })

  const segments = (data.segments as RouteSeg[] | undefined) ?? []
  const routeTotal = segments.reduce((s, x) => s + (Number(x.lengthM) || 0), 0)
  const setSegs = (next: RouteSeg[]) => set({ segments: next })

  const lbl = 'text-xs text-muted-foreground'
  const field = 'h-9 rounded-md border border-border bg-background px-2 text-sm'

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Cable className="h-3.5 w-3.5" /> Cable
        </span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        <span className="font-medium uppercase text-foreground">{ct}</span> · {conductorSummary(ct, threePhase)}
      </p>

      {isComms ? (
        <p className="text-xs text-muted-foreground">Communication link — protocol editing arrives with the data layer.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className={lbl}>Conductor material</span>
            <select className={field} value={material} onChange={(e) => setSpec(e.target.value, size)}>
              {CABLE_MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={lbl}>Cross-section</span>
            <select className={field} value={size} onChange={(e) => setSpec(material, e.target.value)}>
              {CABLE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={lbl}>Parallel runs (×)</span>
            <input type="number" min={1} step={1} value={runs} className={field}
              onChange={(e) => set({ runs: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
          </label>
          {isAc && (
            <label className="flex flex-col gap-1">
              <span className={lbl}>Phase</span>
              <select className={field} value={threePhase ? '3' : '1'}
                onChange={(e) => set({ conductors: { ...(data.conductors as Record<string, boolean> ?? {}), l1: e.target.value === '3' } })}>
                <option value="1">Single phase · L / N / E</option>
                <option value="3">Three phase · L1 / L2 / L3 / N / E</option>
              </select>
            </label>
          )}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className={lbl}>Measured route</span>
              <button type="button" onClick={() => setSegs([...segments, { id: newSegId(), routeType: SEGMENT_ROUTE_TYPES[0], lengthM: 0 }])}
                className="text-[11px] font-medium text-primary hover:underline">+ Add segment</button>
            </div>
            {segments.length === 0 ? (
              <>
                <input type="number" min={0} step={0.5} value={lengthM || ''} placeholder="0" className={field}
                  onChange={(e) => set({ lengthM: Math.max(0, Number(e.target.value) || 0) })} />
                <span className="text-[11px] text-muted-foreground">Estimated run length (m). Add segments to measure the real route so no cable goes unaccounted.</span>
              </>
            ) : (
              <div className="flex flex-col gap-1.5">
                {segments.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-1.5">
                    <select className="h-8 flex-1 rounded-md border border-border bg-background px-1.5 text-xs" value={s.routeType}
                      onChange={(e) => setSegs(segments.map((x, idx) => (idx === i ? { ...x, routeType: e.target.value } : x)))}>
                      {SEGMENT_ROUTE_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <input type="number" min={0} step={0.5} value={s.lengthM || ''} placeholder="0"
                      className="h-8 w-16 rounded-md border border-border bg-background px-1.5 text-xs text-right"
                      onChange={(e) => setSegs(segments.map((x, idx) => (idx === i ? { ...x, lengthM: Math.max(0, Number(e.target.value) || 0) } : x)))} />
                    <span className="text-[10px] text-muted-foreground">m</span>
                    <button type="button" onClick={() => setSegs(segments.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-border pt-1 text-xs">
                  <span className="text-muted-foreground">Total route</span>
                  <span className="font-semibold text-foreground">{routeTotal.toFixed(1)} m</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <button type="button" onClick={() => dispatch({ type: 'clearEdgeOverride', id: edge.id })}
        className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <RotateCcw className="h-3.5 w-3.5" /> Reset to auto
      </button>
    </div>
  )
}

// Click a busbar / disconnect → edit ports + rating (persisted as a node override).
function ComponentInspector({ node, onClose }: { node: Node; onClose: () => void }) {
  const { dispatch } = useDesign()
  const d = (node.data ?? {}) as { kind?: string; label?: string; product?: string; connections?: number }
  const isBus = d.kind === 'busbar'
  const set = (patch: Record<string, unknown>) => dispatch({ type: 'setNodeOverride', id: node.id, patch })
  const lbl = 'text-xs text-muted-foreground'
  const field = 'h-9 rounded-md border border-border bg-background px-2 text-sm'
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isBus ? 'DC busbar' : 'Disconnect'}</span>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex flex-col gap-2">
        {isBus && (
          <label className="flex flex-col gap-1">
            <span className={lbl}>Connections (ports)</span>
            <input type="number" min={1} max={24} step={1} value={d.connections ?? 1} className={field}
              onChange={(e) => set({ connections: Math.max(1, Math.min(24, Math.round(Number(e.target.value) || 1))) })} />
            <span className="text-[11px] text-muted-foreground">Each port gives a top + bottom tap for a battery or feed.</span>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className={lbl}>Product / rating</span>
          <input type="text" value={d.product ?? ''} placeholder="e.g. 250A DC" className={field}
            onChange={(e) => set({ product: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={lbl}>Label</span>
          <input type="text" value={d.label ?? ''} className={field}
            onChange={(e) => set({ label: e.target.value })} />
        </label>
      </div>
      <button type="button" onClick={() => dispatch({ type: 'clearNodeOverride', id: node.id })}
        className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <RotateCcw className="h-3.5 w-3.5" /> Reset to auto
      </button>
    </div>
  )
}

function CanvasInner({ height = 560 }: { height?: number }) {
  const { design, dispatch, gridSupply } = useDesign()
  const designRef = useRef(design)
  designRef.current = design

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selected, setSelected] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null)
  const [layers, setLayers] = useState<Record<string, boolean>>(ALL_LAYERS_ON)
  const [snap, setSnap] = useState(false)
  const [allowOverlap, setAllowOverlap] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const nodesRef = useRef<Node[]>([])
  nodesRef.current = nodes

  // Hiding a layer drops its components first, then any cable left dangling.
  const shownNodes = useMemo(
    () => nodes.filter((n) => layers[nodeLayer(n)] ?? true),
    [nodes, layers],
  )
  const shownIds = useMemo(() => new Set(shownNodes.map((n) => n.id)), [shownNodes])
  const shownEdges = useMemo(
    () => edges.filter((e) => (layers[edgeLayer(e)] ?? true) && shownIds.has(e.source) && shownIds.has(e.target)),
    [edges, layers, shownIds],
  )

  const sig = useMemo(() => structureSig(design, gridSupply), [design, gridSupply])

  // Rebuild from the store whenever structure changes (positions preserved via layout).
  useEffect(() => {
    const flow = designToFlow(designRef.current, { gridSupply })
    setNodes(flow.nodes)
    setEdges(flow.edges)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    const position = allowOverlap
      ? node.position
      : resolveOverlap(nodesRef.current, node.id, node.position, nodeSize(node))
    dispatch({ type: 'moveNode', id: node.id, position })
  }, [dispatch, allowOverlap])

  // Keyboard: Delete removes the selected node; Esc leaves fullscreen.
  const selectedNodeRef = useRef<string | null>(null)
  selectedNodeRef.current = selected?.kind === 'node' ? selected.id : null
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setFullscreen(false); return }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (selectedNodeRef.current) { dispatch({ type: 'removeNode', id: selectedNodeRef.current }); setSelected(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  const isEmpty = nodes.length === 0

  const flow = (
    <div className="flex-1 relative min-w-0">
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2 py-1 backdrop-blur">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        {CIRCUIT_LAYERS.map((l) => {
          const on = layers[l.key]
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => setLayers((s) => ({ ...s, [l.key]: !s[l.key] }))}
              title={`${on ? 'Hide' : 'Show'} ${l.label}`}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
              style={{
                background: on ? l.color + '22' : 'transparent',
                color: on ? l.color : '#9ca3af',
                border: `1px solid ${on ? l.color : '#e5e7eb'}`,
              }}
            >
              <span className="w-2 h-2 rounded-sm" style={{ background: on ? l.color : '#d1d5db' }} />
              {l.label}
            </button>
          )
        })}
      </div>

      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setAllowOverlap((v) => !v)}
          title={allowOverlap ? 'Overlap allowed — components can stack' : 'Overlap prevented — dropped components nudge apart'}
          className="flex items-center gap-1 rounded-lg border bg-card/90 px-2 py-1 text-[11px] font-medium backdrop-blur"
          style={{ borderColor: allowOverlap ? '#e5e7eb' : '#16a34a', color: allowOverlap ? '#6b7280' : '#16a34a' }}
        >
          <Boxes className="h-3.5 w-3.5" /> {allowOverlap ? 'Overlap' : 'No overlap'}
        </button>
        <button
          type="button"
          onClick={() => setSnap((v) => !v)}
          title={snap ? 'Snapping on — drag aligns to grid' : 'Snap components to grid'}
          className="flex items-center gap-1 rounded-lg border bg-card/90 px-2 py-1 text-[11px] font-medium backdrop-blur"
          style={{ borderColor: snap ? '#16a34a' : '#e5e7eb', color: snap ? '#16a34a' : '#6b7280' }}
        >
          <Magnet className="h-3.5 w-3.5" /> Snap
        </button>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          className="flex items-center gap-1 rounded-lg border border-border bg-card/90 px-2 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur hover:text-foreground"
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {fullscreen ? 'Exit' : 'Full'}
        </button>
      </div>

      {isEmpty && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-center text-sm text-muted-foreground pointer-events-none">
          Add panels or an inverter and the diagram builds itself here.
        </div>
      )}
      <ReactFlow
        nodes={shownNodes}
        edges={shownEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_, node) => setSelected({ kind: 'node', id: node.id })}
        onEdgeClick={(_, edge) => setSelected({ kind: 'edge', id: edge.id })}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => setSelected(null)}
        snapToGrid={snap}
        snapGrid={[20, 20]}
        fitView
        fitViewOptions={{ padding: 0.25, minZoom: 0.35, maxZoom: 1.2 }}
        minZoom={0.2}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#f8fafc' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d1d5db" />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap
          position="bottom-left"
          style={{ border: '1px solid #e5e7eb', borderRadius: 6 }}
          nodeStrokeColor={(n) => NODE_COLORS[n.type ?? ''] ?? '#aaa'}
          nodeColor={(n) => (NODE_COLORS[n.type ?? ''] ?? '#aaa') + '30'}
          maskColor="rgba(248,250,252,0.75)"
        />
      </ReactFlow>
    </div>
  )

  const panel = selected ? (
    <div className="w-72 shrink-0 border-l border-border bg-card p-3 overflow-y-auto">
      {selected.kind === 'edge' ? (
        (() => {
          const edge = edges.find((e) => e.id === selected.id)
          return edge ? <CableInspector edge={edge} onClose={() => setSelected(null)} /> : null
        })()
      ) : (
        (() => {
          const node = nodes.find((nn) => nn.id === selected.id)
          return node?.type === 'busblock'
            ? <ComponentInspector node={node} onClose={() => setSelected(null)} />
            : <NodeInspector nodeId={selected.id} onClose={() => setSelected(null)} />
        })()
      )}
    </div>
  ) : null

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[9999] flex bg-card">
        {flow}
        {panel}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden" style={{ height }}>
      <div className="flex h-full">
        {flow}
        {panel}
      </div>
    </div>
  )
}

export function DesignCanvas({ height }: { height?: number }) {
  return (
    <ReactFlowProvider>
      <CanvasInner height={height} />
    </ReactFlowProvider>
  )
}
