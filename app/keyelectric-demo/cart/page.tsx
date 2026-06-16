'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Trash2, Plus, Minus, ArrowLeft, ShoppingCart, Info } from 'lucide-react'
import { keImg } from '../_lib/data'
import { formatZAR, inclVat, VAT_RATE } from '../_lib/format'
import { useKeCart } from '../_lib/cart'
import { StoreImage } from '../_components/StoreImage'
import { Breadcrumb } from '../_components/Breadcrumb'

const BASE = '/keyelectric-demo'

export default function CartPage() {
  const { items, updateQuantity, removeItem, subtotalCents, clearCart } = useKeCart()
  const [checkedOut, setCheckedOut] = useState(false)

  return (
    <div>
      <Breadcrumb trail={[{ label: 'Cart' }]} />
      <div className="mx-auto max-w-7xl px-4 pb-14">
        <h1 className="mb-6 text-2xl font-extrabold text-[var(--ke-slate)]">Your Cart</h1>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-[var(--ke-line)] py-20 text-center">
            <ShoppingCart className="h-14 w-14 text-gray-300" />
            <p className="text-[var(--ke-muted)]">Your cart is empty.</p>
            <Link href={`${BASE}/shop`} className="rounded-md bg-[var(--ke-yellow)] px-6 py-3 font-bold text-[var(--ke-slate)] hover:bg-[var(--ke-yellow-dark)]">
              Browse products
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Items */}
            <div className="lg:col-span-2">
              <div className="overflow-hidden rounded-lg border border-[var(--ke-line)]">
                {items.map((i, idx) => (
                  <div key={i.sku} className={`flex gap-4 p-4 ${idx > 0 ? 'border-t border-[var(--ke-line)]' : ''}`}>
                    <Link href={`${BASE}/product/${i.slug}`} className="h-20 w-20 shrink-0 overflow-hidden rounded border border-[var(--ke-line)]">
                      <StoreImage src={i.img ? keImg(i.img) : ''} alt={i.name} className="object-contain p-1.5" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`${BASE}/product/${i.slug}`} className="line-clamp-2 text-sm font-medium text-[var(--ke-ink)] hover:text-[var(--ke-yellow-dark)]">{i.name}</Link>
                      <p className="mt-0.5 font-mono text-xs text-[var(--ke-muted)]">{i.sku}</p>
                      <p className="text-xs text-[var(--ke-muted)]">{formatZAR(i.priceCents)} ex VAT each</p>
                      <button onClick={() => removeItem(i.sku)} className="mt-2 flex items-center gap-1 text-xs text-[var(--ke-muted)] hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                    <div className="flex flex-col items-end justify-between">
                      <div className="flex items-center rounded border border-[var(--ke-line)]">
                        <button onClick={() => updateQuantity(i.sku, i.quantity - 1)} className="px-2 py-1.5 hover:bg-[var(--ke-soft)]" aria-label="Decrease"><Minus className="h-3 w-3" /></button>
                        <span className="w-9 text-center text-sm">{i.quantity}</span>
                        <button onClick={() => updateQuantity(i.sku, i.quantity + 1)} className="px-2 py-1.5 hover:bg-[var(--ke-soft)]" aria-label="Increase"><Plus className="h-3 w-3" /></button>
                      </div>
                      <span className="font-bold text-[var(--ke-slate)]">{formatZAR(i.priceCents * i.quantity)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-between">
                <Link href={`${BASE}/shop`} className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ke-slate)] hover:text-[var(--ke-yellow-dark)]">
                  <ArrowLeft className="h-4 w-4" /> Continue shopping
                </Link>
                <button onClick={clearCart} className="text-sm text-[var(--ke-muted)] underline hover:text-red-600">Clear cart</button>
              </div>
            </div>

            {/* Summary */}
            <div className="h-fit rounded-lg border border-[var(--ke-line)] p-5">
              <h2 className="mb-4 text-lg font-bold text-[var(--ke-slate)]">Order Summary</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-[var(--ke-muted)]">Subtotal (ex VAT)</dt><dd>{formatZAR(subtotalCents)}</dd></div>
                <div className="flex justify-between"><dt className="text-[var(--ke-muted)]">VAT ({Math.round(VAT_RATE * 100)}%)</dt><dd>{formatZAR(inclVat(subtotalCents) - subtotalCents)}</dd></div>
                <div className="flex justify-between"><dt className="text-[var(--ke-muted)]">Delivery</dt><dd className="text-[var(--ke-muted)]">Calculated at checkout</dd></div>
                <div className="flex justify-between border-t border-[var(--ke-line)] pt-2 text-lg font-extrabold text-[var(--ke-slate)]"><dt>Total</dt><dd>{formatZAR(inclVat(subtotalCents))}</dd></div>
              </dl>
              <button onClick={() => setCheckedOut(true)} className="mt-5 w-full rounded-md bg-[var(--ke-yellow)] py-3 font-bold text-[var(--ke-slate)] hover:bg-[var(--ke-yellow-dark)]">
                Proceed to Checkout
              </button>
              {checkedOut && (
                <p className="mt-3 flex items-start gap-2 rounded-md bg-[var(--ke-soft)] p-3 text-xs text-[var(--ke-muted)]">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  This is a sandbox demo — checkout and payment are disabled. On the live site this is where PayFast / EFT checkout would run.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
