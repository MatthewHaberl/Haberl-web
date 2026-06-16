'use client'

import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { keImg, type KeProduct } from '../_lib/data'
import { formatZAR, inclVat } from '../_lib/format'
import { useKeCart } from '../_lib/cart'
import { StoreImage } from './StoreImage'

export function ProductCard({ product }: { product: KeProduct }) {
  const { addItem } = useKeCart()
  const src = product.img ? keImg(product.img) : ''
  const href = `/keyelectric-demo/product/${product.slug}`

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault()
    addItem({ sku: product.sku, slug: product.slug, name: product.name, priceCents: product.priceCents, img: product.img })
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-[var(--ke-line)] bg-white transition-shadow hover:shadow-lg">
      <Link href={href} className="flex flex-1 flex-col">
        {/* Image */}
        <div className="relative h-44 border-b border-[var(--ke-line)]">
          {product.onSale && (
            <span className="absolute left-2 top-2 z-10 rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              Sale
            </span>
          )}
          <StoreImage src={src} alt={product.name} className="object-contain p-4 transition-transform duration-300 group-hover:scale-105" />
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-1 p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-[var(--ke-muted)]">{product.sku}</span>
            {product.brand && (
              <span className="rounded bg-[var(--ke-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ke-slate)]">{product.brand}</span>
            )}
          </div>
          <p className="line-clamp-2 text-sm font-medium leading-snug text-[var(--ke-ink)] group-hover:text-[var(--ke-yellow-dark)]">
            {product.name}
          </p>
        </div>
      </Link>

      {/* Price + add */}
      <div className="flex items-end justify-between gap-2 px-3 pb-3">
        <div className="leading-tight">
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-extrabold text-[var(--ke-slate)]">{formatZAR(product.priceCents)}</span>
            <span className="text-[10px] font-semibold uppercase text-[var(--ke-muted)]">ex VAT</span>
          </div>
          {product.compareCents && product.compareCents > product.priceCents && (
            <span className="text-xs text-[var(--ke-muted)] line-through">{formatZAR(product.compareCents)}</span>
          )}
          <div className="text-[11px] text-[var(--ke-muted)]">{formatZAR(inclVat(product.priceCents))} incl.</div>
        </div>
        <button
          onClick={handleAdd}
          aria-label={`Add ${product.name} to cart`}
          className="shrink-0 rounded-md bg-[var(--ke-yellow)] p-2.5 text-[var(--ke-slate)] transition-colors hover:bg-[var(--ke-yellow-dark)]"
        >
          <ShoppingCart className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
