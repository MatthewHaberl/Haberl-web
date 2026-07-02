'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { CanvasThemeProvider, type CanvasColorOverrides } from '@/lib/solar/canvas-theme'
import { extractQuoteJson, isMultiOption, type QuoteData } from '@/lib/solar/render-quote'
import {
  parseDesign, quoteDataToDesign, emptyDesign, type SystemDesign,
} from '@/lib/solar/system-design'
import { QuoteStatusBar } from './QuoteStatusBar'
import type { QuoteRequestStatus } from '@/types/database'
import { DesignProvider } from './design/DesignProvider'
import { BalanceHeader } from './design/BalanceHeader'
import { BuildRail } from './design/BuildRail'
import { Walkthrough } from './design/Walkthrough'
import { ActiveSection } from './design/sections/ActiveSection'
import { DesignBomPanel } from './design/DesignBomPanel'
import { DesignCanvasPanel } from './design/DesignCanvasPanel'

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: Record<string, any>
  isAdmin: boolean
  photoUrls: string[]
  nextQuoteNum: string
  linkedJobId: string | null
}

export function DesignWorkspace({ req, isAdmin, linkedJobId }: Props) {
  const siteLabel = req.site_label?.trim() || req.address?.trim() || `Site ${req.site_number ?? 1}`
  const optionLabel = req.option_label?.trim() || req.quote_number || 'Option'

  // Company-wide canvas colour overrides for the diagram. Same client fetch pattern
  // as DesignBomPanel's markup read; null/missing degrades to the brand defaults.
  const [canvasColors, setCanvasColors] = useState<CanvasColorOverrides | null>(null)
  useEffect(() => {
    let active = true
    createClient()
      .from('company_settings').select('canvas_colors').eq('id', true).maybeSingle()
      .then(({ data }) => {
        if (active && data?.canvas_colors) setCanvasColors(data.canvas_colors as CanvasColorOverrides)
      })
    return () => { active = false }
  }, [])

  // Resolve the canvas's starting design: saved system_design → else hydrate from
  // a legacy generated_quote → else a blank design.
  const initialDesign: SystemDesign = useMemo(() => {
    const stored = parseDesign(req.system_design)
    if (stored) return stored
    if (req.generated_quote) {
      const parsed = extractQuoteJson(req.generated_quote)
      if (parsed) {
        const single = isMultiOption(parsed)
          ? (parsed.options.find((o) => o.tier === 'recommended') ?? parsed.options[0])
          : (parsed as QuoteData)
        return quoteDataToDesign(single)
      }
    }
    return emptyDesign()
  }, [req.system_design, req.generated_quote])

  return (
    <div className="flex flex-col gap-4 pb-20">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
            <Link href="/portal/employee/quotes-v2"><ArrowLeft className="h-4 w-4" /> Quotes</Link>
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-primary">{req.customer_name}</h1>
            <Badge variant="default" className="gap-1"><MapPin className="h-3 w-3" />{siteLabel}</Badge>
            <span className="text-sm font-medium">{optionLabel}</span>
            {req.is_amendment && <Badge variant="warning">Amendment</Badge>}
          </div>
        </div>
        {isAdmin ? (
          <QuoteStatusBar
            requestId={req.id}
            initialStatus={req.status as QuoteRequestStatus}
            initialJobId={linkedJobId}
            shareToken={req.share_token}
            customerEmail={req.customer_email ?? null}
            customerPhone={req.customer_phone ?? null}
            customerName={req.customer_name}
            quoteNumber={req.quote_number ?? null}
            viewedAt={req.viewed_at ?? null}
          />
        ) : (
          <Badge variant="default" className="mt-1 shrink-0">{req.status}</Badge>
        )}
      </div>

      {isAdmin ? (
        <CanvasThemeProvider value={canvasColors}>
          <DesignProvider
            requestId={req.id}
            initialDesign={initialDesign}
            gridSupply={req.grid_supply as string | undefined}
            record={{ monthly_kwh: req.monthly_kwh ?? null, municipality: req.municipality ?? null }}
            canSave
          >
            <BalanceHeader />
            <Walkthrough />
            <BuildRail />
            <ActiveSection />
            <DesignCanvasPanel />
            <DesignBomPanel />
          </DesignProvider>
        </CanvasThemeProvider>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          {req.quote_html ? (
            <iframe srcDoc={req.quote_html} title="Quote" className="w-full rounded-lg border border-border" style={{ height: 700 }} sandbox="allow-same-origin" />
          ) : (
            <p className="py-10 text-center text-muted-foreground text-sm">Quote is being prepared.</p>
          )}
        </div>
      )}
    </div>
  )
}
