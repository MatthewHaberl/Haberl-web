'use client'

import { useMemo, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { products, categories, priceBands, productsByCategory } from '../_lib/data'
import { ProductCard } from './ProductCard'

type Sort = 'featured' | 'price-asc' | 'price-desc' | 'name'

interface Props {
  initialCategory: string
  initialBrand: string
  initialQuery: string
  initialSale: boolean
}

export function ShopBrowser({ initialCategory, initialBrand, initialQuery, initialSale }: Props) {
  const [category, setCategory] = useState(initialCategory)
  const [selBrands, setSelBrands] = useState<string[]>(initialBrand ? [initialBrand] : [])
  const [bandIdx, setBandIdx] = useState<number | null>(null)
  const [saleOnly, setSaleOnly] = useState(initialSale)
  const [sort, setSort] = useState<Sort>('featured')
  const [mobileOpen, setMobileOpen] = useState(false)

  const query = initialQuery

  const brandList = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).sort() as string[],
    [],
  )

  const filtered = useMemo(() => {
    let list = products
    if (category) list = list.filter((p) => p.categorySlug === category)
    if (selBrands.length) list = list.filter((p) => p.brand && selBrands.includes(p.brand))
    if (bandIdx != null) {
      const b = priceBands[bandIdx]
      list = list.filter((p) => p.priceCents >= b.min && p.priceCents <= b.max)
    }
    if (saleOnly) list = list.filter((p) => p.onSale)
    if (query) {
      const q = query.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.brand?.toLowerCase().includes(q) ?? false),
      )
    }
    const sorted = [...list]
    if (sort === 'price-asc') sorted.sort((a, b) => a.priceCents - b.priceCents)
    else if (sort === 'price-desc') sorted.sort((a, b) => b.priceCents - a.priceCents)
    else if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    return sorted
  }, [category, selBrands, bandIdx, saleOnly, query, sort])

  const title = category
    ? categories.find((c) => c.slug === category)?.name ?? 'Products'
    : query
      ? `Results for “${query}”`
      : saleOnly
        ? 'In-Store Specials'
        : 'All Products'

  const hasFilters = Boolean(category) || selBrands.length > 0 || bandIdx != null || saleOnly

  function toggleBrand(b: string) {
    setSelBrands((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]))
  }
  function clearAll() {
    setCategory('')
    setSelBrands([])
    setBandIdx(null)
    setSaleOnly(false)
  }

  const filters = (
    <div className="space-y-6">
      {/* Categories */}
      <FilterBlock title="Categories">
        <button
          onClick={() => setCategory('')}
          className={`block w-full text-left text-sm ${!category ? 'font-bold text-[var(--ke-yellow-dark)]' : 'text-[var(--ke-slate)] hover:text-[var(--ke-yellow-dark)]'}`}
        >
          All Products <span className="text-[var(--ke-muted)]">({products.length})</span>
        </button>
        {categories.map((c) => {
          const n = productsByCategory(c.slug).length
          return (
            <button
              key={c.slug}
              onClick={() => setCategory(c.slug)}
              className={`block w-full text-left text-sm ${category === c.slug ? 'font-bold text-[var(--ke-yellow-dark)]' : 'text-[var(--ke-slate)] hover:text-[var(--ke-yellow-dark)]'}`}
            >
              {c.name} <span className="text-[var(--ke-muted)]">({n})</span>
            </button>
          )
        })}
      </FilterBlock>

      {/* Price */}
      <FilterBlock title="Price">
        {priceBands.map((b, i) => (
          <label key={b.label} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ke-slate)]">
            <input
              type="radio"
              name="price"
              checked={bandIdx === i}
              onChange={() => setBandIdx(i)}
              className="accent-[var(--ke-yellow-dark)]"
            />
            {b.label}
          </label>
        ))}
        {bandIdx != null && (
          <button onClick={() => setBandIdx(null)} className="text-xs text-[var(--ke-muted)] underline">Clear price</button>
        )}
      </FilterBlock>

      {/* Brand */}
      <FilterBlock title="Brand">
        <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
          {brandList.map((b) => (
            <label key={b} className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ke-slate)]">
              <input type="checkbox" checked={selBrands.includes(b)} onChange={() => toggleBrand(b)} className="accent-[var(--ke-yellow-dark)]" />
              {b}
            </label>
          ))}
        </div>
      </FilterBlock>

      {/* Specials */}
      <FilterBlock title="Offers">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--ke-slate)]">
          <input type="checkbox" checked={saleOnly} onChange={(e) => setSaleOnly(e.target.checked)} className="accent-[var(--ke-yellow-dark)]" />
          On sale only
        </label>
      </FilterBlock>

      {hasFilters && (
        <button onClick={clearAll} className="w-full rounded-md border border-[var(--ke-line)] py-2 text-sm font-semibold text-[var(--ke-slate)] hover:bg-[var(--ke-soft)]">
          Clear all filters
        </button>
      )}
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 pb-10">
      <h1 className="mb-1 text-2xl font-extrabold text-[var(--ke-slate)]">{title}</h1>
      <p className="mb-5 text-sm text-[var(--ke-muted)]">{filtered.length} product{filtered.length === 1 ? '' : 's'}</p>

      <div className="flex gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block">{filters}</aside>

        {/* Main */}
        <div className="min-w-0 flex-1">
          {/* Toolbar */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex items-center gap-2 rounded-md border border-[var(--ke-line)] px-3 py-2 text-sm font-medium lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </button>
            <div className="ml-auto flex items-center gap-2">
              <label className="text-sm text-[var(--ke-muted)]">Sort:</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="rounded-md border border-[var(--ke-line)] bg-white px-3 py-2 text-sm outline-none"
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="name">Name: A–Z</option>
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--ke-line)] py-20 text-center text-[var(--ke-muted)]">
              No products match these filters.
              <button onClick={clearAll} className="mt-2 block w-full font-semibold text-[var(--ke-yellow-dark)] underline">Clear filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => (
                <ProductCard key={p.sku} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-80 max-w-[85%] overflow-y-auto bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--ke-slate)]">Filters</h2>
              <button onClick={() => setMobileOpen(false)} aria-label="Close filters"><X className="h-5 w-5" /></button>
            </div>
            {filters}
            <button onClick={() => setMobileOpen(false)} className="mt-6 w-full rounded-md bg-[var(--ke-yellow)] py-2.5 font-bold text-[var(--ke-slate)]">
              Show {filtered.length} results
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 border-b border-[var(--ke-line)] pb-1.5 text-sm font-bold uppercase tracking-wide text-[var(--ke-slate)]">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}
