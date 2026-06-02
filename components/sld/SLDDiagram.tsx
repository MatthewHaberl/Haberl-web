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
  type Node,
  type Edge,
} from '@xyflow/react'
import { useEffect, useState, useCallback } from 'react'
import { Maximize2, X } from 'lucide-react'
import type { AnyQuoteData, QuoteData } from '@/lib/solar/render-quote'
import { buildSLDFromQuote, buildEdgeLabel, getDefaultNodeData, type CableEdgeData } from '@/lib/solar/sld-builder'
import { nodeTypes, CLR } from './sld-nodes'
import { edgeTypes } from './sld-edges'
import { SLDPanel } from './SLDPanel'

interface Props {
  quoteData: AnyQuoteData
  gridSupply?: string
  height?: number
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

const PANEL_W = 272  // px — config panel width

function DiagramInner({ quoteData, gridSupply, height = 680 }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  // Resolve multi-option quote to a single QuoteData
  const quote: QuoteData = 'options' in quoteData
    ? ((quoteData.options.find((o) => o.tier === 'recommended') ?? quoteData.options[0]) as QuoteData)
    : (quoteData as QuoteData)

  const { nodes: initNodes, edges: initEdges } = buildSLDFromQuote(quote, gridSupply)

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)

  // Re-sync when quote data changes (new JSON pasted)
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
    quote.dcCombinerConfig, gridSupply,
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
      id,
      type,
      position: { x: 200 + Math.random() * 300, y: 200 + Math.random() * 300 },
      data,
    }
    setNodes((nds) => [...nds, newNode])
    setSelectedNodeId(id)
    setSelectedEdgeId(null)
  }, [setNodes])

  // ── Canvas ────────────────────────────────────────────────────────────────────
  const canvasH = isFullscreen ? '100%' : height

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
      fitView
      fitViewOptions={{ padding: 0.25, minZoom: 0.35, maxZoom: 1.2 }}
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
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
  )

  // ── Fullscreen ────────────────────────────────────────────────────────────────
  if (isFullscreen) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
        {/* Fullscreen header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', background: '#1e3a5f', color: '#fff', flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            Wiring Diagram — {quote.inverterModel || 'Solar System'}
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

        {/* Canvas + panel row */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ flex: 1, position: 'relative', touchAction: 'none' }}>
            {flow}
          </div>
          <div style={{
            width: PANEL_W, borderLeft: '1px solid #e5e7eb',
            background: '#fff', overflowY: 'auto', flexShrink: 0,
          }}>
            <SLDPanel
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              onUpdateNode={updateNodeData}
              onUpdateEdge={updateEdgeData}
              onDeleteNode={deleteNode}
              onDeleteEdge={deleteEdge}
              onAddNode={addNode}
              onDeselect={handlePaneClick}
            />
          </div>
        </div>
      </div>
    )
  }

  // ── Normal mode ───────────────────────────────────────────────────────────────
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', height: canvasH }}>

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative', touchAction: 'none', minWidth: 0 }}>
          {/* Fullscreen button */}
          <button
            onClick={() => setIsFullscreen(true)}
            style={{
              position: 'absolute', top: 10, left: 10, zIndex: 10,
              display: 'flex', alignItems: 'center', gap: 4,
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6,
              padding: '4px 8px', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, color: '#374151',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            }}
          >
            <Maximize2 size={12} /> Fullscreen
          </button>
          {flow}
        </div>

        {/* Config panel */}
        <div style={{
          width: PANEL_W, borderLeft: '1px solid #e5e7eb',
          background: '#fff', overflowY: 'auto', flexShrink: 0,
          display: 'flex', flexDirection: 'column',
        }}>
          <SLDPanel
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onUpdateNode={updateNodeData}
            onUpdateEdge={updateEdgeData}
            onDeleteNode={deleteNode}
            onDeleteEdge={deleteEdge}
            onAddNode={addNode}
            onDeselect={handlePaneClick}
          />
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
