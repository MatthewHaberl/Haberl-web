'use client'

// Catalog picker for the scope builder. The solar canvas's ProductPicker loads
// the whole (small) solar catalog client-side; the scope engine reaches all
// ~15k rows, so this searches server-side instead — debounced ilike over
// description/sku/brand, 30 results.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'

export interface CatalogPick {
  id: string
  sku: string
  description: string
  brand: string
  category: string
  cost_rands: number
  supplier: string | null
  /** Discontinued by the supplier (migration 128) — pickable, but badged. */
  end_of_life?: boolean
  /** Supplier is out of stock for now (migration 130) — pickable, but badged. */
  temporarily_out_of_stock?: boolean
}

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function CatalogSearch({ onPick, placeholder = 'Search the catalog…' }: {
  onPick: (item: CatalogPick) => void
  placeholder?: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogPick[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      // Commas/parens would break the PostgREST or() filter syntax.
      const safe = q.replace(/[,()]/g, ' ').trim()
      const { data } = await supabase
        .from('equipment_catalog')
        .select('id, sku, description, brand, category, cost_rands, supplier, end_of_life, temporarily_out_of_stock')
        .eq('active', true)
        .or(`description.ilike.%${safe}%,sku.ilike.%${safe}%,brand.ilike.%${safe}%`)
        .order('description')
        .limit(30)
      // Discontinued lines stay findable — someone quoting stock on hand needs
      // them — but they sort below everything still in production.
      const rows = ((data ?? []) as CatalogPick[])
        .sort((a, b) => Number(a.end_of_life ?? false) - Number(b.end_of_life ?? false))
      setResults(rows)
      setOpen(true)
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, supabase])

  // Close on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div ref={boxRef} className="relative">
      <Input
        leadingText={<Search className="h-4 w-4" />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true) }}
        placeholder={placeholder}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-background shadow-lg">
          {results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {searching ? 'Searching…' : 'No matches — add it as a free-text line instead.'}
            </div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
              onClick={() => {
                onPick(r)
                setQuery('')
                setResults([])
                setOpen(false)
              }}
            >
              <span className="min-w-0">
                <span className="block text-sm leading-snug line-clamp-2">
                  {r.description}
                  {r.end_of_life && (
                    <span
                      className="ml-2 inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 align-middle"
                      title="Discontinued by the supplier — only quote this if you have stock on hand"
                    >
                      EOL
                    </span>
                  )}
                  {r.temporarily_out_of_stock && (
                    <span
                      className="ml-2 inline-flex items-center rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-400 align-middle"
                      title="Supplier was out of stock when the price list was loaded — check availability before you promise a date"
                    >
                      No stock
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[r.brand, r.sku, r.supplier].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="shrink-0 text-xs font-medium">
                {r.cost_rands > 0 ? rand(r.cost_rands) : 'No cost'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
