'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  computeFinalM,
  ROUTE_TYPE_META,
  ROUTE_TYPE_ORDER,
  routeTotals,
  type RouteDraft,
} from '@/lib/solar/cable-routes'
import type { CableRouteType } from '@/types/database'
import { Cable, Check, Loader2, Save, Trash2, X } from 'lucide-react'

interface Props {
  routes: RouteDraft[]
  armedType: CableRouteType | null
  saving: boolean
  saved: boolean
  error: string
  onArm: (type: CableRouteType | null) => void
  onUpdate: (id: string, patch: Partial<Pick<RouteDraft, 'vertical_m' | 'slack_pct' | 'label'>>) => void
  onDelete: (id: string) => void
  onSave: () => void
}

function numberInput(value: number, onChange: (v: number) => void, step = 0.5) {
  return (
    <input
      type="number"
      min="0"
      step={step}
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      className="h-8 w-16 rounded border border-border bg-background px-2 text-xs text-right"
    />
  )
}

export function RoutesPanel({ routes, armedType, saving, saved, error, onArm, onUpdate, onDelete, onSave }: Props) {
  const totals = routeTotals(routes)

  return (
    <Card>
      <CardContent className="pt-5 pb-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Cable className="h-4 w-4 text-accent" /> Cable Routes
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Draw each run on the satellite view — measured lengths replace the guessed cable
              route and drive the BOM and voltage-drop checks. Order once, no extras.
            </p>
          </div>
          {routes.length > 0 && (
            <div className="text-right">
              <p className="text-lg font-bold text-primary">{totals.totalM.toFixed(1)} m</p>
              <p className="text-[11px] text-muted-foreground">total cable (incl. vertical + slack)</p>
            </div>
          )}
        </div>

        {/* Arm a route type to start drawing */}
        <div className="flex items-center gap-2 flex-wrap">
          {ROUTE_TYPE_ORDER.map((type) => {
            const meta = ROUTE_TYPE_META[type]
            const armed = armedType === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => onArm(armed ? null : type)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                  armed
                    ? 'text-white border-transparent'
                    : 'bg-background text-muted-foreground border-border hover:border-foreground/40'
                }`}
                style={armed ? { background: meta.color } : undefined}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: armed ? '#fff' : meta.color }} />
                {armed ? `Drawing ${meta.short}…` : `+ ${meta.label}`}
              </button>
            )
          })}
          {armedType && (
            <Button variant="ghost" size="sm" onClick={() => onArm(null)} className="text-xs">
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
          )}
        </div>

        {/* Route list */}
        {routes.length > 0 ? (
          <div className="flex flex-col rounded-lg border border-border divide-y divide-border overflow-x-auto">
            <div className="grid grid-cols-[1fr_repeat(4,4.5rem)_2rem] gap-2 items-center px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground min-w-[34rem]">
              <span>Run</span>
              <span className="text-right">Map (m)</span>
              <span className="text-right">Vertical (m)</span>
              <span className="text-right">Slack %</span>
              <span className="text-right">Order (m)</span>
              <span />
            </div>
            {routes.map((route) => {
              const meta = ROUTE_TYPE_META[route.route_type]
              const final = computeFinalM(route.measured_m, route.vertical_m, route.slack_pct)
              return (
                <div key={route.id} className="grid grid-cols-[1fr_repeat(4,4.5rem)_2rem] gap-2 items-center px-3 py-2 min-w-[34rem]">
                  <span className="flex items-center gap-2 text-sm min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: meta.color }} />
                    <span className="truncate">{route.label}</span>
                  </span>
                  <span className="text-right text-sm tabular-nums">{route.measured_m.toFixed(1)}</span>
                  <span className="flex justify-end">{numberInput(route.vertical_m, (v) => onUpdate(route.id, { vertical_m: v }))}</span>
                  <span className="flex justify-end">{numberInput(route.slack_pct, (v) => onUpdate(route.id, { slack_pct: v }), 1)}</span>
                  <span className="text-right text-sm font-semibold tabular-nums">{final.toFixed(1)}</span>
                  <button
                    type="button"
                    onClick={() => onDelete(route.id)}
                    className="text-muted-foreground hover:text-destructive justify-self-end"
                    title="Delete route"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border px-3 py-4 text-center">
            No routes yet — pick a run type above, then click along the cable path on the map.
            Double-click to finish a run.
          </p>
        )}

        {/* Totals + save */}
        {routes.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              {totals.dcM > 0 && <span>DC <strong className="text-foreground">{totals.dcM.toFixed(1)} m</strong></span>}
              {totals.acM > 0 && <span>AC <strong className="text-foreground">{totals.acM.toFixed(1)} m</strong></span>}
              {totals.batteryM > 0 && <span>Battery <strong className="text-foreground">{totals.batteryM.toFixed(1)} m</strong></span>}
              {totals.earthM > 0 && <span>Earth <strong className="text-foreground">{totals.earthM.toFixed(1)} m</strong></span>}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {saved && !saving && (
                <span className="flex items-center gap-1 text-xs text-success"><Check className="h-3.5 w-3.5" /> Saved</span>
              )}
              <Button variant="accent" size="sm" onClick={onSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save routes
              </Button>
            </div>
          </div>
        )}
        {routes.length > 0 && !saved && (
          <p className="text-[11px] text-muted-foreground">
            After saving, recalculate the quote — the calculator uses these measured lengths
            instead of the manual cable-route estimate.
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
