import { KeCartProvider } from '../_lib/cart'
import { AnnouncementBar } from './AnnouncementBar'
import { Header } from './Header'
import { CategoryNav } from './CategoryNav'
import { Footer } from './Footer'
import { CartDrawer } from './CartDrawer'

/** Full storefront chrome wrapped around every Key Electric demo page. */
export function StoreShell({ children }: { children: React.ReactNode }) {
  return (
    <KeCartProvider>
      <div className="flex min-h-screen flex-col bg-white">
        <AnnouncementBar />
        <Header />
        <CategoryNav />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
      <CartDrawer />
    </KeCartProvider>
  )
}
