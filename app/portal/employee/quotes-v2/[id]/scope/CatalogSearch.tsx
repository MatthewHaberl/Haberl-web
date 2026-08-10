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
        .select('id, sku, description, brand, category, cost_rands, supplier')
        .eq('active', true)
        .or(`description.ilike.%${safe}%,sku.ilike.%${safe}%,brand.ilike.%${safe}%`)
        .order('description')
        .limit(30)
      setResults((data ?? []) as CatalogPick[])
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
                <span className="block truncate text-sm">{r.description}</span>
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
