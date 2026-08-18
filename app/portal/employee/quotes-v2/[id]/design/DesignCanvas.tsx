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
  type Connection,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, X, PencilLine, Layers, Magnet, Maximize2, Minimize2, Cable, RotateCcw, Boxes, GitMerge, Shrink, Download, LayoutGrid } from 'lucide-react'
import { toPng } from 'html-to-image'
import { nodeTypes } from '@/components/sld/sld-nodes'
import { edgeTypes } from '@/components/sld/sld-edges'
import {
  designToFlow, nodeIdToRef, panelGroupKwp, type SystemDesign,
} from '@/lib/solar/system-design'
import { useCircuitTheme, type CircuitLayer } from '@/lib/solar/canvas-theme'
import type { CableEdgeData } from '@/lib/solar/sld-builder'
import { kindFromRouteType, TRUNKING_SIZES } from '@/lib/solar/containment-fill'
import { useDesign } from './DesignProvider'
import { DbFaceplate } from './DbFaceplate'

// Cable editor option lists (mirror the legacy SLD panel).
const CABLE_MATERIALS = ['CU', 'Al', 'H1Z2Z2', 'XLPE', 'Flex (HO5VV-F)']
const CABLE_SIZES = ['1.5mm²', '2.5mm²', '4mm²', '6mm²', '10mm²', '16mm²', '25mm²', '35mm²', '50mm²', '70mm²', '95mm²']
const SEGMENT_ROUTE_TYPES = [
  'In conduit (surface)', 'In conduit (buried)', 'Through ceiling void', 'Down wall (conduit)',
  'Overhead (open)', 'Underground (direct burial)', 'Open trunking', 'Under floor', 'Custom',
]
const TERMINATION_TYPES = ['Direct', 'Lug', 'Pin lug', 'Bootlace', 'MC4', 'Anderson', 'Screw terminal']
/** Field names as the cable inspector shows them, for naming a hand edit. */
const OVERRIDE_LABELS: Record<string, string> = {
  lengthM: 'Length', segments: 'Measured route', spec: 'Cable', cableType: 'Conductor material',
  crossSection: 'Cross-section', runs: 'Parallel runs', conductors: 'Phase', heatShrink: 'Heat shrink',
  terminationFrom: 'From termination', terminationTo: 'To termination',
}
const termNeedsSize = (type: string) => /lug|bootlace/i.test(type)

// A segment can also declare the physical wireway it shares with other cables,
// which is what the SANS fill check (lib/solar/containment-fill.ts) groups on.
type RouteSeg = {
  id: string; routeType: string; lengthM: number
  containment?: string; conduitMm?: number; widthMm?: number; heightMm?: number
}
let segSeq = 0
const newSegId = () => `seg-${Date.now().toString(36)}-${++segSeq}`

function conductorSummary(circuitType: string, threePhase: boolean): string {
  if (circuitType === 'earth') return 'E only'
  if (circuitType === 'dc' || circuitType === 'battery') return '+ / − / E'
  if (circuitType === 'communication') return 'data'
  return threePhase ? 'L1 / L2 / L3 / N / E' : 'L / N / E'
}

// Each layer hides its components and its cables independently — so you can drop
// the PV/DC cabling to read the earthing while the panels & combiner stay put.
// Labels + colours come from the (resolved) circuit theme so the canvas, nodes and
// edges agree — a settings override flows through via useCircuitTheme().
type LayerVis = { components: boolean; cables: boolean }
const CIRCUIT_LAYER_KEYS: CircuitLayer[] = ['pv', 'battery', 'ac', 'earth', 'data']
const ALL_LAYERS_ON: Record<string, LayerVis> = Object.fromEntries(
  CIRCUIT_LAYER_KEYS.map((key) => [key, { components: true, cables: true }]),
)

// Which layer a node belongs to (drives component visibility per layer).
function nodeLayer(node: Node): string {
  switch (node.type) {
    case 'solarArray': case 'combiner': case 'dcIsolator': return 'pv'
    case 'battery': case 'busblock': return 'battery'
    case 'inverter': case 'grid': case 'dbBoard': case 'acIsolator':
    case 'meter': case 'changeover': case 'spd': case 'evCharger': case 'generator': return 'ac'
    case 'earthing': return 'earth'
    case 'comms': case 'meterComms': case 'monitoring': return 'data'
    default: return 'always' // textNote, connector, custom — never hidden by a layer
  }
}

function nodeSize(n: Node): { w: number; h: number } {
  const a = n as { width?: number; height?: number; measured?: { width?: number; height?: number } }
  return { w: a.measured?.width ?? a.width ?? 170, h: a.measured?.height ?? a.height ?? 90 }
}

const OVERLAP_MARGIN = 14

