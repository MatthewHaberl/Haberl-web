'use client'

// Self-contained cart for the Key Electric demo. Uses its OWN localStorage key so
// it never touches the real Haberl shop cart (`haberl-cart`).

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export interface KeCartItem {
  sku: string
  slug: string
  name: string
  priceCents: number
  img: string
  quantity: number
}

interface KeCartValue {
  items: KeCartItem[]
  itemCount: number
  subtotalCents: number
  addItem: (item: Omit<KeCartItem, 'quantity'>, qty?: number) => void
  removeItem: (sku: string) => void
  updateQuantity: (sku: string, quantity: number) => void
  clearCart: () => void
  isOpen: boolean
  openCart: () => void
  closeCart: () => void
}

const KeCartContext = createContext<KeCartValue | null>(null)
const CART_KEY = 'ke-demo-cart'

export function KeCartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<KeCartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_KEY)
      if (stored) setItems(JSON.parse(stored))
    } catch {
      // ignore corrupt storage
    }
  }, [])

  const save = useCallback((next: KeCartItem[]) => {
    setItems(next)
    try { localStorage.setItem(CART_KEY, JSON.stringify(next)) } catch { /* quota */ }
    return next
  }, [])

  const addItem = useCallback((item: Omit<KeCartItem, 'quantity'>, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.sku === item.sku)
      const next = existing
        ? prev.map((i) => (i.sku === item.sku ? { ...i, quantity: i.quantity + qty } : i))
        : [...prev, { ...item, quantity: qty }]
      try { localStorage.setItem(CART_KEY, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
    setIsOpen(true)
  }, [])

  const removeItem = useCallback((sku: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.sku !== sku)
      try { localStorage.setItem(CART_KEY, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }, [])

  const updateQuantity = useCallback((sku: string, quantity: number) => {
    setItems((prev) => {
      const next = quantity <= 0
        ? prev.filter((i) => i.sku !== sku)
        : prev.map((i) => (i.sku === sku ? { ...i, quantity } : i))
      try { localStorage.setItem(CART_KEY, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }, [])

  const clearCart = useCallback(() => { save([]) }, [save])

  const itemCount = items.reduce((s, i) => s + i.quantity, 0)
  const subtotalCents = items.reduce((s, i) => s + i.priceCents * i.quantity, 0)

  return (
    <KeCartContext.Provider
      value={{
        items, itemCount, subtotalCents,
        addItem, removeItem, updateQuantity, clearCart,
        isOpen, openCart: () => setIsOpen(true), closeCart: () => setIsOpen(false),
      }}
    >
      {children}
    </KeCartContext.Provider>
  )
}

export function useKeCart() {
  const ctx = useContext(KeCartContext)
  if (!ctx) throw new Error('useKeCart must be used inside KeCartProvider')
  return ctx
}
