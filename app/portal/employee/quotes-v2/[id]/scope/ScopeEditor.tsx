'use client'

// Section + line-item editor for the scope builder (W97). Sections render in
// scope.sections order; lines live under their section, one grid row each —
// same column rhythm as the supplier-quote panel.
//
// Pricing columns: landed cost (supplier ex-VAT × 1.15) → sell (landed × markup)
// → the effective markup %. Sell and markup are two views of one number —
// type either and the other follows. Typing a sell price overrides the derived one
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
import {
  newScopeLine, renameScopeSection, scopeSectionNames,
  type QuoteScope, type ScopeLine, type ScopeLineUnit,
} from '@/lib/quotes/scope'
import {
  presetSectionName, presetToScopeLines, sectionToPreset, type ScopeSectionPreset,
} from '@/lib/quotes/scope-presets'
import { CatalogSearch, type CatalogPick } from './CatalogSearch'
import { ScopeDbBuilder } from './ScopeDbBuilder'
import { LineMovePicker, type MoveTarget } from './LineMovePicker'
import { PresetPicker, SavePresetButton, useSectionPresets } from './SectionPresets'
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
// sku · description · qty · landed cost · cost total · sell · markup · total · opt · bin
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
  { key: 'cost', label: 'Cost', width: 96, min: 56, max: 180, hint: 'Landed cost per unit — supplier ex-VAT x 1.15' },
  // Cost x qty, beside sell x qty at the other end of the row: the two numbers
  // the margin is the difference between, both on the page to be checked.
  { key: 'costTotal', label: 'Cost total', width: 96, min: 60, max: 200, hint: 'Landed cost x qty — what this line costs the business', align: 'right' },
  { key: 'sell', label: 'Sell', width: 96, min: 56, max: 180, hint: 'Sell price per unit' },
  { key: 'markup', label: 'Markup %', width: 88, min: 64, max: 160, hint: 'Markup on landed cost — type 15 for cost x 1.15' },
  { key: 'total', label: 'Total', width: 92, min: 60, max: 200, align: 'right' },
  { key: 'opt', label: 'Opt', width: 24, min: 24, max: 60, hint: 'Optional extra', align: 'center' },
  { key: 'move', label: '', width: 28, min: 28 },
  { key: 'bin', label: '', width: 28, min: 28 },
]

const COL_STORE = 'scope-editor-col-widths'

/**
 * Widths remembered before a column changed shape are re-clamped on read — a
 * stored 52px on a column whose minimum is now 64 would clip its field.
 */
const clampWidths = (stored: Record<string, unknown>) =>
  Object.fromEntries(
    COLUMNS.flatMap((c) => {
      const px = Number(stored?.[c.key])
      if (c.width === null || !Number.isFinite(px)) return []
      return [[c.key, Math.min(c.max ?? 320, Math.max(c.min ?? 32, Math.round(px)))]]
    }),
  ) as Record<string, number>

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
      if (raw) setWidths((w) => ({ ...w, ...clampWidths(JSON.parse(raw)) }))
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

const fmtPct = (p: number) => String(Math.round(p * 10) / 10)

/**
 * Markup as a percentage you can type: 15 means sell = landed cost x 1.15.
 * The stored value is still the sell price — this cell only does the sum, so
 * "put another 5% on this line" no longer needs a calculator.
 */
