'use client'

import { useState, useMemo } from 'react'
import { Search, X, Zap, Battery, Sun, Package, Wrench } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ProductCard } from './ProductCard'
import type { Product } from '@/types/database'

const CATEGORIES = [
  { value: '',         label: 'All Products', Icon: Package },
  { value: 'inverter', label: 'Inverters',    Icon: Zap     },
  { value: 'battery',  label: 'Batteries',    Icon: Battery },
  { value: 'panel',    label: 'Solar Panels', Icon: Sun     },
  { value: 'other',    label: 'Components',   Icon: Wrench  },
]

interface Props {
  products: Product[]
  initialCategory?: string
  initialBrand?: string
}

export function ProductGrid({ products, initialCategory = '', initialBrand = '' }: Props) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(initialCategory)
  const [brand, setBrand] = useState(initialBrand)

  const brands = useMemo(() => {
    const all = products.map(p => p.brand).filter(Boolean) as string[]
    return Array.from(new Set(all)).sort()
  }, [products])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { '': products.length }
    for (const p of products) {
      if (p.category) counts[p.category] = (counts[p.category] ?? 0) + 1
    }
    return counts
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

  return (
    <div className="flex gap-6">
      {/* Left sidebar — desktop only */}
      <aside className="hidden lg:flex flex-col w-52 shrink-0 gap-6">
        {/* Categories */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            Categories
          </p>
          <nav className="flex flex-col gap-0.5">
            {CATEGORIES.map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setCategory(value)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left w-full ${
                  category === value
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">{label}</span>
                {categoryCounts[value] !== undefined && (
                  <span className={`text-[10px] font-mono tabular-nums ${category === value ? 'opacity-70' : 'opacity-40'}`}>
                    {categoryCounts[value]}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Brand filter */}
        {brands.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Brand</p>
              {brand && (
                <button onClick={() => setBrand('')} className="text-[10px] text-accent hover:underline">
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              {brands.map(b => (
                <button
                  key={b}
                  onClick={() => setBrand(brand === b ? '' : b)}
                  className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors text-left w-full ${
                    brand === b
                      ? 'bg-accent/10 text-accent font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${brand === b ? 'bg-accent' : 'bg-muted-foreground/30'}`} />
                  {b}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Search bar */}
        <div className="relative">
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

        {/* Category pills — mobile/tablet only (hidden on lg) */}
        <div className="flex gap-2 flex-wrap lg:hidden">
          {CATEGORIES.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => setCategory(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                category === value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Results summary */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {filtered.length} product{filtered.length !== 1 ? 's' : ''}
            {category ? ` · ${CATEGORIES.find(c => c.value === category)?.label}` : ''}
            {brand ? ` · ${brand}` : ''}
          </p>
          {(category || brand || search) && (
            <button
              onClick={() => { setSearch(''); setCategory(''); setBrand('') }}
              className="text-xs text-accent hover:underline shrink-0"
            >
              Clear all
            </button>
          )}
        </div>

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
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
