'use client'

// Section + line-item editor for the scope builder (W97). Sections render in
// scope.sections order; lines live under their section, one grid row each —
// same column rhythm as the supplier-quote panel.
//
// Pricing columns: landed cost (supplier ex-VAT × 1.15) → sell (landed × markup)
// → the effective markup. Typing a sell price overrides the derived one
// (sellOverridden) and shows amber with a reset; catalog lines show their cost
// read-only because generate re-reads it from the catalog. Unpriced lines show
// the same amber "Quote" treatment as the solar BOM panel.

import {
  useEffect, useState,
  type CSSProperties, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction,
} from 'react'
import { ArrowDown, ArrowUp, CircuitBoard, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  newScopeLine, type QuoteScope, type ScopeLine, type ScopeLineUnit,
} from '@/lib/quotes/scope'
import { CatalogSearch, type CatalogPick } from './CatalogSearch'
import { ScopeDbBuilder } from './ScopeDbBuilder'
import {
  SupplierQuoteLinePicker, useSupplierQuoteLines, type PickableSupplierLine,
} from '../SupplierQuoteLinePicker'
import { landedCostR, quotedSellR } from '@/lib/quotes/supplier-quotes'
import { sectionSuggestions } from '@/lib/quotes/work-types'
import type { ScopeIssue } from '@/lib/quotes/scope-validate'
import type { ScopePricing } from './ScopeWorkspace'

const round2 = (n: number) => Math.round(n * 100) / 100
const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const UNITS: ScopeLineUnit[] = ['ea', 'm', 'hr', 'job']

// One row per line, same column rhythm as the supplier-quote panel:
// sku · description · qty · unit · landed cost · sell · markup · total · opt · bin
//
// Container query, not a viewport breakpoint: this editor shares the page with
// the summary panel, so the panel is ~550px at 1280px wide and ~900px on a big
// monitor. Below 52rem of ITS OWN width the columns would squeeze the
// description to nothing, so the fields stack instead.
// Widths are drag-resizable — a long SKU is unreadable in the 5rem default —
// and ride on a CSS variable set once on the wrapper rather than an inline
// style per row, so the container query above can still switch the grid off.
const ROW_COLS = '@[52rem]:grid-cols-[var(--scope-cols)]'

type ScopeCol = {
  key: string
  label: string
  /** null = the flexible column (description) — it absorbs what the others give up. */
  width: number | null
  min?: number
  /** Ceiling, so a runaway drag can't push the row past the card. */
  max?: number
  hint?: string
  align?: 'right' | 'center'
}

const COLUMNS: ScopeCol[] = [
  { key: 'sku', label: 'SKU', width: 80, min: 48, max: 260 },
  { key: 'description', label: 'Description', width: null },
  { key: 'qty', label: 'Qty', width: 52, min: 40, max: 120 },
  { key: 'unit', label: 'Unit', width: 64, min: 48, max: 120 },
  { key: 'cost', label: 'Cost', width: 96, min: 56, max: 180, hint: 'Landed cost — supplier ex-VAT x 1.15' },
  { key: 'sell', label: 'Sell', width: 96, min: 56, max: 180, hint: 'Sell price per unit' },
  { key: 'markup', label: 'Markup', width: 52, min: 44, max: 120, hint: 'Sell / cost' },
  { key: 'total', label: 'Total', width: 92, min: 60, max: 200, align: 'right' },
  { key: 'opt', label: 'Opt', width: 24, min: 24, max: 60, hint: 'Optional extra', align: 'center' },
  { key: 'bin', label: '', width: 28, min: 28 },
]

const COL_STORE = 'scope-editor-col-widths'

const defaultWidths = () =>
  Object.fromEntries(
    COLUMNS.filter((c) => c.width !== null).map((c) => [c.key, c.width as number]),
  ) as Record<string, number>

