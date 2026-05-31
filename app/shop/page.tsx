import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { ShoppingBag, Clock, Phone } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Shop' }

export default async function ShopPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <>
      <Navbar isLoggedIn={!!user} />
      <main className="flex-1 flex items-center justify-center py-24 px-4 bg-muted">
        <div className="text-center max-w-md">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 mb-6 mx-auto">
            <ShoppingBag className="h-8 w-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold text-primary mb-3">Shop coming soon</h1>
          <p className="text-muted-foreground mb-8">
            We&apos;re putting together our online store. In the meantime, contact us directly
            for pricing on solar systems, electrical components, and installation packages.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" asChild>
              <a href="tel:+27000000000">
                <Phone className="h-4 w-4" /> Call for pricing
              </a>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="mailto:info@haberl.co.za">Email us</a>
            </Button>
          </div>
          <p className="mt-8 text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Online shop launching soon
          </p>
        </div>
      </main>
    </>
  )
}
