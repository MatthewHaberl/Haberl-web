'use client'

import { useState } from 'react'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { addPendingCatalogItem, byCategory } from './useCatalog'

/** Sentinel prefix for a custom "to-add" placeholder selection. The picker's
 *  `onChange` still emits `string | null` (the catalog id contract is unchanged),
 *  but a custom quick-add yields `custom:<label>` instead of a real catalog id.
 *  Item 49: the label is a placeholder the designer types NOW; it's flagged for
 *  later via the `pending` catalog column (migration 049). */
export const CUSTOM_PREFIX = 'custom:'

/** True when a picker value is a custom placeholder rather than a catalog id. */
export function isCustomValue(value: string | null): value is string {
  return typeof value === 'string' && value.startsWith(CUSTOM_PREFIX)
}

/** Strip the sentinel to the human label, e.g. `custom:indicator light` → `indicator light`. */
export function customLabel(value: string | null): string {
  return isCustomValue(value) ? value.slice(CUSTOM_PREFIX.length) : ''
}

/** Build a custom sentinel value from a typed label. Returns null for empty input. */
export function makeCustomValue(label: string): string | null {
  const trimmed = label.trim()
  return trimmed ? `${CUSTOM_PREFIX}${trimmed}` : null
}

/** Pick a catalog product of a category, or "None". Catalog is loaded once by the
 *  parent section and passed in, so many pickers don't each refetch.
 *  A "+ Custom…" choice lets the user type a placeholder name while designing; the
 *  selection becomes a `custom:<label>` sentinel (see CUSTOM_PREFIX) so it can be
 *  flagged for later catalog entry. */
export function ProductPicker({
  items, category, value, onChange, label, noneLabel = 'None', className = '',
}: {
  items: EquipmentCatalogItem[]
  category: EquipmentCatalogItem['category']
  value: string | null
  onChange: (id: string | null) => void
  label?: string
  noneLabel?: string
  className?: string
}) {
  // Pending rows this picker just created (migration 049) so a freshly quick-added
  // placeholder shows in the list immediately, before the parent catalog refetches.
  const [created, setCreated] = useState<EquipmentCatalogItem[]>([])
  const options = [...byCategory(items, category), ...created.filter((c) => !items.some((i) => i.id === c.id))]
  // When the current value is a custom placeholder, show the label entry inline so
  // the designer can edit it; also opened by picking the "+ Custom…" option.
  const [editingCustom, setEditingCustom] = useState(false)
  const [draft, setDraft] = useState('')
  const custom = isCustomValue(value)
  const showCustomInput = custom || editingCustom
  // While the inline input is open, prefer the locally-typed draft so the optimistic
  // label survives even after we swap onChange to a real catalog id.
  const inputValue = editingCustom ? draft : customLabel(value)

  // Confirm a typed custom label: promote it to a real `pending` catalog row and emit
  // the returned id. Falls back to the `custom:<label>` sentinel if the insert is
  // blocked (e.g. migration 049 not yet applied) so no design data is lost.
  const confirmCustom = async () => {
    const trimmed = draft.trim()
    if (!trimmed) { setEditingCustom(false); return }
    const id = await addPendingCatalogItem(trimmed, category)
    if (id) {
      // Surface the new pending row locally and select it.
      setCreated((prev) => [
        ...prev,
        { id, category, brand: 'TBD', sku: '', description: trimmed,
          watts_ac: null, watts_dc: null, kwh: null, phase: 'any', cost_rands: 0,
          isc_amps: null, voc_volts: null, active: false, sort_order: 0, notes: null, pending: true },
      ])
      setEditingCustom(false)
      onChange(id)
    } else {
      // Keep the inline placeholder via the sentinel.
      onChange(makeCustomValue(trimmed))
    }
  }

  return (
    <label className={`flex flex-col gap-0.5 ${className}`}>
      {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
      <select
        value={custom ? CUSTOM_PREFIX : (value ?? '')}
        onChange={(e) => {
          const v = e.target.value
          if (v === CUSTOM_PREFIX) {
            // Defer emitting until a label is typed + confirmed; keep onChange(id|null) clean.
            setDraft('')
            setEditingCustom(true)
            return
          }
          setEditingCustom(false)
          onChange(v === '' ? null : v)
        }}
        className="h-7 rounded border border-border bg-background px-1.5 text-[11px]"
      >
        <option value="">{noneLabel}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.description}{o.pending ? ' (to add)' : ''}</option>)}
        <option value={CUSTOM_PREFIX}>+ Custom…</option>
      </select>
      {showCustomInput && (
        <input
          type="text"
          autoFocus
          value={inputValue}
          placeholder="e.g. indicator light"
          onChange={(e) => {
            // Optimistically show the typed label; while editing, hold it in the draft
            // and emit a sentinel so the design carries the label until confirmed.
            if (editingCustom) { setDraft(e.target.value); onChange(makeCustomValue(e.target.value)) }
            else onChange(makeCustomValue(e.target.value))
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void confirmCustom() } }}
          onBlur={(e) => {
            if (!e.target.value.trim()) setEditingCustom(false)
            else if (editingCustom) void confirmCustom()
          }}
          className="h-7 rounded border border-border bg-background px-1.5 text-[11px]"
        />
      )}
    </label>
  )
}
