'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { CartItem } from '@/types/database'

interface CartContextValue {
  items: CartItem[]
  itemCount: number
  totalCents: number
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  removeItem: (product_id: string) => void
  updateQuantity: (product_id: string, quantity: number) => void
  clearCart: () => void
  isOpen: boolean
  openCart: () => void
  closeCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

const CART_KEY = 'haberl-cart'

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_KEY)
      if (stored) setItems(JSON.parse(stored))
    } catch {
      // ignore corrupt storage
    }
  }, [])

  const persist = useCallback((next: CartItem[]) => {
    setItems(next)
    localStorage.setItem(CART_KEY, JSON.stringify(next))
  }, [])

  const addItem = useCallback((item: Omit<CartItem, 'quantity'>) => {
    setItems(prev => {
      const existing = prev.find(i => i.product_id === item.product_id)
      const next = existing
        ? prev.map(i => i.product_id === item.product_id ? { ...i, quantity: i.quantity + 1 } : i)
        : [...prev, { ...item, quantity: 1 }]
      localStorage.setItem(CART_KEY, JSON.stringify(next))
      return next
    })
    setIsOpen(true)
  }, [])

  const removeItem = useCallback((product_id: string) => {
    setItems(prev => {
      const next = prev.filter(i => i.product_id !== product_id)
      localStorage.setItem(CART_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const updateQuantity = useCallback((product_id: string, quantity: number) => {
    if (quantity <= 0) { removeItem(product_id); return }
    setItems(prev => {
      const next = prev.map(i => i.product_id === product_id ? { ...i, quantity } : i)
      localStorage.setItem(CART_KEY, JSON.stringify(next))
      return next
    })
  }, [removeItem])

  const clearCart = useCallback(() => {
    persist([])
  }, [persist])

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)
  const totalCents = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)

  return (
    <CartContext.Provider value={{
      items, itemCount, totalCents,
      addItem, removeItem, updateQuantity, clearCart,
      isOpen, openCart: () => setIsOpen(true), closeCart: () => setIsOpen(false),
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