// Does the moved box (at pos) overlap node `o`, allowing for the separation margin?
function boxesOverlap(pos: { x: number; y: number }, size: { w: number; h: number }, o: Node): { ox: number; oy: number } | null {
  const os = nodeSize(o)
  const ax2 = pos.x + size.w, ay2 = pos.y + size.h
  const bx2 = o.position.x + os.w, by2 = o.position.y + os.h
  const ox = Math.min(ax2, bx2) - Math.max(pos.x, o.position.x) + OVERLAP_MARGIN
  const oy = Math.min(ay2, by2) - Math.max(pos.y, o.position.y) + OVERLAP_MARGIN
  return ox > 0 && oy > 0 ? { ox, oy } : null
}

// Knock a dropped node out of every overlap and GUARANTEE a clear spot. We iterate
// to convergence: each pass re-scans ALL others and bumps along the smallest axis of
// the first collision, so a chain of stacked siblings (Battery 5 over 6 over 7…) keeps
// separating until a full clean pass finds zero overlaps. A high cap + clean-pass exit
// means we never leave two boxes stacked; if the cap is somehow hit we fall back to the
// nearest scan-found gap so the result is still non-overlapping.
function resolveOverlap(nodes: Node[], movedId: string, start: { x: number; y: number }, size: { w: number; h: number }): { x: number; y: number } {
  const others = nodes.filter((o) => o.id !== movedId)
  const isClear = (pos: { x: number; y: number }) => others.every((o) => !boxesOverlap(pos, size, o))

  const pos = { ...start }
  const MAX_ITERS = 200
  for (let iter = 0; iter < MAX_ITERS; iter++) {
    let bumped = false
    for (const o of others) {
      const hit = boxesOverlap(pos, size, o)
      if (!hit) continue
      const os = nodeSize(o)
      // Push along the axis of least penetration, away from the other node's centre.
      if (hit.ox < hit.oy) pos.x += (pos.x + size.w / 2 < o.position.x + os.w / 2 ? -hit.ox : hit.ox)
      else pos.y += (pos.y + size.h / 2 < o.position.y + os.h / 2 ? -hit.oy : hit.oy)
      bumped = true
    }
    if (!bumped) return pos // a full clean pass — guaranteed no overlap
  }

  // Fallback (cap hit): spiral outward from the drop point to the nearest clear cell.
  if (isClear(pos)) return pos
  const step = Math.max(size.w, size.h) / 2 + OVERLAP_MARGIN
  for (let ring = 1; ring <= 40; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue // ring perimeter only
        const cand = { x: start.x + dx * step, y: start.y + dy * step }
        if (isClear(cand)) return cand
      }
    }
  }
  return pos
}

// Which layer an edge belongs to (from its circuit type).
function edgeLayer(edge: Edge): string {
  const ct = (edge.data as { circuitType?: string } | undefined)?.circuitType
  switch (ct) {
    case 'communication': return 'data'
    case 'dc': return 'pv'
    case 'ac': return 'ac'
    case 'battery': return 'battery'
    case 'earth': return 'earth'
    default: return 'always'
  }
}

// Infer a sensible circuit type for a hand-drawn cable (item 53) from the handles
// it lands on / the layers its endpoints belong to, so the new cable picks up the
// right colour + layer. Falls back to 'ac'.
function inferUserCircuitType(conn: Connection, nodes: Node[]): CableEdgeData['circuitType'] {
  const handle = `${conn.sourceHandle ?? ''} ${conn.targetHandle ?? ''}`
  if (/earth|bond/i.test(handle)) return 'earth'
  if (/data|comm/i.test(handle)) return 'communication'
  if (/bat/i.test(handle)) return 'battery'
  if (/dc|pv|str|out-\d|dc-out/i.test(handle)) return 'dc'
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const layers = [conn.source, conn.target].map((id) => (id ? nodeLayer(byId.get(id) ?? ({} as Node)) : 'always'))
  if (layers.includes('earth')) return 'earth'
  if (layers.includes('data')) return 'communication'
  if (layers.every((l) => l === 'pv')) return 'dc'
  if (layers.includes('battery')) return 'battery'
  return 'ac'
}

