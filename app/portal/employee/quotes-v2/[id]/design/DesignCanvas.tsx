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
import { Trash2, X, PencilLine, Layers } from 'lucide-react'
import { nodeTypes } from '@/components/sld/sld-nodes'
import { edgeTypes } from '@/components/sld/sld-edges'
import {
  designToFlow, nodeIdToRef, panelGroupKwp, type SystemDesign,
} from '@/lib/solar/system-design'
import { useDesign } from './DesignProvider'

const NODE_COLORS: Record<string, string> = {
  solarArray: '#f97316', combiner: '#f97316', inverter: '#1e3a5f',
  battery: '#16a34a', grid: '#7c3aed', dbBoard: '#2563eb', earthing: '#65a30d',
}

// Toggleable circuit layers — filter the diagram to one type of cable at a time.
const CIRCUIT_LAYERS: Array<{ key: string; label: string; color: string }> = [
  { key: 'dc', label: 'DC / PV', color: '#f97316' },
  { key: 'battery', label: 'Battery', color: '#16a34a' },
  { key: 'ac', label: 'AC', color: '#2563eb' },
  { key: 'earth', label: 'Earth', color: '#65a30d' },
]

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

function CanvasInner({ height = 560 }: { height?: number }) {
  const { design, dispatch, gridSupply } = useDesign()
  const designRef = useRef(design)
  designRef.current = design

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [layers, setLayers] = useState<Record<string, boolean>>({ dc: true, battery: true, ac: true, earth: true })

  // Filter edges by circuit layer so you can work with one cable type at a time.
  const shownEdges = useMemo(
    () => edges.filter((e) => layers[(e.data as { circuitType?: string } | undefined)?.circuitType ?? ''] ?? true),
    [edges, layers],
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
    dispatch({ type: 'moveNode', id: node.id, position: node.position })
  }, [dispatch])

  // Keyboard delete for the selected node.
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (selectedRef.current) { dispatch({ type: 'removeNode', id: selectedRef.current }); setSelectedId(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  const isEmpty = nodes.length === 0

  return (
    <div className="rounded-lg border border-border overflow-hidden" style={{ height }}>
      <div className="flex h-full">
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
                  title={`${on ? 'Hide' : 'Show'} ${l.label} cables`}
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
          {isEmpty && (
            <div className="absolute inset-0 z-10 flex items-center justify-center text-center text-sm text-muted-foreground pointer-events-none">
              Add panels or an inverter and the diagram builds itself here.
            </div>
          )}
          <ReactFlow
            nodes={nodes}
            edges={shownEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onNodeDragStop={onNodeDragStop}
            onPaneClick={() => setSelectedId(null)}
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

        {selectedId && (
          <div className="w-64 shrink-0 border-l border-border bg-card p-3 overflow-y-auto">
            <NodeInspector nodeId={selectedId} onClose={() => setSelectedId(null)} />
          </div>
        )}
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