function MarkupCell({ line, houseMarkup, onMarkupPct, onReset }: {
  line: ScopeLine
  houseMarkup: number
  onMarkupPct: (pct: number) => void
  onReset: () => void
}) {
  // The typed text is held locally while the field is focused: the value
  // round-trips through the sell price, so typing "2" on the way to "25" would
  // otherwise reprice the line at 2% and reformat the field under the caret.
  const [draft, setDraft] = useState<string | null>(null)
  const mk = markupOf(line)
  const pct = mk === null ? null : (mk - 1) * 100
  const shown = draft ?? (pct === null ? '' : fmtPct(pct))
  const housePct = fmtPct((houseMarkup - 1) * 100)

  // Nothing to be a percentage of — those lines are priced by typing a sell.
  if (line.unitCostR <= 0) {
    return (
      <span
        className="flex h-8 items-center px-1 text-[11px] text-muted-foreground"
        title="No landed cost on this line — type a sell price instead"
      >
        —
      </span>
    )
  }

  return (
    <div className="flex h-8 items-center gap-0.5">
      <Input
        type="number" step="any"
        trailingText="%"
        value={shown}
        placeholder={housePct}
        title={mk === null
          ? `Markup on landed cost — house rate is ${housePct}%`
          : `${fmtPct(pct as number)}% on landed cost (x${mk.toFixed(2)}) · ${(100 - 100 / mk).toFixed(1)}% margin`
            + (line.sellOverridden ? ` · house rate ${housePct}%` : '')}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() !== '' && Number.isFinite(n)) onMarkupPct(n)
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setDraft(null)}
        // Spinners are useless at this width and would sit on top of the "%".
        className={`h-8 pr-7 text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none${
          line.sellOverridden ? ' text-amber-600 dark:text-amber-400' : ''}`}
      />
      {line.sellOverridden && (
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
          title={`Back to the house ${housePct}%`}
          onClick={onReset}>
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}

/**
 * The section heading, renamed in place.
 *
 * The name is a draft while it is being typed and only commits on blur or
 * Enter: renaming per keystroke would rewrite every line in the section on the
 * way through "Distributio", and a half-typed name that collides with another
 * section would be refused mid-word. Escape abandons the edit; a refused
 * rename (blank, or a name already used here) snaps back to the old name and
 * the card says why underneath.
 */
function SectionName({ name, onRename }: {
  name: string
  /** Returns false when the rename was refused — the field reverts. */
  onRename: (next: string) => boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    const next = draft
    setDraft(null)
    if (next === null || next === name) return
    onRename(next)
  }

  return (
    <input
      value={draft ?? name}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
        if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() }
      }}
      title="Rename this section — the heading and every line under it"
      aria-label="Section name"
      placeholder="Section name"
      // Reads as a heading until you touch it; the hover/focus underline is the
      // only hint that it is editable, so the card still scans as a section.
      className="min-w-0 flex-1 truncate rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold hover:border-border focus:border-primary focus:outline-none"
    />
  )
}

// Sections that plausibly hold a distribution board get the DB-builder
// shortcut (default work-type sections: "Distribution board", "Generator &
// changeover", "Supply & protection" — plus anything the user names DB-ish).
const DB_SECTION_RE = /\b(db|board|distribution|changeover|supply|protection)\b/i

