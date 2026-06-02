'use client'

import '@xyflow/react/dist/style.css'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
} from '@xyflow/react'
import { useMemo } from 'react'
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

function Diagram({ quoteData, gridSupply, height = 700 }: Props) {
  // For multi-option quotes use the recommended option
  const quote: QuoteData = useMemo(() => {
    if ('options' in quoteData) {
      return (
        (quoteData.options.find((o) => o.tier === 'recommended') ??
          quoteData.options[0]) as QuoteData
      )
    }
    return quoteData as QuoteData
  }, [quoteData])

  const { nodes, edges } = useMemo(
    () => buildSLDFromQuote(quote, gridSupply),
    // Rebuild only when core specs change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      quote.inverterModel,
      quote.inverterKw,
      quote.batteryModel,
      quote.batteryQty,
      quote.panelCount,
      quote.totalKwp,
      quote.dcCombinerConfig,
      gridSupply,
    ],
  )

  return (
    <div
      style={{
        height,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#f8fafc',
        overflow: 'hidden',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, minZoom: 0.4, maxZoom: 1.2 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.25}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d1d5db" />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap
          position="bottom-left"
          style={{ border: '1px solid #e5e7eb', borderRadius: 6 }}
          nodeStrokeColor={(n) => NODE_COLORS[n.type ?? ''] ?? '#aaa'}
          nodeColor={(n) => (NODE_COLORS[n.type ?? ''] ?? '#aaa') + '30'}
          maskColor="rgba(248,250,252,0.7)"
        />
      </ReactFlow>
    </div>
  )
}

export function SLDDiagram(props: Props) {
  return (
    <ReactFlowProvider>
      <Diagram {...props} />
    </ReactFlowProvider>
  )
}
