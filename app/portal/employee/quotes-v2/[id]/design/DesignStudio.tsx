'use client'

import { DesignRibbon } from './DesignRibbon'
import { DesignConsole } from './DesignConsole'
import { DesignOverview } from './DesignOverview'
import { DesignCanvasPanel } from './DesignCanvasPanel'
import { DesignBomPanel } from './DesignBomPanel'

/**
 * Studio ("cockpit") layout — the opt-in alternative to the classic vertical
 * stack. Top build ribbon, a collapsible left form console, and a full-width
 * stage that swaps between the single-line diagram and the detailed BOM. All the
 * domain logic (sections, canvas, BOM, autosave) is reused unchanged — this is a
 * presentation shell.
 *
 * Height chain: every flex ancestor from here down carries `min-h-0` so ReactFlow
 * gets a resolved height (otherwise the diagram renders 0px).
 */
export function DesignStudio({
  consoleOpen, setConsoleOpen, overviewOpen, setOverviewOpen, viewMode, setViewMode,
}: {
  consoleOpen: boolean
  setConsoleOpen: (v: boolean) => void
  overviewOpen: boolean
  setOverviewOpen: (v: boolean) => void
  viewMode: 'canvas' | 'bom'
  setViewMode: (m: 'canvas' | 'bom') => void
}) {
  return (
    <div className="-mx-4 flex h-[82dvh] min-h-[600px] flex-col overflow-hidden border-y border-border bg-background md:-mx-6">
      <DesignRibbon
        viewMode={viewMode}
        setViewMode={setViewMode}
        onOpenOverview={() => setOverviewOpen(true)}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <DesignConsole open={consoleOpen} onToggle={() => setConsoleOpen(!consoleOpen)} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted/20">
          {viewMode === 'canvas' ? (
            <div className="min-h-0 flex-1 p-3">
              <DesignCanvasPanel fill />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <DesignBomPanel />
            </div>
          )}
        </div>
      </div>

      {overviewOpen && <DesignOverview onClose={() => setOverviewOpen(false)} />}
    </div>
  )
}