// Only structural fields force a diagram rebuild — positions live in layout and
// are applied by designToFlow, so dragging never fights the rebuild.
function structureSig(d: SystemDesign, gridSupply?: string): string {
  return JSON.stringify({
    g: gridSupply ?? '',
    // Panel distance/jumpers (items 41/42): jumpers drive BOM, distance is metadata.
    p: d.panels.map((p) => [p.id, p.panelCount, p.panelWatts, p.panelModel, p.distanceFromCombinerM, p.jumpers]),
    // Energy shaping profiles (items 37–40) — harmless to key on; only matters if they drive flow.
    ep: JSON.stringify([d.energy.weekly ?? null, d.energy.monthlyProfile ?? null, d.energy.annualProfile ?? null]),
    // DC combiners (items 34/44): per-combiner string assignment + output count +
    // internals, plus the run to the inverter so a new distance redraws the label.
    dc: JSON.stringify(d.dcCombiners.map((c) => [c.id, c.inputStringIds, c.outputs.length, c.distanceToInverterM, (c.components ?? []).map((k) => [k.id, k.productId, k.qty, k.fedFrom])])),
    // Inverter phaseConfig + PV/battery capability toggles (items 50/51) reshape the AC + DC topology.
    i: d.inverters.map((u) => [u.catalogId, u.kw, u.model, u.qty, u.phases, u.phaseConfig, u.acceptsPv, u.acceptsBattery]),
    b: d.batteries.map((b) => [b.catalogId, b.kwh, b.qty, b.model]),
    bk: [d.bank.perBatteryDisconnect, d.bank.busbar, d.bank.mainDisconnect, d.bank.cableSizeMm2, d.bank.cutoffVoltage, d.bank.distanceToInverterM],
    // New bank wiring (items 23/27/28): disconnect product/type, busbar spec, itemised cables.
    bkd: JSON.stringify([d.bank.perBatteryDisconnectChoice ?? null, d.bank.mainDisconnectChoice ?? null, d.bank.busbarSpec ?? null]),
    bkc: JSON.stringify(d.bank.cables ?? []),
    // Monitoring (26) + data links (30) emit nodes/edges; extras' sub-components drive ports.
    mon: JSON.stringify(d.monitoring ?? []),
    dl: JSON.stringify(d.data?.links ?? []),
    xc: JSON.stringify(d.extras.map((x) => [x.id, x.components?.length ?? 0])),
    // AC board device feeds drive the DB outgoing-way (outputCount) count (item 22),
    // and the board's run from the inverter labels the AC cable.
    ac: JSON.stringify(d.acCombiners.map((c) => [c.distanceFromInverterM, c.components.map((k) => [k.id, k.fedFrom])])),
    // Incoming supply run — labels the grid → inverter cable.
    sup: d.supply?.distanceToInverterM,
    e: [d.earthing.spikeCount, d.earthing.spec, d.earthing.distanceFromDbM],
    em: [
      ...d.earthing.conductors.map((c) => `${c.fromId}>${c.toId}:${c.sizeMm2}:${c.kind}`),
      ...d.earthing.electrodes.map((x) => `el:${x.id}:${x.spikeCount}:${x.arrangement}:${x.groupSize}:${x.linkMm2}`),
      ...d.earthing.bars.map((x) => `bar:${x.id}:${x.label}`),
    ],
    // Inspector overrides change cables/ports, so they must force a rebuild too.
    ov: JSON.stringify(d.layout.edgeOverrides ?? {}),
    no: JSON.stringify(d.layout.nodeOverrides ?? {}),
    // User-drawn cables (item 53) emit real edges, so a new/removed one rebuilds the flow.
    ue: JSON.stringify(d.layout.userEdges ?? []),
  })
}

// Inspector chrome — module-scope so React keeps the same component identity across
// renders (declaring these inside NodeInspector remounted the subtree every render).
function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
    </div>
  )
}

