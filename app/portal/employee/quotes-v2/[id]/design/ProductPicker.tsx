'use client'

import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { byCategory } from './useCatalog'

/** Pick a catalog product of a category, or "None". Catalog is loaded once by the
 *  parent section and passed in, so many pickers don't each refetch. */
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
  const options = byCategory(items, category)
  return (
    <label className={`flex flex-col gap-0.5 ${className}`}>
      {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        className="h-7 rounded border border-border bg-background px-1.5 text-[11px]"
      >
        <option value="">{noneLabel}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.description}</option>)}
      </select>
    </label>
  )
}
