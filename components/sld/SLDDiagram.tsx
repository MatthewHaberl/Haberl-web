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
} from '@xyflow/react'
import { useEffect, useState } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import type { AnyQuoteData, QuoteData } from '@/lib/solar/render-quote'
import { buildSLDFromQuote } from '@/lib/solar/sld-builder'
import { nodeTypes, CLR } from './sld-nodes'
import { edgeTypes } from './sld-edges'

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

function DiagramInner({ quoteData, gridSupply, height = 680 }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  // For multi-option quotes use the recommended option
  const quote: QuoteData =
    'options' in quoteData
      ? ((quoteData.options.find((o) => o.tier === 'recommended') ??
          quoteData.options[0]) as QuoteData)
      : (quoteData as QuoteData)

  const { nodes: initNodes, edges: initEdges } = buildSLDFromQuote(quote, gridSupply)

  // useNodesState / useEdgesState lets React Flow own the positions internally
  // so dragging actually moves nodes instead of snapping back
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges)

  // Re-sync when the underlying quote changes (new JSON pasted)
  useEffect(() => {
    const { nodes: n, edges: e } = buildSLDFromQuote(quote, gridSupply)
    setNodes(n)
    setEdges(e)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    quote.inverterModel,
    quote.inverterKw,
    quote.batteryModel,
    quote.batteryQty,
    quote.panelCount,
    quote.totalKwp,
    quote.dcCombinerConfig,
    gridSupply,
  ])

  const diagramH = isFullscreen ? '100%' : height

  const canvas = (
    <div
      style={{
        height: diagramH,
        background: '#f8fafc',
        overflow: 'hidden',
        position: 'relative',
        touchAction: 'none',
      }}
    >
      {/* Fullscreen toggle */}
      <button
        onClick={() => setIsFullscreen((s) => !s)}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 10,
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          padding: '4px 8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 11,
          fontWeight: 600,
          color: '#374151',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
      >
        {isFullscreen
          ? <><Minimize2 size={12} /> Exit fullscreen</>
          : <><Maximize2 size={12} /> Fullscreen</>}
      </button>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, minZoom: 0.4, maxZoom: 1.2 }}
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
    </div>
  )

  if (isFullscreen) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Fullscreen header bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            background: '#1e3a5f',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            Wiring Diagram — {quote.inverterModel || 'Solar System'} · {quote.totalKwp || ''}
          </span>
          <button
            onClick={() => setIsFullscreen(false)}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
            }}
          >
            <X size={13} /> Close
          </button>
        </div>
        <div style={{ flex: 1, position: 'relative', touchAction: 'none' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            minZoom={0.2}
            maxZoom={3}
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
            />
          </ReactFlow>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {canvas}
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