function DeleteBtn({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <button
      type="button"
      onClick={onDelete}
      className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

function GoTo({ step, label, onGoToStep }: { step: number; label: string; onGoToStep: (i: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onGoToStep(step)}
      className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:underline"
    >
      <PencilLine className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

function NodeInspector({ nodeId, onClose, onOpenLayout }: { nodeId: string; onClose: () => void; onOpenLayout: (boardId: string, kind: 'ac' | 'dc') => void }) {
  const { design, dispatch, setActiveStep } = useDesign()
  const ref = nodeIdToRef(nodeId)
  if (!ref) return null

  const removeThisNode = () => { dispatch({ type: 'removeNode', id: nodeId }); onClose() }

  if (ref.kind === 'panel') {
    const g = design.panels[ref.index]
    if (!g) return null
    return (
      <div>
        <Header title={`String ${ref.index + 1}`} onClose={onClose} />
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
        <DeleteBtn label="Remove string" onDelete={removeThisNode} />
      </div>
    )
  }

  if (ref.kind === 'inverter') {
    const u = design.inverters[0]
    return (
      <div>
        <Header title="Inverter" onClose={onClose} />
        {u ? (
          <div className="text-sm">
            <p className="font-medium text-foreground">{u.model || 'Inverter'}</p>
            <p className="text-xs text-muted-foreground">{u.kw.toFixed(1)} kW · ×{u.qty} · {u.phases}-phase</p>
          </div>
        ) : <p className="text-xs text-muted-foreground">No inverter.</p>}
        <GoTo step={3} label="Change in Inverter section" onGoToStep={setActiveStep} />
        {u && <DeleteBtn label="Remove inverter" onDelete={removeThisNode} />}
      </div>
    )
  }

  if (ref.kind === 'battery') {
    const b = design.batteries[0]
    return (
      <div>
        <Header title="Battery" onClose={onClose} />
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
        <GoTo step={4} label="Change in Batteries section" onGoToStep={setActiveStep} />
        {b && <DeleteBtn label="Remove battery" onDelete={removeThisNode} />}
      </div>
    )
  }

  if (ref.kind === 'earth') {
    return (
      <div>
        <Header title="Earthing" onClose={onClose} />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Earth spikes</span>
          <input
            type="number" min={0} step={1}
            value={design.earthing.spikeCount ?? ''}
            onChange={(e) => dispatch({ type: 'setEarthing', patch: { spikeCount: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) } })}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
        </label>
        <GoTo step={7} label="Open Earthing section" onGoToStep={setActiveStep} />
      </div>
    )
  }

  // The DB board opens into a physical faceplate (place breakers in real spaces).
  if (ref.kind === 'db') {
    const board = design.acCombiners[0]
    return (
      <div>
        <Header title="Distribution board" onClose={onClose} />
        {board ? (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {board.components.length} device{board.components.length === 1 ? '' : 's'} · {board.ways}-way{(board.rows ?? 1) > 1 ? ` × ${board.rows} rails` : ''}
            </p>
            <button
              type="button"
              onClick={() => onOpenLayout(board.id, 'ac')}
              className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Open board layout
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground">Lay out the breakers in their physical spaces.</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Add an AC board in the AC combiner section first, then lay it out here.</p>
        )}
      </div>
    )
  }

  // DC combiner opens the same physical faceplate as the AC board.
  if (ref.kind === 'combiner') {
    const comb = design.dcCombiners[ref.index]
    const n = comb?.components?.length ?? 0
    return (
      <div>
        <Header title="DC combiner" onClose={onClose} />
        {comb ? (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {n} device{n === 1 ? '' : 's'} · {comb.ways}-way{(comb.rows ?? 1) > 1 ? ` × ${comb.rows} rails` : ''}
            </p>
            <button
              type="button"
              onClick={() => onOpenLayout(comb.id, 'dc')}
              className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Open box layout
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground">Lay out the breakers, fuses &amp; SPD in their physical spaces.</p>
            <GoTo step={2} label="Edit strings &amp; outputs" onGoToStep={setActiveStep} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Add a DC combiner in the DC combiner section first, then lay it out here.</p>
        )}
      </div>
    )
  }

  // grid — informational in Phase 1
  return (
    <div>
      <Header title="Grid supply" onClose={onClose} />
      <p className="text-xs text-muted-foreground">Derived automatically from the design. Editing arrives in a later phase.</p>
    </div>
  )
}

// Click a cable → edit material / size / runs / phase / length / terminations (persisted as an override).
function CableInspector({ edge, fromLabel, toLabel, onClose }: { edge: Edge; fromLabel: string; toLabel: string; onClose: () => void }) {
  const { dispatch } = useDesign()
  // A user-drawn cable (item 53) is removable outright; auto-derived cables only reset.
  const isUserEdge = edge.id.startsWith('user-')
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

  // A hand edit wins over the computed design (right), but silently (wrong) — a
  // 40 m string would keep labelling whatever was typed here. designToFlow parks
  // the computed values on the edge so the override can be named and undone.
  // User-drawn cables have no design behind them, so nothing to flag.
  const overridden = isUserEdge ? [] : ((data.overriddenKeys as string[] | undefined) ?? [])
  const computed = (data.computed as CableEdgeData | undefined)
  const computedLength = Number(computed?.lengthM) || 0
  const clearField = (field: string) => dispatch({ type: 'clearEdgeOverrideField', id: edge.id, field })

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

      {overridden.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            <PencilLine className="h-3 w-3" /> Edited by hand
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            This cable keeps what was typed here, so it no longer follows the design:{' '}
            <span className="font-medium text-foreground">{overridden.map((k) => OVERRIDE_LABELS[k] ?? k).join(', ')}</span>.
          </p>
          {overridden.includes('lengthM') && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              The design computes <span className="font-semibold text-foreground">{computedLength} m</span> for this run.
            </p>
          )}
          <button type="button" onClick={() => dispatch({ type: 'clearEdgeOverride', id: edge.id })}
            className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:underline dark:text-amber-400">
            <RotateCcw className="h-3 w-3" /> Use the computed values
          </button>
        </div>
      )}

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
                {overridden.includes('lengthM') ? (
                  <span className="text-[11px] text-amber-700 dark:text-amber-400">
                    Typed by hand — the design computes {computedLength} m.{' '}
                    <button type="button" onClick={() => clearField('lengthM')} className="font-medium underline">Use {computedLength} m</button>
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Estimated run length (m). Add segments to measure the real route so no cable goes unaccounted.</span>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-1.5">
                {segments.map((s, i) => {
                  const patchSeg = (patch: Partial<RouteSeg>) =>
                    setSegs(segments.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
                  // Only an enclosed run can be over-full, so the fill fields
                  // appear exactly when the route type is a conduit/trunking one.
                  const kind = kindFromRouteType(s.routeType)
                  return (
                    <div key={s.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <select className="h-8 flex-1 rounded-md border border-border bg-background px-1.5 text-xs" value={s.routeType}
                          onChange={(e) => patchSeg({ routeType: e.target.value })}>
                          {SEGMENT_ROUTE_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <input type="number" min={0} step={0.5} value={s.lengthM || ''} placeholder="0"
                          className="h-8 w-16 rounded-md border border-border bg-background px-1.5 text-xs text-right"
                          onChange={(e) => patchSeg({ lengthM: Math.max(0, Number(e.target.value) || 0) })} />
                        <span className="text-[10px] text-muted-foreground">m</span>
                        <button type="button" onClick={() => setSegs(segments.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {kind && (
                        <div className="flex items-center gap-1.5 pl-1">
                          <input
                            type="text" value={s.containment ?? ''} placeholder="Shared run name (e.g. Roof → DB)"
                            title="Give every cable in the same physical pipe the same name — the BOM then checks the fill against SANS."
                            className="h-8 flex-1 rounded-md border border-dashed border-border bg-background px-1.5 text-xs"
                            onChange={(e) => patchSeg({ containment: e.target.value })}
                          />
                          {kind === 'conduit' ? (
                            <select className="h-8 w-[5.5rem] rounded-md border border-border bg-background px-1 text-xs"
                              value={s.conduitMm ?? ''} onChange={(e) => patchSeg({ conduitMm: e.target.value ? Number(e.target.value) : undefined })}>
                              <option value="">Ø …</option>
                              {[20, 25, 32, 40, 50].map((d) => <option key={d} value={d}>{d} mm</option>)}
                            </select>
                          ) : (
                            <select className="h-8 w-[5.5rem] rounded-md border border-border bg-background px-1 text-xs"
                              value={s.widthMm && s.heightMm ? `${s.widthMm}x${s.heightMm}` : ''}
                              onChange={(e) => {
                                if (!e.target.value) { patchSeg({ widthMm: undefined, heightMm: undefined }); return }
                                const [w, h] = e.target.value.split('x').map(Number)
                                patchSeg({ widthMm: w, heightMm: h })
                              }}>
                              <option value="">Size …</option>
                              {TRUNKING_SIZES.map((t) => (
                                <option key={`${t.widthMm}x${t.heightMm}`} value={`${t.widthMm}x${t.heightMm}`}>{t.widthMm}×{t.heightMm}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="flex items-center justify-between border-t border-border pt-1 text-xs">
                  <span className="text-muted-foreground">Total route</span>
                  <span className="font-semibold text-foreground">{routeTotal.toFixed(1)} m</span>
                </div>
              </div>
            )}
          </div>

          {/* Terminations — one per end, sized to the cable */}
          <div className="flex flex-col gap-1.5">
            <span className={lbl}>Terminations</span>
            {([['From', 'terminationFrom', fromLabel], ['To', 'terminationTo', toLabel]] as const).map(([endLabel, key, connectsTo]) => {
              const term = (data[key] as { type?: string; size?: string } | undefined) ?? { type: 'Direct' }
              const ttype = term.type ?? 'Direct'
              return (
                <div key={key} className="rounded-md border border-border p-1.5">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-foreground">{endLabel} end</span>
                    <span className="truncate pl-2 text-muted-foreground">→ {connectsTo}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select className="h-8 flex-1 rounded-md border border-border bg-background px-1.5 text-xs"
                      value={ttype}
                      onChange={(e) => set({ [key]: { type: e.target.value, size: termNeedsSize(e.target.value) ? (term.size || size) : undefined } })}>
                      {TERMINATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {termNeedsSize(ttype) && (
                      <select className="h-8 w-20 rounded-md border border-border bg-background px-1.5 text-xs"
                        value={term.size || size}
                        onChange={(e) => set({ [key]: { type: ttype, size: e.target.value } })}>
                        {CABLE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Heat shrink — sized from the cross-section */}
          <label className="flex items-center justify-between gap-2">
            <span className={lbl}>Heat shrink <span className="text-muted-foreground/80">(sized to {size})</span></span>
            <input type="checkbox" checked={!!data.heatShrink} onChange={(e) => set({ heatShrink: e.target.checked })} className="h-4 w-4 rounded border-border" />
          </label>
        </div>
      )}

      {isUserEdge ? (
        <button type="button" onClick={() => { dispatch({ type: 'removeUserEdge', id: edge.id.slice('user-'.length) }); onClose() }}
          className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" /> Remove cable
        </button>
      ) : (
        <button type="button" onClick={() => dispatch({ type: 'clearEdgeOverride', id: edge.id })}
          className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <RotateCcw className="h-3.5 w-3.5" /> Reset to auto
        </button>
      )}
    </div>
  )
}

// Click a busbar / disconnect → edit ports + rating (persisted as a node override).
// For a disconnect the product/type chosen in the Battery section flows onto
// node.data (designToFlow item 23); we surface it read-only and let a manual
// override take over only once the user edits the field here.
function ComponentInspector({ node, onClose }: { node: Node; onClose: () => void }) {
  const { dispatch } = useDesign()
  const d = (node.data ?? {}) as { kind?: string; label?: string; product?: string | null; connections?: number; disconnectType?: string }
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
        {!isBus && d.disconnectType && (
          <p className="text-[11px] text-muted-foreground">From the Batteries section: <span className="font-medium text-foreground capitalize">{d.disconnectType.replace(/-/g, ' ')}</span>. Override below to set it manually.</p>
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

function CanvasInner({ height = 560, fill }: { height?: number; fill?: boolean }) {
  const { design, dispatch, gridSupply } = useDesign()
  // Latest design, kept off the rebuild effect's dep list so structural changes alone
  // trigger it. Synced in an effect (declared first, so it lands before the rebuild
  // effect below reads it) rather than during render.
  const designRef = useRef(design)
  useEffect(() => { designRef.current = design }, [design])

  // Resolved (settings-overridable) circuit colours; defaults outside a provider.
  const { theme, nodeColor } = useCircuitTheme()
  // Minimap node colours come from the resolved theme; unmapped auxiliary types fall
  // back to the caller's neutral grey.
  const nodeStroke = (type: string) => nodeColor[type] ?? '#aaa'
  const CIRCUIT_LAYERS: Array<{ key: CircuitLayer; label: string; color: string }> =
    CIRCUIT_LAYER_KEYS.map((key) => ({ key, label: theme[key].label, color: theme[key].stroke }))

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selected, setSelected] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null)
  const [layers, setLayers] = useState<Record<string, LayerVis>>(ALL_LAYERS_ON)
  const [snap, setSnap] = useState(true) // default ON so dropped rows line up (item 17)
  const [allowOverlap, setAllowOverlap] = useState(false)
  const [showTerminations, setShowTerminations] = useState(false) // off by default to reduce clutter (item 21)
  const [fullscreen, setFullscreen] = useState(false)
  // The physical faceplate overlay — opened from the AC-board OR the DC-combiner node.
  const [layoutBoardId, setLayoutBoardId] = useState<{ id: string; kind: 'ac' | 'dc' } | null>(null)
  // Level of detail (item: readability) — Simple collapses the battery bank + DB
  // internals to summaries; Detailed shows every unit + disconnect + device.
  const [detail, setDetail] = useState<'simple' | 'detailed'>('simple')
  const canvasRef = useRef<HTMLDivElement>(null)
  // Latest nodes for the drag/connect handlers (read in events only, never in render),
  // so those callbacks stay stable while nodes churn on every drag frame.
  const nodesRef = useRef<Node[]>([])
  useEffect(() => { nodesRef.current = nodes }, [nodes])

  // Hiding a layer's components drops its nodes; hiding its cables drops the edges.
  // A cable also disappears once either end is hidden, so nothing dangles.
  const shownNodes = useMemo(
    () => nodes.filter((n) => layers[nodeLayer(n)]?.components ?? true),
    [nodes, layers],
  )
  const shownIds = useMemo(() => new Set(shownNodes.map((n) => n.id)), [shownNodes])
  const shownEdges = useMemo(
    () => edges
      .filter((e) =>
        (layers[edgeLayer(e)]?.cables ?? true) && shownIds.has(e.source) && shownIds.has(e.target),
      )
      // Item 21: flag termination-label rendering on each edge for the edge renderer.
      // Default off (showTerminations=false) keeps the diagram uncluttered.
      .map((e) => (((e.data as { showTerminations?: boolean } | undefined)?.showTerminations ?? false) === showTerminations
        ? e
        : { ...e, data: { ...(e.data ?? {}), showTerminations } })),
    [edges, layers, shownIds, showTerminations],
  )

  // Only offer a sub-toggle when that layer actually has components / cables present.
  const layerPresence = useMemo(() => {
    const comp: Record<string, boolean> = {}
    const cab: Record<string, boolean> = {}
    for (const n of nodes) { const k = nodeLayer(n); if (k !== 'always') comp[k] = true }
    for (const e of edges) { const k = edgeLayer(e); if (k !== 'always') cab[k] = true }
    return { comp, cab }
  }, [nodes, edges])

  const sig = useMemo(() => structureSig(design, gridSupply), [design, gridSupply])

  // Rebuild from the store whenever structure changes (positions preserved via layout).
  useEffect(() => {
    const flow = designToFlow(designRef.current, { gridSupply, detail })
    setNodes(flow.nodes)
    setEdges(flow.edges)
    // Drop a stale selection whose node/edge no longer exists after the rebuild
    // (e.g. toggling to Simple while a detail-only battery node was selected).
    setSelected((s) => {
      if (!s) return s
      const present = s.kind === 'node' ? flow.nodes.some((n) => n.id === s.id) : flow.edges.some((e) => e.id === s.id)
      return present ? s : null
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, detail])

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    const position = allowOverlap
      ? node.position
      : resolveOverlap(nodesRef.current, node.id, node.position, nodeSize(node))
    dispatch({ type: 'moveNode', id: node.id, position })
  }, [dispatch, allowOverlap])

  // Item 53: dragging from one handle to another creates a user-drawn cable. We
  // persist it through the store (addUserEdge) and let designToFlow re-emit it as
  // a real `cable` edge — so it gains overrides, layer toggles and a BOM line.
  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return
    dispatch({
      type: 'addUserEdge',
      edge: {
        source: conn.source,
        target: conn.target,
        sourceHandle: conn.sourceHandle ?? undefined,
        targetHandle: conn.targetHandle ?? undefined,
        circuitType: inferUserCircuitType(conn, nodesRef.current),
      },
    })
  }, [dispatch])

  // Item 53: deleting a cable only removes user-drawn ones (`user-<id>`); auto-derived
  // edges have no stored source, so they just re-appear on the next rebuild.
  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const e of deleted) {
      if (e.id.startsWith('user-')) dispatch({ type: 'removeUserEdge', id: e.id.slice('user-'.length) })
    }
  }, [dispatch])

  // Keyboard: Delete removes the selected node; Esc leaves fullscreen.
  const selectedNodeRef = useRef<string | null>(null)
  useEffect(() => { selectedNodeRef.current = selected?.kind === 'node' ? selected.id : null }, [selected])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setFullscreen(false); return }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      // Don't delete a canvas node while a modal/overlay (e.g. the walkthrough) is open.
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (selectedNodeRef.current) { dispatch({ type: 'removeNode', id: selectedNodeRef.current }); setSelected(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  const isEmpty = nodes.length === 0

  // PNG export (ported from the retired legacy SLD): hide the toolbars, snapshot
  // the canvas at 2× and download — an SLD you can hand to a client / CoC pack.
  const exportPng = useCallback(() => {
    const el = canvasRef.current
    if (!el) return
    const hidden = Array.from(el.querySelectorAll<HTMLElement>('[data-export-hide]'))
    hidden.forEach((h) => { h.style.visibility = 'hidden' })
    toPng(el, { backgroundColor: '#f8fafc', pixelRatio: 2 })
      .then((dataUrl) => {
        const a = document.createElement('a')
        a.download = `SLD-${new Date().toISOString().slice(0, 10)}.png`
        a.href = dataUrl
        a.click()
      })
      .catch((err) => console.error('SLD export failed:', err))
      .finally(() => hidden.forEach((h) => { h.style.visibility = '' }))
  }, [])

  const flow = (
    <div ref={canvasRef} className="flex-1 relative min-w-0">
      <div data-export-hide className="absolute top-2 left-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2 py-1 backdrop-blur">
        <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {CIRCUIT_LAYERS.map((l) => {
          const vis = layers[l.key] ?? { components: true, cables: true }
          const hasC = layerPresence.comp[l.key]
          const hasE = layerPresence.cab[l.key]
          if (!hasC && !hasE) return null
          const anyOn = (hasC && vis.components) || (hasE && vis.cables)
          const setSub = (sub: 'components' | 'cables') =>
            setLayers((s) => ({ ...s, [l.key]: { ...vis, [sub]: !vis[sub] } }))
          const toggleAll = () => {
            const next = !anyOn
            setLayers((s) => ({ ...s, [l.key]: {
              components: hasC ? next : vis.components,
              cables: hasE ? next : vis.cables,
            } }))
          }
          return (
            <div
              key={l.key}
              className="flex items-center gap-1 rounded-md border px-1.5 py-0.5"
              style={{ borderColor: anyOn ? l.color : '#e5e7eb', background: anyOn ? l.color + '18' : 'transparent' }}
            >
              <button
                type="button"
                onClick={toggleAll}
                className="text-[11px] font-medium leading-none"
                style={{ color: anyOn ? l.color : '#9ca3af' }}
                title={`${anyOn ? 'Hide' : 'Show'} all ${l.label}`}
              >
                {l.label}
              </button>
              {hasC && (
                <button
                  type="button"
                  onClick={() => setSub('components')}
                  className="flex items-center leading-none"
                  style={{ color: vis.components ? l.color : '#cbd5e1' }}
                  title={`${vis.components ? 'Hide' : 'Show'} ${l.label} components`}
                >
                  <Boxes className="h-3 w-3" />
                </button>
              )}
              {hasE && (
                <button
                  type="button"
                  onClick={() => setSub('cables')}
                  className="flex items-center leading-none"
                  style={{ color: vis.cables ? l.color : '#cbd5e1' }}
                  title={`${vis.cables ? 'Hide' : 'Show'} ${l.label} cables`}
                >
                  <Cable className="h-3 w-3" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div data-export-hide className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={exportPng}
          title="Download the diagram as a PNG (for the customer / CoC pack)"
          className="flex items-center gap-1 rounded-lg border border-border bg-card/90 px-2 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" /> PNG
        </button>
        <button
          type="button"
          onClick={() => setDetail((v) => (v === 'simple' ? 'detailed' : 'simple'))}
          title={detail === 'simple'
            ? 'Simplified view — battery bank & board shown as summaries. Click for full wiring detail.'
            : 'Full detail — every battery, disconnect, busbar & board device. Click to simplify.'}
          className="flex items-center gap-1 rounded-lg border bg-card/90 px-2 py-1 text-[11px] font-medium backdrop-blur"
          style={{ borderColor: detail === 'simple' ? '#2563eb' : '#e5e7eb', color: detail === 'simple' ? '#2563eb' : '#6b7280' }}
        >
          <Shrink className="h-3.5 w-3.5" /> {detail === 'simple' ? 'Simple' : 'Detailed'}
        </button>
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
          onClick={() => setShowTerminations((v) => !v)}
          title={showTerminations ? 'Termination labels shown on cables' : 'Show termination labels on cables'}
          className="flex items-center gap-1 rounded-lg border bg-card/90 px-2 py-1 text-[11px] font-medium backdrop-blur"
          style={{ borderColor: showTerminations ? '#16a34a' : '#e5e7eb', color: showTerminations ? '#16a34a' : '#6b7280' }}
        >
          <GitMerge className="h-3.5 w-3.5" /> Terminations
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
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        nodesConnectable
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'cable' }}
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
          nodeStrokeColor={(n) => nodeStroke(n.type ?? '')}
          nodeColor={(n) => nodeStroke(n.type ?? '') + '30'}
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
          if (!edge) return null
          const labelOf = (id: string) => ((nodes.find((n) => n.id === id)?.data as { label?: string } | undefined)?.label) ?? id
          return <CableInspector edge={edge} fromLabel={labelOf(edge.source)} toLabel={labelOf(edge.target)} onClose={() => setSelected(null)} />
        })()
      ) : (
        (() => {
          const node = nodes.find((nn) => nn.id === selected.id)
          return node?.type === 'busblock'
            ? <ComponentInspector node={node} onClose={() => setSelected(null)} />
            : <NodeInspector nodeId={selected.id} onClose={() => setSelected(null)} onOpenLayout={(id, kind) => setLayoutBoardId({ id, kind })} />
        })()
      )}
    </div>
  ) : null

  const boardLayout = layoutBoardId
    ? <DbFaceplate combinerId={layoutBoardId.id} boardKind={layoutBoardId.kind} onClose={() => setLayoutBoardId(null)} />
    : null

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[9999] flex bg-card">
        {flow}
        {panel}
        {boardLayout}
      </div>
    )
  }

  return (
    <div
      className={`rounded-lg border border-border overflow-hidden${fill ? ' h-full' : ''}`}
      style={fill ? undefined : { height }}
    >
      <div className="flex h-full">
        {flow}
        {panel}
      </div>
      {boardLayout}
    </div>
  )
}

export function DesignCanvas({ height, fill }: { height?: number; fill?: boolean }) {
  return (
    <ReactFlowProvider>
      <CanvasInner height={height} fill={fill} />
    </ReactFlowProvider>
  )
}
