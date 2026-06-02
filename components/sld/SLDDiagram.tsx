'use client'

import '@xyflow/react/dist/style.css'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  reconnectEdge,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Maximize2, X, Link2, RefreshCw, RotateCcw, Download, Grid3X3 } from 'lucide-react'
import { toPng } from 'html-to-image'
import type { AnyQuoteData, QuoteData, MultiOptionQuoteData } from '@/lib/solar/render-quote'
import {
  buildSLDFromQuote,
  buildEdgeLabel,
  getDefaultNodeData,
  sldNodesToQuoteData,
  type CableEdgeData,
} from '@/lib/solar/sld-builder'
import { nodeTypes, CLR } from './sld-nodes'
import { edgeTypes } from './sld-edges'
import { SLDPanel } from './SLDPanel'

interface Props {
  quoteData: AnyQuoteData
  gridSupply?: string
  height?: number
  onSldChange?: (updated: QuoteData) => void
}

const NODE_COLORS: Record<string, string> = {
  solarArray: CLR.dc,
  combiner:   CLR.dc,
  inverter:   CLR.inv,
  battery:    CLR.bat,
  grid:       CLR.grid,
  dbBoard:    CLR.ac,
  earthing:   CLR.earth,
}

const PANEL_W = 272

const BTN_BASE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6,
  padding: '4px 8px', cursor: 'pointer',
  fontSize: 11, fontWeight: 600, color: '#374151',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  whiteSpace: 'nowrap',
}

function inferCircuitType(
  srcType: string,
  tgtType: string,
): CableEdgeData['circuitType'] {
  if (srcType === 'earthing' || tgtType === 'earthing') return 'earth'
  if (['solarArray', 'combiner', 'dcIsolator', 'spd'].includes(srcType)) return 'dc'
  if (srcType === 'battery' || tgtType === 'battery') return 'battery'
  return 'ac'
}

function specForCircuit(ct: CableEdgeData['circuitType']): string {
  if (ct === 'dc')      return 'H1Z2Z2 6mm²'
  if (ct === 'battery') return 'CU 25mm²'
  if (ct === 'earth')   return 'CU GY 10mm²'
  return 'CU 6mm²'
}

// ── Inner component (needs ReactFlowProvider above) ───────────────────────────

