'use client'

import { useState, useMemo } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ProductCard } from './ProductCard'
import type { Product } from '@/types/database'

const CATEGORIES = [
  { value: '', label: 'All products' },
  { value: 'inverter', label: 'Inverters' },
  { value: 'battery', label: 'Batteries' },
  { value: 'panel', label: 'Solar Panels' },
  { value: 'other', label: 'Components' },
]

interface Props {
  products: Product[]
}

export function ProductGrid({ products }: Props) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const brands = useMemo(() => {
    const all = products.map(p => p.brand).filter(Boolean) as string[]
    return Array.from(new Set(all)).sort()
  }, [products])

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (category && p.category !== category) return false
      if (brand && p.brand !== brand) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? '').toLowerCase().includes(q) ||
          (p.brand ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [products, category, brand, search])

  const activeFilterCount = [category, brand].filter(Boolean).length

  return (
    <div className="flex flex-col gap-4">
      {/* Search + filter bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name, SKU, or brand…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowFilters(v => !v)}
          className="relative"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Category pills (always visible) */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              category === c.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-muted'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Expanded filters */}
      {showFilters && (
        <div className="bg-muted rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Filter by brand</p>
            {brand && (
              <button onClick={() => setBrand('')} className="text-xs text-accent hover:underline">
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {brands.map(b => (
              <button
                key={b}
                onClick={() => setBrand(brand === b ? '' : b)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  brand === b
                    ? 'bg-accent text-accent-foreground border-accent'
                    : 'bg-card border-border hover:bg-muted-foreground/10'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active filters summary */}
      {(category || brand) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Active filters:</span>
          {category && (
            <Badge variant="accent" className="gap-1 cursor-pointer" onClick={() => setCategory('')}>
              {CATEGORIES.find(c => c.value === category)?.label}
              <X className="h-3 w-3" />
            </Badge>
          )}
          {brand && (
            <Badge variant="accent" className="gap-1 cursor-pointer" onClick={() => setBrand('')}>
              {brand}
              <X className="h-3 w-3" />
            </Badge>
          )}
        </div>
      )}

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        {filtered.length} product{filtered.length !== 1 ? 's' : ''} found
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="font-medium">No products match your search</p>
          <button
            onClick={() => { setSearch(''); setCategory(''); setBrand('') }}
            className="text-sm text-accent hover:underline mt-2"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(product => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  )
}