export function ScopeEditor({ scope, onChange, pricing, requestId, issues, showIssues, packageId = null }: {
  scope: QuoteScope
  onChange: Dispatch<SetStateAction<QuoteScope>>
  pricing: ScopePricing
  requestId: string
  /** Pre-flight findings for the whole scope — see scope-validate.ts. */
  issues: ScopeIssue[]
  /** Red fields appear only once Generate has actually been refused. */
  showIssues: boolean
  /**
   * Restrict this editor to one work package — its sections, its lines, and
   * anything added lands on it. Null (the default) is a single-package quote,
   * where sections live on the scope itself and nothing here changes.
   */
  packageId?: string | null
}) {
  const [newSection, setNewSection] = useState('')
  // Section the DB builder is currently building into (null = closed).
  const [dbSection, setDbSection] = useState<string | null>(null)
  // Section whose rename was just refused, and why — shown under its header.
  const [renameError, setRenameError] = useState<{ section: string; message: string } | null>(null)
  // Saved sections, shared across every quote (migration 125).
  const presets = useSectionPresets()
  // Lines on uploaded supplier quotes (W98) — pickable into any section.
  const supplierLines = useSupplierQuoteLines(requestId)
  // Column widths are shared by every section grid on the page.
  const cols = useColumnWidths()

  // Everything below reads one package's slice of the scope, or the whole scope
  // when this quote has no packages. `mine` is the filter; keep every line read
  // going through it or one package would show another's items.
  const mine = (l: ScopeLine) => l.packageId === packageId
  const pkg = packageId ? scope.packages.find((p) => p.id === packageId) : null
  const declaredSections = packageId ? (pkg?.sections ?? []) : scope.sections

  // Display order: declared sections first, then any stragglers lines reference.
  const sectionNames = scopeSectionNames(scope, packageId)

  // Anchors stay exactly as they were on a single-package quote; a package
  // qualifies them so two sections called "Materials" scroll to their own card.
  const sectionAnchor = (name: string) =>
    packageId ? `section:${packageId}:${name}` : `section:${name}`

  /** Rewrite the section order this editor owns — the package's, or the scope's. */
  const setSections = (fn: (names: string[]) => string[]) =>
    onChange((s) =>
      packageId
        ? {
            ...s,
            packages: s.packages.map((p) =>
              p.id === packageId ? { ...p, sections: fn(p.sections) } : p,
            ),
          }
        : { ...s, sections: fn(s.sections) },
    )

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

  // A move rewrites where the line lives and nothing else — same id, same
  // price, same markup override, same supplier note.
  const moveLine = (id: string, target: MoveTarget) =>
    updateLine(id, { section: target.section, packageId: target.packageId })

  // Every section a line could move to: this editor's own sections first, then
  // the other packages' (and the not-in-any-package bucket) when the quote has
  // packages, so a line can cross a package boundary without being retyped.
  const sectionsOf = (ofPackage: string | null) => scopeSectionNames(scope, ofPackage)

  const otherBuckets: { packageId: string | null; label: string }[] = scope.packages.length
    ? [
        ...scope.packages
          .filter((p) => p.id !== packageId)
          .map((p) => ({ packageId: p.id as string | null, label: p.label || 'Package' })),
        ...(packageId === null ? [] : [{ packageId: null, label: 'Not in any package' }]),
      ]
    : []

  const moveTargetsFor = (line: ScopeLine): MoveTarget[] => [
    ...sectionNames
      .filter((n) => n !== line.section)
      .map((n) => ({ id: `${packageId ?? ''}:${n}`, section: n, packageId, packageLabel: null })),
    ...otherBuckets.flatMap((b) =>
      sectionsOf(b.packageId).map((n) => ({
        id: `${b.packageId ?? ''}:${n}`,
        section: n,
        packageId: b.packageId,
        packageLabel: b.label,
      })),
    ),
  ]

  // Landed cost drives the sell price (cost × markup) until someone types
  // their own price — after that the typed price stands until it's reset.
  const setCost = (line: ScopeLine, costR: number) =>
    updateLine(line.id, {
      unitCostR: costR,
      ...(line.sellOverridden ? {} : { unitSellR: round2(costR * pricing.markup) }),
    })

  // Typing a markup % re-derives the sell price from landed cost. Landing back
  // on the house rate hands the line to auto-pricing again, so a later cost
  // change still flows through.
  const setMarkupPct = (line: ScopeLine, pct: number) =>
    updateLine(line.id, {
      unitSellR: round2(line.unitCostR * (1 + pct / 100)),
      sellOverridden: Math.abs(1 + pct / 100 - pricing.markup) > 0.0001,
    })

  const resetSell = (line: ScopeLine) =>
    updateLine(line.id, {
      unitSellR: round2(line.unitCostR * pricing.markup),
      sellOverridden: false,
    })

  const addFreeLine = (section: string, kind: 'material' | 'fee') =>
    onChange((s) => ({ ...s, lines: [...s.lines, newScopeLine(section, kind, packageId)] }))

  const addCatalogLine = (section: string, item: CatalogPick) =>
    onChange((s) => ({
      ...s,
      lines: [
        ...s.lines,
        {
          ...newScopeLine(section, 'material', packageId),
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
          ...newScopeLine(section, 'material', packageId),
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
    setSections(() => {
      // Reorders the DISPLAYED order, which folds any straggler section into
      // the declared list — where it should have been all along.
      const order = [...sectionNames]
      const i = order.indexOf(name)
      const j = i + dir
      if (i < 0 || j < 0 || j >= order.length) return order
      const swap = order[i]
      order[i] = order[j]
      order[j] = swap
      return order
    })

  const removeSection = (name: string) => setSections((names) => names.filter((n) => n !== name))

  /**
   * Rename a section — the heading AND every line filed under it, in one edit
   * (renameScopeSection). Nothing about a line changes but the name it sits
   * under: same id, same price, same override, same supplier note.
   *
   * Refused when the new name is blank or already another section's here —
   * that would merge two sections' lines under one heading with no undo. The
   * refusal is reported so the header can put the old name back and say why.
   */
  const renameSection = (from: string, to: string): boolean => {
    let ok = true
    onChange((s) => {
      const next = renameScopeSection(s, packageId, from, to)
      if (!next) { ok = false; return s }
      return next
    })
    if (!ok) {
      setRenameError({
        section: from,
        message: to.trim()
          ? `This quote already has a section called "${to.trim()}".`
          : 'A section needs a name.',
      })
      return false
    }
    setRenameError(null)
    // Keep an open DB builder pointed at the section it was opened on.
    setDbSection((cur) => (cur === from ? to.trim() : cur))
    return true
  }

  const savePreset = (section: string, name: string) =>
    presets.save(name, sectionToPreset(scope, packageId, section))

  /**
   * Drop a saved section in whole. It lands as its own section rather than
   * merging into a same-named one already here — two 12-way boards is two
   * boards, the same rule the packages model runs on.
   */
  const addPresetSection = (preset: ScopeSectionPreset) => {
    const name = presetSectionName(preset.payload, sectionNames, preset.name)
    onChange((s) => ({
      ...s,
      ...(packageId
        ? {
            packages: s.packages.map((p) =>
              p.id === packageId && !p.sections.includes(name)
                ? { ...p, sections: [...p.sections, name] }
                : p,
            ),
          }
        : { sections: s.sections.includes(name) ? s.sections : [...s.sections, name] }),
      lines: [...s.lines, ...presetToScopeLines(preset.payload, name, packageId, pricing.markup)],
    }))
  }

  const addNamedSection = (raw: string) => {
    const name = raw.trim()
    if (!name) return
    setSections((names) => (names.includes(name) ? names : [...names, name]))
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
      data-issue-anchor={packageId ? undefined : 'sections'}
      style={{ '--scope-cols': cols.template } as CSSProperties}
    >
      {sectionNames.map((name, idx) => {
        const lines = scope.lines.filter((l) => mine(l) && l.section === name)
        const counted = lines.filter((l) => !l.optional && l.unitSellR > 0 && l.qty > 0)
        const subtotal = counted.reduce((t, l) => t + round2(l.unitSellR * l.qty), 0)
        // Landed cost behind the counted lines — margin is what's left of the sell.
        const costTotal = counted.reduce((t, l) => t + round2(l.unitCostR * l.qty), 0)
        const marginPct = subtotal > 0 && costTotal > 0
          ? ((subtotal - costTotal) / subtotal) * 100
          : null
        return (
          <Card key={name} data-issue-anchor={sectionAnchor(name)}>
            <CardContent className="@container space-y-3 pt-6">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <SectionName name={name} onRename={(to) => renameSection(name, to)} />
                  {lines.length > 0 && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {lines.length} line{lines.length === 1 ? '' : 's'} · {rand(round2(subtotal))}
                      {costTotal > 0 && (
                        <> · cost {rand(round2(costTotal))}
                          {marginPct !== null && ` · margin ${marginPct.toFixed(1)}%`}</>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {lines.length > 0 && (
                    <SavePresetButton
                      defaultName={name}
                      lineCount={lines.length}
                      onSave={(presetName) => savePreset(name, presetName)}
                    />
                  )}
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => moveSection(name, -1)} disabled={idx === 0} title="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => moveSection(name, 1)} disabled={idx === sectionNames.length - 1} title="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  {lines.length === 0 && declaredSections.includes(name) && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => removeSection(name)} title="Remove empty section">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {renameError?.section === name && (
                <p className="text-[11px] font-medium text-destructive">{renameError.message}</p>
              )}

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
                      {col.width !== null && col.key !== 'bin' && col.key !== 'move' && (
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
                      <div
                        className="flex h-8 items-center justify-end text-right text-xs tabular-nums text-muted-foreground"
                        title="Landed cost x qty — what this line costs the business"
                      >
                        {line.unitCostR > 0 && line.qty > 0 ? rand(round2(line.unitCostR * line.qty)) : '—'}
                      </div>
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
                      <MarkupCell
                        line={line}
                        houseMarkup={pricing.markup}
                        onMarkupPct={(pct) => setMarkupPct(line, pct)}
                        onReset={() => resetSell(line)}
                      />
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
                      <div className="justify-self-end">
                        <LineMovePicker
                          targets={moveTargetsFor(line)}
                          onMove={(t) => moveLine(line.id, t)}
                        />
                      </div>
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
              common one, or drop in a section you saved earlier — then add the items.
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
          <PresetPicker
            presets={presets.presets}
            loading={presets.loading}
            onPick={addPresetSection}
            onDelete={(id) => presets.remove(id)}
          />
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
          existingLines={scope.lines.filter((l) => mine(l) && l.section === dbSection)}
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
              const added = [...rebuilt.values()].map((l) => ({ ...l, packageId }))
              return { ...s, lines: [...kept, ...added] }
            })
            setDbSection(null)
          }}
        />
      )}
    </div>
  )
}