function DiagramInner({ quoteData, gridSupply, height = 680, onSldChange }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [connectMode, setConnectMode] = useState(false)
  const [snapGrid, setSnapGrid] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Multi-option support
  const isMulti = 'options' in quoteData
  const tiers = isMulti ? (quoteData as MultiOptionQuoteData).options : []
  const [selectedTierIdx, setSelectedTierIdx] = useState(() => {
    if (!isMulti) return 0
    const recIdx = (quoteData as MultiOptionQuoteData).options.findIndex(
      (o) => o.tier === 'recommended',
    )
    return recIdx >= 0 ? recIdx : 0
  })

  const quote: QuoteData = isMulti
    ? (tiers[selectedTierIdx] as QuoteData)
    : (quoteData as QuoteData)

  const { nodes: initNodes, edges: initEdges } = buildSLDFromQuote(quote, gridSupply)

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)

  // Re-sync when quote data or tier changes
  useEffect(() => {
    const { nodes: n, edges: e } = buildSLDFromQuote(quote, gridSupply)
    setNodes(n)
    setEdges(e)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    quote.inverterModel, quote.inverterKw, quote.batteryModel,
    quote.batteryQty, quote.panelCount, quote.totalKwp,
    quote.dcCombinerConfig, gridSupply, selectedTierIdx,
  ])

  // ── Selection ─────────────────────────────────────────────────────────────────
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
  }, [])

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id)
    setSelectedNodeId(null)
  }, [])

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [])

  // ── CRUD ──────────────────────────────────────────────────────────────────────
  const updateNodeData = useCallback((id: string, patch: Record<string, unknown>) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
  }, [setNodes])

  const updateEdgeData = useCallback((id: string, patch: Record<string, unknown>) => {
    setEdges((eds) => eds.map((e) => {
      if (e.id !== id) return e
      const newData = { ...(e.data ?? {}), ...patch } as CableEdgeData
      return { ...e, data: newData, label: buildEdgeLabel(newData) }
    }))
  }, [setEdges])

  const deleteNode = useCallback((id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    setSelectedNodeId(null)
  }, [setNodes, setEdges])

  const deleteEdge = useCallback((id: string) => {
    setEdges((eds) => eds.filter((e) => e.id !== id))
    setSelectedEdgeId(null)
  }, [setEdges])

  const addNode = useCallback((type: string) => {
    const id = `${type}-${Date.now()}`
    const data = getDefaultNodeData(type)
    const newNode: Node = {
      id, type,
      position: { x: 200 + Math.random() * 300, y: 200 + Math.random() * 300 },
      data,
    }
    setNodes((nds) => [...nds, newNode])
    setSelectedNodeId(id)
    setSelectedEdgeId(null)
  }, [setNodes])

  // ── Connect (draw new cable between two nodes) ────────────────────────────────
  const onConnect = useCallback((connection: Connection) => {
    const srcType = nodes.find((n) => n.id === connection.source)?.type ?? ''
    const tgtType = nodes.find((n) => n.id === connection.target)?.type ?? ''
    const circuitType = inferCircuitType(srcType, tgtType)
    const spec = specForCircuit(circuitType)
    const cableData: CableEdgeData = {
      spec,
      lengthM: 5,
      circuitType,
      cableType: spec.split(' ')[0],
      crossSection: spec.match(/\d+mm²/)?.[0] ?? '6mm²',
    }
    const newEdgeId = `e-${connection.source}-${connection.target}-${Date.now()}`
    setEdges((eds) => addEdge({
      ...connection,
      id: newEdgeId,
      type: 'cable',
      data: cableData,
      label: buildEdgeLabel(cableData),
    }, eds))
    setSelectedEdgeId(newEdgeId)
    setSelectedNodeId(null)
  }, [nodes, setEdges])

  // ── Edge reconnect (drag an endpoint to a different handle) ───────────────────
  const onReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds))
  }, [setEdges])

  // ── Keyboard delete ───────────────────────────────────────────────────────────
  const selectedNodeRef = useRef(selectedNodeId)
  const selectedEdgeRef = useRef(selectedEdgeId)
  selectedNodeRef.current = selectedNodeId
  selectedEdgeRef.current = selectedEdgeId

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (selectedNodeRef.current) deleteNode(selectedNodeRef.current)
      else if (selectedEdgeRef.current) deleteEdge(selectedEdgeRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteNode, deleteEdge])

  // ── Reset diagram to quote ────────────────────────────────────────────────────
  const resetDiagram = useCallback(() => {
    const { nodes: n, edges: e } = buildSLDFromQuote(quote, gridSupply)
    setNodes(n)
    setEdges(e)
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [quote, gridSupply, setNodes, setEdges])

  // ── Export PNG ────────────────────────────────────────────────────────────────
  const exportPng = useCallback(() => {
    const viewport = canvasRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!viewport) return
    toPng(viewport, { backgroundColor: '#f8fafc', pixelRatio: 2 })
      .then((dataUrl) => {
        const a = document.createElement('a')
        a.download = `SLD-${(quote.inverterModel || 'diagram').replace(/\s+/g, '-')}.png`
        a.href = dataUrl
        a.click()
      })
      .catch((err) => console.error('SLD export failed:', err))
  }, [quote.inverterModel])

  // ── SLD → Quote sync ─────────────────────────────────────────────────────────
  const syncToQuote = useCallback(() => {
    if (!onSldChange) return
    const patch = sldNodesToQuoteData(nodes)
    onSldChange({ ...quote, ...patch } as QuoteData)
  }, [nodes, quote, onSldChange])

  // ── Canvas toolbar ────────────────────────────────────────────────────────────
  const toolbar = (
    <div style={{
      position: 'absolute', top: 10, left: 10, zIndex: 10,
      display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
    }}>
      {!isFullscreen && (
        <button onClick={() => setIsFullscreen(true)} style={BTN_BASE}>
          <Maximize2 size={12} /> Fullscreen
        </button>
      )}

      {/* Connect mode toggle */}
      <button
        onClick={() => setConnectMode((v) => !v)}
        title={connectMode ? 'Click a handle to start a cable, click another handle to finish' : 'Enter connect mode to draw cables between components'}
        style={{
          ...BTN_BASE,
          background: connectMode ? '#2563eb' : '#fff',
          color: connectMode ? '#fff' : '#374151',
          borderColor: connectMode ? '#2563eb' : '#e5e7eb',
        }}
      >
        <Link2 size={12} />
        {connectMode ? 'Connecting…' : 'Connect'}
      </button>

      {/* Tier selector — only shown for multi-option quotes */}
      {isMulti && tiers.length > 1 && (
        <select
          value={selectedTierIdx}
          onChange={(e) => setSelectedTierIdx(Number(e.target.value))}
          style={{ ...BTN_BASE, padding: '0 8px', height: 26, appearance: 'auto' }}
        >
          {tiers.map((o, i) => (
            <option key={i} value={i}>
              {o.tierLabel ?? o.tier ?? `Option ${i + 1}`}
            </option>
          ))}
        </select>
      )}

      {/* Sync to Quote — only shown when parent provides onSldChange */}
      {onSldChange && (
        <button
          onClick={syncToQuote}
          title="Push node changes (model, specs) back to the quote"
          style={BTN_BASE}
        >
          <RefreshCw size={12} /> Sync to Quote
        </button>
      )}

      {/* Reset diagram to match the current quote */}
      <button
        onClick={resetDiagram}
        title="Discard diagram edits and rebuild from current quote data"
        style={BTN_BASE}
      >
        <RotateCcw size={12} /> Reset
      </button>

      {/* Snap to grid toggle */}
      <button
        onClick={() => setSnapGrid((v) => !v)}
        title="Snap nodes to a 20px grid"
        style={{
          ...BTN_BASE,
          background: snapGrid ? '#f0fdf4' : '#fff',
          borderColor: snapGrid ? '#86efac' : '#e5e7eb',
          color: snapGrid ? '#16a34a' : '#374151',
        }}
      >
        <Grid3X3 size={12} />
      </button>

      {/* Export as PNG */}
      <button
        onClick={exportPng}
        title="Download the diagram as a PNG image"
        style={BTN_BASE}
      >
        <Download size={12} /> PNG
      </button>
    </div>
  )

  const flow = (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={handleNodeClick}
      onEdgeClick={handleEdgeClick}
      onPaneClick={handlePaneClick}
      onConnect={onConnect}
      onReconnect={onReconnect}
      fitView
      fitViewOptions={{ padding: 0.25, minZoom: 0.35, maxZoom: 1.2 }}
      nodesDraggable={!connectMode}
      nodesConnectable={connectMode}
      edgesReconnectable
      elementsSelectable
      snapToGrid={snapGrid}
      snapGrid={[20, 20]}
      minZoom={0.2}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
      style={{ background: '#f8fafc', cursor: connectMode ? 'crosshair' : 'default' }}
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
  )

  const panelProps = {
    selectedNode,
    selectedEdge,
    onUpdateNode: updateNodeData,
    onUpdateEdge: updateEdgeData,
    onDeleteNode: deleteNode,
    onDeleteEdge: deleteEdge,
    onAddNode: addNode,
    onDeselect: handlePaneClick,
    connectMode,
    onToggleConnect: () => setConnectMode((v) => !v),
  }

  // ── Fullscreen ────────────────────────────────────────────────────────────────
  if (isFullscreen) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', background: '#1e3a5f', color: '#fff', flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            Wiring Diagram
            {isMulti && tiers[selectedTierIdx] && ` — ${tiers[selectedTierIdx].tierLabel ?? tiers[selectedTierIdx].tier ?? ''}`}
            {!isMulti && quote.inverterModel ? ` — ${quote.inverterModel}` : ''}
          </span>
          <button
            onClick={() => setIsFullscreen(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6,
              padding: '4px 10px', cursor: 'pointer', color: '#fff', fontSize: 12,
            }}
          >
            <X size={13} /> Close
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div ref={canvasRef} style={{ flex: 1, position: 'relative', touchAction: 'none' }}>
            {toolbar}
            {flow}
          </div>
          <div style={{
            width: PANEL_W, borderLeft: '1px solid #e5e7eb',
            background: '#fff', overflowY: 'auto', flexShrink: 0,
          }}>
            <SLDPanel {...panelProps} />
          </div>
        </div>
      </div>
    )
  }

  // ── Normal mode ───────────────────────────────────────────────────────────────
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', height: height }}>
        <div ref={canvasRef} style={{ flex: 1, position: 'relative', touchAction: 'none', minWidth: 0 }}>
          {toolbar}
          {flow}
        </div>
        <div style={{
          width: PANEL_W, borderLeft: '1px solid #e5e7eb',
          background: '#fff', overflowY: 'auto', flexShrink: 0,
          display: 'flex', flexDirection: 'column',
        }}>
          <SLDPanel {...panelProps} />
        </div>
      </div>
    </div>
  )
}

export function SLDDiagram(props: Props) {
  return (
    <ReactFlowProvider>
      <DiagramInner {...props} />
    </ReactFlowProvider>
  )
}
