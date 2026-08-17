'use client'

import { useState } from 'react'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { addPendingCatalogItem, byCategory } from './useCatalog'
import { SearchableSelect } from './section-ui'

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
  const inCategory = [...byCategory(items, category), ...created.filter((c) => !items.some((i) => i.id === c.id))]
  // A product already chosen always stays visible, even when it sits outside this
  // picker's category (a board device labelled one way holding a part filed under
  // another). Without this the control reads "Select…" over a product that IS set
  // — it looks like the pick was lost when it wasn't.
  const chosenOutside = value && !isCustomValue(value) && !inCategory.some((o) => o.id === value)
    ? items.find((i) => i.id === value)
    : undefined
  const options = chosenOutside ? [...inCategory, chosenOutside] : inCategory
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

  // Map catalog items + the custom-add affordance into SearchableSelect options. The
  // " (to add)" suffix marks freshly-created pending rows; the "+ Custom…" row keeps the
  // CUSTOM_PREFIX sentinel so its onChange branch mirrors the old native-select flow.
  // When a custom label is already selected, the affordance row reads " (pending)" so the
  // closed control shows the placeholder name rather than a bare "+ Custom…".
  // The SKU rides along as `hint` (shown beside each row) and in `search`, with the
  // brand, so a part number typed off a supplier quote finds the product.
  const selectOptions = [
    ...options.map((o) => ({
      value: o.id,
      label: `${o.description}${o.pending ? ' (to add)' : ''}`,
      hint: o.sku || undefined,
      search: [o.sku, o.brand].filter(Boolean).join(' '),
    })),
    // Pinned: this row sits last, and the picker only builds the first ~50 matches —
    // without it a big category (protection is ~2,200 rows) would lose the quick-add.
    { value: CUSTOM_PREFIX, label: custom ? `${customLabel(value)} (pending)` : '+ Custom…', pinned: true },
  ]

  return (
    <label className={`flex flex-col gap-0.5 ${className}`}>
      {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
      <SearchableSelect
        value={custom ? CUSTOM_PREFIX : value}
        onChange={(v) => {
          if (v === CUSTOM_PREFIX) {
            // Defer emitting until a label is typed + confirmed; keep onChange(id|null) clean.
            setDraft('')
            setEditingCustom(true)
            return
          }
          setEditingCustom(false)
          onChange(v)
        }}
        options={selectOptions}
        noneLabel={noneLabel}
      />
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
