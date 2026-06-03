import { CartProvider } from '@/lib/store/cart-context'

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {children}
    </CartProvider>
  )
}
