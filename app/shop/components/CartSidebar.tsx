'use client'

import { X, ShoppingCart, Trash2, Plus, Minus, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { useCart } from '@/lib/store/cart-context'
import Link from 'next/link'

export function CartSidebar() {
  const { items, totalCents, itemCount, removeItem, updateQuantity, closeCart, isOpen } = useCart()

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 transition-opacity"
          onClick={closeCart}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed top-0 right-0 h-full w-full sm:w-96 bg-card shadow-2xl z-50
        flex flex-col transition-transform duration-300
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-primary">Cart</h2>
            {itemCount > 0 && (
              <span className="bg-accent text-accent-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </div>
          <button onClick={closeCart} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 opacity-20" />
              <p className="text-sm">Your cart is empty</p>
              <Button variant="outline" size="sm" onClick={closeCart}>Browse products</Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map(item => (
                <li key={item.product_id} className="px-4 py-3 flex gap-3">
                  {/* Thumbnail */}
                  <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {item.image_url
                      ? <img src={item.image_url} alt={item.name} className="h-full w-full object-contain p-1" />
                      : <ShoppingCart className="h-5 w-5 text-muted-foreground/40" />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground font-mono truncate">{item.sku ?? '—'}</p>
                    <p className="text-sm font-medium leading-snug line-clamp-2">{item.name}</p>
                    <p className="text-sm font-bold text-primary mt-1">{formatCurrency(item.unit_price * item.quantity)}</p>
                  </div>

                  {/* Qty + delete */}
                  <div className="flex flex-col items-end justify-between shrink-0">
                    <button
                      onClick={() => removeItem(item.product_id)}
                      className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <div className="flex items-center gap-1 mt-2">
                      <button
                        onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                        className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                        className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-border p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Subtotal ({itemCount} item{itemCount !== 1 ? 's' : ''})</span>
              <span className="font-bold text-primary text-lg">{formatCurrency(totalCents)}</span>
            </div>
            <p className="text-xs text-muted-foreground">Shipping calculated at checkout</p>
            <Button variant="accent" size="lg" className="w-full" asChild>
              <Link href="/shop/checkout" onClick={closeCart}>
                Proceed to checkout <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className="w-full" onClick={closeCart}>
              Continue shopping
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
