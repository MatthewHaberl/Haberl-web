'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Workflow, ChevronDown, ChevronRight } from 'lucide-react'

// ReactFlow needs the DOM — load the canvas client-only (matches the old SLD diagram).
const DesignCanvas = dynamic(
  () => import('./DesignCanvas').then((m) => m.DesignCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-64 rounded-lg border border-border bg-muted text-sm text-muted-foreground">
        Loading diagram…
      </div>
    ),
  },
)

/** Collapsible wrapper around the design canvas — mirrors the BOM panel pattern. */
export function DesignCanvasPanel() {
  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3"
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Workflow className="h-4 w-4" /> Design diagram
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
        <span className="text-xs text-muted-foreground">{open ? 'Single-line schematic' : 'Hidden'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <DesignCanvas height={580} />
        </div>
      )}
    </div>
  )
}
