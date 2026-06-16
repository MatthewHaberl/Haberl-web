'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Box } from 'lucide-react'
import { buildLayoutModel, type DesignSegment, type CableRouteRow } from '@/lib/solar/job-layout-3d'

const JobLayout3DViewer = dynamic(
  () =>
    import('@/components/job-layout-3d/JobLayout3DViewer').then(
      (m) => m.JobLayout3DViewer,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center rounded-lg border border-border bg-muted text-sm text-muted-foreground" style={{ height: 480 }}>
        Loading 3D layout…
      </div>
    ),
  },
)

interface QuoteDesignData {
  id: string
  design_segments: DesignSegment[] | null
  roof_type: string | null
  storeys: number | null
  design_panel_count: number | null
  design_kwp: number | null
}

interface JobLayout3DPanelProps {
  quoteRequest: QuoteDesignData | null
  cableRoutes: CableRouteRow[]
  jobId: string
}

export function JobLayout3DPanel({ quoteRequest, cableRoutes, jobId }: JobLayout3DPanelProps) {
  const [open, setOpen] = useState(false)

  const hasData = !!(quoteRequest?.design_segments?.length)

  const model = hasData
    ? buildLayoutModel(
        quoteRequest!.design_segments,
        quoteRequest!.roof_type as 'tile' | 'ibr' | 'flat' | null,
        quoteRequest!.storeys,
        cableRoutes,
      )
    : null

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Box className="h-4 w-4 text-accent" />
            <span className="font-medium text-sm">3D Site Layout</span>
            {quoteRequest?.design_panel_count && (
              <span className="text-xs text-muted-foreground">
                {quoteRequest.design_panel_count} panels · {quoteRequest.design_kwp?.toFixed(2)} kWp
              </span>
            )}
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {open && (
          <div className="mt-4">
            {!hasData ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground" style={{ height: 160 }}>
                No roof design data yet — complete the design in the Quote to generate a 3D layout.
              </div>
            ) : (
              <>
                {model && (
                  <JobLayout3DViewer model={model} jobId={jobId} />
                )}
                {cableRoutes.length === 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No cable routes drawn yet. Draw cable runs in the Quote → Roof Design tab to show them here.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
