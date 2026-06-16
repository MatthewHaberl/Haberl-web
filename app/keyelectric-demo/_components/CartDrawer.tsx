'use client'

import Link from 'next/link'
import { X, Plus, Minus, Trash2, ShoppingCart } from 'lucide-react'
import { keImg } from '../_lib/data'
import { formatZAR, inclVat, VAT_RATE } from '../_lib/format'
import { useKeCart } from '../_lib/cart'
import { StoreImage } from './StoreImage'

const BASE = '/keyelectric-demo'

export function CartDrawer() {
  const { items, isOpen, closeCart, updateQuantity, removeItem, subtotalCents, clearCart } = useKeCart()

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={closeCart}
        aria-hidden
      />

      {/* Panel */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        aria-label="Shopping cart"
      >
        <div className="flex items-center justify-between border-b border-[var(--ke-line)] px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--ke-slate)]">
            <ShoppingCart className="h-5 w-5" /> Your Cart
          </h2>
          <button onClick={closeCart} aria-label="Close cart" className="rounded p-1 hover:bg-[var(--ke-soft)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-[var(--ke-muted)]">
            <ShoppingCart className="h-12 w-12 opacity-30" />
            <p>Your cart is empty.</p>
            <Link href={`${BASE}/shop`} onClick={closeCart} className="rounded-md bg-[var(--ke-yellow)] px-4 py-2 text-sm font-semibold text-[var(--ke-slate)] hover:bg-[var(--ke-yellow-dark)]">
              Start shopping
            </Link>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="space-y-4">
                {items.map((i) => (
                  <li key={i.sku} className="flex gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded border border-[var(--ke-line)]">
                      <StoreImage src={i.img ? keImg(i.img) : ''} alt={i.name} className="object-contain p-1" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium text-[var(--ke-ink)]">{i.name}</p>
                      <p className="text-xs text-[var(--ke-muted)]">{formatZAR(i.priceCents)} ex VAT</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex items-center rounded border border-[var(--ke-line)]">
                          <button onClick={() => updateQuantity(i.sku, i.quantity - 1)} className="px-2 py-1 hover:bg-[var(--ke-soft)]" aria-label="Decrease quantity"><Minus className="h-3 w-3" /></button>
                          <span className="w-8 text-center text-sm">{i.quantity}</span>
                          <button onClick={() => updateQuantity(i.sku, i.quantity + 1)} className="px-2 py-1 hover:bg-[var(--ke-soft)]" aria-label="Increase quantity"><Plus className="h-3 w-3" /></button>
                        </div>
                        <button onClick={() => removeItem(i.sku)} className="text-[var(--ke-muted)] hover:text-red-600" aria-label="Remove item"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[var(--ke-slate)]">{formatZAR(i.priceCents * i.quantity)}</span>
                  </li>
                ))}
              </ul>
              <button onClick={clearCart} className="mt-4 text-xs text-[var(--ke-muted)] underline hover:text-red-600">Clear cart</button>
            </div>

            {/* Totals */}
            <div className="border-t border-[var(--ke-line)] px-5 py-4">
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-[var(--ke-muted)]">Subtotal (ex VAT)</dt><dd>{formatZAR(subtotalCents)}</dd></div>
                <div className="flex justify-between"><dt className="text-[var(--ke-muted)]">VAT ({Math.round(VAT_RATE * 100)}%)</dt><dd>{formatZAR(inclVat(subtotalCents) - subtotalCents)}</dd></div>
                <div className="flex justify-between border-t border-[var(--ke-line)] pt-1 text-base font-bold text-[var(--ke-slate)]"><dt>Total</dt><dd>{formatZAR(inclVat(subtotalCents))}</dd></div>
              </dl>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link href={`${BASE}/cart`} onClick={closeCart} className="rounded-md border border-[var(--ke-slate)] py-2.5 text-center text-sm font-semibold text-[var(--ke-slate)] hover:bg-[var(--ke-soft)]">View Cart</Link>
                <Link href={`${BASE}/cart`} onClick={closeCart} className="rounded-md bg-[var(--ke-yellow)] py-2.5 text-center text-sm font-bold text-[var(--ke-slate)] hover:bg-[var(--ke-yellow-dark)]">Checkout</Link>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
