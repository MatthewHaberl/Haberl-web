'use client'

import { useState } from 'react'
import { Minus, Plus, ShoppingCart } from 'lucide-react'
import { useKeCart } from '../_lib/cart'
import type { KeProduct } from '../_lib/data'

export function AddToCart({ product }: { product: KeProduct }) {
  const { addItem } = useKeCart()
  const [qty, setQty] = useState(1)

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center rounded-md border border-[var(--ke-line)]">
        <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-3 hover:bg-[var(--ke-soft)]" aria-label="Decrease quantity">
          <Minus className="h-4 w-4" />
        </button>
        <input
          value={qty}
          onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
          inputMode="numeric"
          className="w-12 border-x border-[var(--ke-line)] py-3 text-center text-sm outline-none"
          aria-label="Quantity"
        />
        <button onClick={() => setQty((q) => q + 1)} className="px-3 py-3 hover:bg-[var(--ke-soft)]" aria-label="Increase quantity">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <button
        onClick={() =>
          addItem({ sku: product.sku, slug: product.slug, name: product.name, priceCents: product.priceCents, img: product.img }, qty)
        }
        className="flex flex-1 items-center justify-center gap-2 rounded-md bg-[var(--ke-yellow)] px-6 py-3 font-bold text-[var(--ke-slate)] transition-colors hover:bg-[var(--ke-yellow-dark)]"
      >
        <ShoppingCart className="h-5 w-5" /> Add to Cart
      </button>
    </div>
  )
}