/** Drag-resized column widths, remembered in this browser. */
function useColumnWidths() {
  const [widths, setWidths] = useState<Record<string, number>>(defaultWidths)

  // Read after mount — touching localStorage during render breaks hydration.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COL_STORE)
      if (raw) setWidths((w) => ({ ...w, ...JSON.parse(raw) }))
    } catch { /* private mode or stale JSON — the defaults stand */ }
  }, [])

  // Every pointermove restates the width; only the drop is written to storage.
  const setWidth = (key: string, px: number, commit: boolean) =>
    setWidths((w) => {
      const next = { ...w, [key]: px }
      if (commit) {
        try { window.localStorage.setItem(COL_STORE, JSON.stringify(next)) } catch {}
      }
      return next
    })

  const reset = () => {
    setWidths(defaultWidths())
    try { window.localStorage.removeItem(COL_STORE) } catch {}
  }

  const template = COLUMNS
    .map((c) => (c.width === null ? 'minmax(6rem,1fr)' : `${widths[c.key]}px`))
    .join(' ')
  const isDefault = COLUMNS.every((c) => c.width === null || widths[c.key] === c.width)

  return { widths, setWidth, reset, template, isDefault }
}

/** Grab handle on a header cell's right edge. Double-click restores the default. */
function ColResizer({ col, width, onResize }: {
  col: ScopeCol
  width: number
  onResize: (px: number, commit: boolean) => void
}) {
  const start = (e: ReactPointerEvent) => {
    e.preventDefault()
    const x0 = e.clientX
    let px = width
    const move = (ev: globalThis.PointerEvent) => {
      const want = Math.round(width + ev.clientX - x0)
      px = Math.min(col.max ?? 320, Math.max(col.min ?? 32, want))
      onResize(px, false)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onResize(px, true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      title={`Drag to resize ${col.label} — double-click to reset`}
      onPointerDown={start}
      onDoubleClick={() => onResize(col.width as number, true)}
      className="group absolute -right-1.5 top-0 z-10 flex h-full w-3 cursor-col-resize items-center justify-center"
    >
      <span className="h-3 w-px bg-border group-hover:bg-foreground/50" />
    </span>
  )
}

/** Effective markup on a line (sell ÷ landed cost), or null with no cost. */
const markupOf = (line: ScopeLine) =>
  line.unitCostR > 0 && line.unitSellR > 0 ? line.unitSellR / line.unitCostR : null

// Sections that plausibly hold a distribution board get the DB-builder
// shortcut (default work-type sections: "Distribution board", "Generator &
// changeover", "Supply & protection" — plus anything the user names DB-ish).
const DB_SECTION_RE = /\b(db|board|distribution|changeover|supply|protection)\b/i

export function ScopeEditor({ scope, onChange, pricing, requestId, issues, showIssues }: {
  scope: QuoteScope
  onChange: Dispatch<SetStateAction<QuoteScope>>
  pricing: ScopePricing
  requestId: string
  /** Pre-flight findings for the whole scope — see scope-validate.ts. */
  issues: ScopeIssue[]
  /** Red fields appear only once Generate has actually been refused. */
  showIssues: boolean
}) {
  const [newSection, setNewSection] = useState('')
  // Section the DB builder is currently building into (null = closed).
  const [dbSection, setDbSection] = useState<string | null>(null)
  // Lines on uploaded supplier quotes (W98) — pickable into any section.
  const supplierLines = useSupplierQuoteLines(requestId)
  // Column widths are shared by every section grid on the page.
  const cols = useColumnWidths()

  // Display order: declared sections first, then any stragglers lines reference.
  const sectionNames = [...scope.sections]
  for (const line of scope.lines) {
    if (line.section && !sectionNames.includes(line.section)) sectionNames.push(line.section)
  }

  // Issues by line, so a row can ring the offending field and say why under
  // itself. The row is ten columns wide at full width — there is no room for a
  // message under a single cell, so the row carries them.
  const lineIssues = new Map<string, ScopeIssue[]>()
  for (const issue of issues) {
    if (!issue.lineId) continue
    const list = lineIssues.get(issue.lineId) ?? []
    list.push(issue)
    lineIssues.set(issue.lineId, list)
  }
  const badField = (id: string, field: 'description' | 'qty') =>
    showIssues && (lineIssues.get(id) ?? []).some((i) => i.field === field)
  const INVALID = 'border-destructive focus-visible:ring-destructive'

  const updateLine = (id: string, patch: Partial<ScopeLine>) =>
    onChange((s) => ({
      ...s,
      lines: s.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }))

  const removeLine = (id: string) =>
    onChange((s) => ({ ...s, lines: s.lines.filter((l) => l.id !== id) }))

  // Landed cost drives the sell price (cost × markup) until someone types
  // their own price — after that the typed price stands until it's reset.
  const setCost = (line: ScopeLine, costR: number) =>
    updateLine(line.id, {
      unitCostR: costR,
      ...(line.sellOverridden ? {} : { unitSellR: round2(costR * pricing.markup) }),
    })

  const resetSell = (line: ScopeLine) =>
    updateLine(line.id, {
      unitSellR: round2(line.unitCostR * pricing.markup),
      sellOverridden: false,
    })

  const addFreeLine = (section: string, kind: 'material' | 'fee') =>
    onChange((s) => ({ ...s, lines: [...s.lines, newScopeLine(section, kind)] }))

  const addCatalogLine = (section: string, item: CatalogPick) =>
    onChange((s) => ({
      ...s,
      lines: [
        ...s.lines,
        {
          ...newScopeLine(section, 'material'),
          catalogId: item.id,
          sku: item.sku,
          description: item.description,
          unitCostR: round2(item.cost_rands),
          unitSellR: round2(item.cost_rands * pricing.markup),
        },
      ],
    }))

  // A supplier-quoted line lands as a free-text line: the QUOTED price is
  // authoritative for this quote (a catalogId would be re-priced from the
  // catalog at generate). Cost = landed (ex-VAT × 1.15); sell = landed × markup.
  const addSupplierLine = (section: string, l: PickableSupplierLine) =>
    onChange((s) => ({
      ...s,
      lines: [
        ...s.lines,
        {
          ...newScopeLine(section, 'material'),
          catalogId: null,
          sku: l.sku,
          description: l.description,
          qty: l.qty > 0 ? l.qty : 1,
          unit: (UNITS as string[]).includes(l.unit) ? (l.unit as ScopeLineUnit) : 'ea',
          unitCostR: landedCostR(l.unitPriceExVatR),
          unitSellR: quotedSellR(l.unitPriceExVatR, pricing.markup),
          note: l.supplierLabel ? `From ${l.supplierLabel}` : null,
        },
      ],
    }))

  const moveSection = (name: string, dir: -1 | 1) =>
    onChange((s) => {
      const order = [...sectionNames]
      const i = order.indexOf(name)
      const j = i + dir
      if (i < 0 || j < 0 || j >= order.length) return s
      ;[order[i], order[j]] = [order[j], order[i]]
      return { ...s, sections: order }
    })

  const removeSection = (name: string) =>
    onChange((s) => ({ ...s, sections: s.sections.filter((n) => n !== name) }))

  const addNamedSection = (raw: string) => {
    const name = raw.trim()
    if (!name) return
    onChange((s) => (s.sections.includes(name) ? s : { ...s, sections: [...s.sections, name] }))
  }

  const addSection = () => {
    addNamedSection(newSection)
    setNewSection('')
  }

  const unusedSuggestions = sectionSuggestions().filter(
    (s) => !sectionNames.some((n) => n.toLowerCase() === s.toLowerCase()),
  )

  return (
    <div
      className="space-y-4"
      data-issue-anchor="sections"
      style={{ '--scope-cols': cols.template } as CSSProperties}
    >
      {sectionNames.map((name, idx) => {
        const lines = scope.lines.filter((l) => l.section === name)
        const counted = lines.filter((l) => !l.optional && l.unitSellR > 0 && l.qty > 0)
        const subtotal = counted.reduce((t, l) => t + round2(l.unitSellR * l.qty), 0)
        // Landed cost behind the counted lines — margin is what's left of the sell.
        const costTotal = counted.reduce((t, l) => t + round2(l.unitCostR * l.qty), 0)
        const marginPct = subtotal > 0 && costTotal > 0
          ? ((subtotal - costTotal) / subtotal) * 100
          : null
        return (
          <Card key={name} data-issue-anchor={`section:${name}`}>
            <CardContent className="@container space-y-3 pt-6">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{name}</span>
                  {lines.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {lines.length} line{lines.length === 1 ? '' : 's'} · {rand(round2(subtotal))}
                      {costTotal > 0 && (
                        <> · cost {rand(round2(costTotal))}
                          {marginPct !== null && ` · margin ${marginPct.toFixed(1)}%`}</>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => moveSection(name, -1)} disabled={idx === 0} title="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => moveSection(name, 1)} disabled={idx === sectionNames.length - 1} title="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  {lines.length === 0 && scope.sections.includes(name) && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => removeSection(name)} title="Remove empty section">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {lines.length > 0 && (
                <div className={`hidden gap-2 px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground @[52rem]:grid ${ROW_COLS}`}>
                  {COLUMNS.map((col) => (
                    <span
                      key={col.key}
                      title={col.hint}
                      className={`relative truncate ${col.align === 'right' ? 'text-right' : ''} ${col.align === 'center' ? 'text-center' : ''}`}
                    >
                      {col.key === 'bin' && !cols.isDefault ? (
                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5"
                          onClick={cols.reset} title="Reset column widths">
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      ) : col.label}
                      {col.width !== null && col.key !== 'bin' && (
                        <ColResizer
                          col={col}
                          width={cols.widths[col.key]}
                          onResize={(px, commit) => cols.setWidth(col.key, px, commit)}
                        />
                      )}
                    </span>
                  ))}
                </div>
              )}

              <div className="space-y-0.5">
                {lines.map((line) => {
                  const mk = markupOf(line)
                  const rowIssues = showIssues ? (lineIssues.get(line.id) ?? []) : []
                  return (
                    <div
                      key={line.id}
                      data-issue-anchor={`line:${line.id}`}
                      data-invalid={rowIssues.length > 0 ? 'true' : undefined}
                      className={rowIssues.length > 0 ? 'rounded bg-destructive/5 py-1' : undefined}
                    >
                    <div
                      className={`grid grid-cols-2 items-start gap-2 rounded border border-border/60 p-1 @[52rem]:border-0 @[52rem]:p-0 ${ROW_COLS}`}
                    >
                      <Input
                        value={line.sku}
                        onChange={(e) => updateLine(line.id, { sku: e.target.value })}
                        placeholder="SKU" className="h-8 text-xs"
                      />
                      <div className="min-w-0">
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(line.id, { description: e.target.value })}
                          placeholder={line.kind === 'fee' ? 'Fee description (e.g. Inspection fee)' : 'Item description'}
                          className={`h-8 text-xs ${badField(line.id, 'description') ? INVALID : ''}`}
                        />
                        {(line.kind === 'fee' || line.note) && (
                          <div className="ml-1 truncate border-l border-border pl-1.5 text-[10px] leading-[1.15] text-muted-foreground">
                            {[line.kind === 'fee' ? 'fee' : null, line.note].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      <Input
                        type="number" min={0} step="any"
                        value={line.qty === 0 ? '' : String(line.qty)}
                        onChange={(e) => updateLine(line.id, { qty: Math.max(0, Number(e.target.value) || 0) })}
                        className={`h-8 text-xs ${badField(line.id, 'qty') ? INVALID : ''}`}
                        placeholder="Qty"
                      />
                      <Select
                        value={line.unit}
                        onChange={(e) => updateLine(line.id, { unit: e.target.value as ScopeLineUnit })}
                        className="h-8 pl-2 pr-6 text-xs"
                      >
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </Select>
                      {/* Catalog lines are re-costed from the catalog at generate, so their
                          landed cost is shown, not typed. Free-text and supplier-quoted
                          lines carry their own cost. */}
                      {line.catalogId ? (
                        <span
                          className="flex h-8 items-center truncate px-1 text-xs text-muted-foreground"
                          title="Landed cost from the catalog — re-read when the quote is generated"
                        >
                          {line.unitCostR > 0 ? rand(line.unitCostR) : '—'}
                        </span>
                      ) : (
                        <Input
                          type="number" min={0} step="any"
                          leadingText="R"
                          value={line.unitCostR === 0 ? '' : String(line.unitCostR)}
                          onChange={(e) => setCost(line, Math.max(0, Number(e.target.value) || 0))}
                          className="h-8 text-xs" placeholder="Cost"
                        />
                      )}
                      <Input
                        type="number" min={0} step="any"
                        leadingText="R"
                        value={line.unitSellR === 0 ? '' : String(line.unitSellR)}
                        onChange={(e) => updateLine(line.id, {
                          unitSellR: Math.max(0, Number(e.target.value) || 0),
                          sellOverridden: true,
                        })}
                        onBlur={() => {
                          // A line left with no price reverts to auto (cost x markup) —
                          // a stored 0 would show as "Quote" here while generate
                          // re-priced it anyway.
                          if (line.unitCostR > 0 && line.unitSellR <= 0) resetSell(line)
                        }}
                        className="h-8 text-xs" placeholder="Sell"
                      />
                      <div className="flex h-8 items-center gap-0.5">
                        <span
                          className={`text-[11px] ${line.sellOverridden ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
                          title={mk
                            ? line.sellOverridden
                              ? `Typed price — x${mk.toFixed(2)} on landed cost (house markup x${pricing.markup.toFixed(2)})`
                              : `Sell = landed cost x ${pricing.markup.toFixed(2)}`
                            : 'No landed cost on this line'}
                        >
                          {mk ? `x${mk.toFixed(2)}` : '—'}
                        </span>
                        {line.sellOverridden && line.unitCostR > 0 && (
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                            title={`Reset to cost x markup (${rand(round2(line.unitCostR * pricing.markup))})`}
                            onClick={() => resetSell(line)}>
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <div className="flex h-8 items-center justify-end text-right">
                        {line.unitSellR <= 0
                          ? <Badge variant="warning">Quote</Badge>
                          : <span className="text-xs font-medium">{rand(round2(line.unitSellR * line.qty))}</span>}
                      </div>
                      <label
                        className="flex h-8 cursor-pointer items-center justify-center"
                        title="Optional extra — listed on the quote but excluded from the total"
                      >
                        <input
                          type="checkbox"
                          checked={line.optional}
                          onChange={(e) => updateLine(line.id, { optional: e.target.checked })}
                        />
                        <span className="ml-1 text-[11px] text-muted-foreground @[52rem]:hidden">Optional extra</span>
                      </label>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-7 justify-self-end"
                        onClick={() => removeLine(line.id)} title="Remove line">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {rowIssues.map((i) => (
                      <p key={i.id} className="px-1 pt-0.5 text-[11px] font-medium text-destructive">
                        {i.message}
                      </p>
                    ))}
                    </div>
                  )
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[240px] flex-1">
                  <CatalogSearch onPick={(item) => addCatalogLine(name, item)} />
                </div>
                <SupplierQuoteLinePicker
                  lines={supplierLines}
                  onPick={(l) => addSupplierLine(name, l)}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => addFreeLine(name, 'material')}>
                  <Plus className="h-3.5 w-3.5" /> Free-text item
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addFreeLine(name, 'fee')}>
                  <Plus className="h-3.5 w-3.5" /> Fee
                </Button>
                {DB_SECTION_RE.test(name) && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setDbSection(name)}>
                    <CircuitBoard className="h-3.5 w-3.5" /> DB builder
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}

      {sectionNames.length === 0 && (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm font-medium">No sections yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sections are the headings this quote is built from. Add one below — or pick a
              common one — then drop the items in.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSection() } }}
            placeholder="New section name (e.g. Distribution board)"
            className="h-9 max-w-xs"
          />
          <Button type="button" variant="outline" size="sm" onClick={addSection} disabled={!newSection.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add section
          </Button>
        </div>

        {/* House vocabulary, one click away — a free-form quote should still
            reach for the same section names as the seeded work types. */}
        {unusedSuggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Common:</span>
            {unusedSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addNamedSection(s)}
                className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                + {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {dbSection !== null && (
        <ScopeDbBuilder
          section={dbSection}
          pricing={pricing}
          existingLines={scope.lines.filter((l) => l.section === dbSection)}
          onClose={() => setDbSection(null)}
          onAdd={(built, replacedIds) => {
            onChange((s) => {
              // The board rewrites the lines it owns in place (same ids, so
              // order and any hand-set price/optional flag survive), drops the
              // ones whose part was deleted in the builder, and appends what's
              // genuinely new — never a second copy of the same board.
              const rebuilt = new Map(built.map((l) => [l.id, l]))
              const owned = new Set(replacedIds)
              const kept: ScopeLine[] = []
              for (const line of s.lines) {
                const next = rebuilt.get(line.id)
                if (next) { kept.push(next); rebuilt.delete(line.id); continue }
                if (owned.has(line.id)) continue
                kept.push(line)
              }
              return { ...s, lines: [...kept, ...rebuilt.values()] }
            })
            setDbSection(null)
          }}
        />
      )}
    </div>
  )
}
