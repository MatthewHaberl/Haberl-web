'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Search, Heart, User, ShoppingCart } from 'lucide-react'
import { categories } from '../_lib/data'
import { formatZAR } from '../_lib/format'
import { useKeCart } from '../_lib/cart'

const BASE = '/keyelectric-demo'

export function Header() {
  const router = useRouter()
  const { itemCount, subtotalCents, openCart } = useKeCart()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (cat) params.set('category', cat)
    router.push(`${BASE}/shop${params.toString() ? `?${params}` : ''}`)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--ke-line)] bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        {/* Logo */}
        <Link href={BASE} className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ke-demo-assets/logo.png" alt="Key Electric Wholesalers" className="h-10 w-auto" />
        </Link>

        {/* Search */}
        <form onSubmit={onSearch} className="hidden flex-1 md:flex">
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="rounded-l-md border border-r-0 border-[var(--ke-line)] bg-[var(--ke-soft)] px-3 py-2.5 text-sm text-[var(--ke-slate)] outline-none"
            aria-label="Search category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for products…"
            className="min-w-0 flex-1 border border-[var(--ke-line)] px-4 py-2.5 text-sm outline-none focus:border-[var(--ke-yellow)]"
          />
          <button
            type="submit"
            className="rounded-r-md bg-[var(--ke-yellow)] px-5 text-[var(--ke-slate)] transition-colors hover:bg-[var(--ke-yellow-dark)]"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>
        </form>

        {/* Account actions */}
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link href={`${BASE}/account`} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-[var(--ke-soft)]">
            <User className="h-5 w-5" />
            <span className="hidden lg:inline">My Account</span>
          </Link>
          <Link href={`${BASE}/wishlist`} className="relative rounded-md p-2 hover:bg-[var(--ke-soft)]" aria-label="Wishlist">
            <Heart className="h-5 w-5" />
          </Link>
          <button
            onClick={openCart}
            className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-[var(--ke-soft)]"
            aria-label="Open cart"
          >
            <span className="relative">
              <ShoppingCart className="h-5 w-5" />
              {itemCount > 0 && (
                <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ke-yellow)] px-1 text-[10px] font-bold text-[var(--ke-slate)]">
                  {itemCount}
                </span>
              )}
            </span>
            <span className="hidden text-left text-xs leading-tight lg:block">
              <span className="block text-[var(--ke-muted)]">Cart</span>
              <span className="block font-bold text-[var(--ke-slate)]">{formatZAR(subtotalCents)}</span>
            </span>
          </button>
        </div>
      </div>

      {/* Mobile search */}
      <form onSubmit={onSearch} className="flex px-4 pb-3 md:hidden">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search for products…"
          className="min-w-0 flex-1 rounded-l-md border border-[var(--ke-line)] px-4 py-2.5 text-sm outline-none"
        />
        <button type="submit" className="rounded-r-md bg-[var(--ke-yellow)] px-5 text-[var(--ke-slate)]" aria-label="Search">
          <Search className="h-5 w-5" />
        </button>
      </form>
    </header>
  )
}
