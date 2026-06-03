'use client'

import { ShoppingCart } from 'lucide-react'
import { useCart } from '@/lib/store/cart-context'

export function CartButton() {
  const { itemCount, openCart } = useCart()

  return (
    <button
      onClick={openCart}
      className="relative p-2 rounded-lg border border-border hover:bg-muted transition-colors"
      aria-label={`Open cart${itemCount > 0 ? ` (${itemCount} items)` : ''}`}
    >
      <ShoppingCart className="h-5 w-5" />
      {itemCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-accent text-accent-foreground text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </button>
  )
}
