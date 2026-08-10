'use client'

// Section + line-item editor for the scope builder (W97). Sections render in
// scope.sections order; lines live under their section. Catalog picks price at
// cost × markup; typing a price overrides it (sellOverridden). Unpriced lines
// show the same amber "Quote" treatment as the solar BOM panel.

import { useState, type Dispatch, type SetStateAction } from 'react'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  newScopeLine, type QuoteScope, type ScopeLine, type ScopeLineUnit,
} from '@/lib/quotes/scope'
import { CatalogSearch, type CatalogPick } from './CatalogSearch'
import type { ScopePricing } from './ScopeWorkspace'

const round2 = (n: number) => Math.round(n * 100) / 100
const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const UNITS: ScopeLineUnit[] = ['ea', 'm', 'hr', 'job']

export function ScopeEditor({ scope, onChange, pricing }: {
  scope: QuoteScope
  onChange: Dispatch<SetStateAction<QuoteScope>>
  pricing: ScopePricing
}) {
  const [newSection, setNewSection] = useState('')

  // Display order: declared sections first, then any stragglers lines reference.
  const sectionNames = [...scope.sections]
  for (const line of scope.lines) {
    if (line.section && !sectionNames.includes(line.section)) sectionNames.push(line.section)
  }

  const updateLine = (id: string, patch: Partial<ScopeLine>) =>
    onChange((s) => ({
      ...s,
      lines: s.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }))

  const removeLine = (id: string) =>
    onChange((s) => ({ ...s, lines: s.lines.filter((l) => l.id !== id) }))

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

  const addSection = () => {
    const name = newSection.trim()
    if (!name) return
    setNewSection('')
    onChange((s) => (s.sections.includes(name) ? s : { ...s, sections: [...s.sections, name] }))
  }

  return (
    <div className="space-y-4">
      {sectionNames.map((name, idx) => {
        const lines = scope.lines.filter((l) => l.section === name)
        const subtotal = lines
          .filter((l) => !l.optional && l.unitSellR > 0 && l.qty > 0)
          .reduce((t, l) => t + round2(l.unitSellR * l.qty), 0)
        return (
          <Card key={name}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{name}</span>
                  {lines.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {lines.length} line{lines.length === 1 ? '' : 's'} · {rand(round2(subtotal))}
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

              {lines.map((line) => (
                <div key={line.id} className="rounded-md border border-border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-[200px] flex-1">
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(line.id, { description: e.target.value })}
                        placeholder={line.kind === 'fee' ? 'Fee description (e.g. Inspection fee)' : 'Item description'}
                        className="h-9"
                      />
                      {line.sku && (
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{line.sku}</div>
                      )}
                    </div>
                    <Input
                      type="number" min={0} step="any"
                      value={line.qty === 0 ? '' : String(line.qty)}
                      onChange={(e) => updateLine(line.id, { qty: Math.max(0, Number(e.target.value) || 0) })}
                      className="h-9 w-20" placeholder="Qty"
                    />
                    <Select
                      value={line.unit}
                      onChange={(e) => updateLine(line.id, { unit: e.target.value as ScopeLineUnit })}
                      className="h-9 w-20"
                    >
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </Select>
                    <Input
                      type="number" min={0} step="any"
                      leadingText="R"
                      value={line.unitSellR === 0 ? '' : String(line.unitSellR)}
                      onChange={(e) => updateLine(line.id, {
                        unitSellR: Math.max(0, Number(e.target.value) || 0),
                        sellOverridden: line.catalogId !== null,
                      })}
                      className="h-9 w-32" placeholder="Unit price"
                    />
                    {line.sellOverridden && line.catalogId && (
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        title={`Reset to cost × markup (${rand(round2(line.unitCostR * pricing.markup))})`}
                        onClick={() => updateLine(line.id, {
                          unitSellR: round2(line.unitCostR * pricing.markup),
                          sellOverridden: false,
                        })}>
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {line.unitSellR <= 0
                        ? <Badge variant="warning">Quote</Badge>
                        : <span className="text-sm font-medium">{rand(round2(line.unitSellR * line.qty))}</span>}
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => removeLine(line.id)} title="Remove line">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                    {line.kind === 'fee' && <Badge variant="outline">fee</Badge>}
                    <label className="flex cursor-pointer items-center gap-1">
                      <input
                        type="checkbox"
                        checked={line.optional}
                        onChange={(e) => updateLine(line.id, { optional: e.target.checked })}
                      />
                      Optional extra (excluded from the total)
                    </label>
                    {line.catalogId && line.unitCostR > 0 && <span>cost {rand(line.unitCostR)}</span>}
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[240px] flex-1">
                  <CatalogSearch onPick={(item) => addCatalogLine(name, item)} />
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => addFreeLine(name, 'material')}>
                  <Plus className="h-3.5 w-3.5" /> Free-text item
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addFreeLine(name, 'fee')}>
                  <Plus className="h-3.5 w-3.5" /> Fee
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}

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
    </div>
  )
}
