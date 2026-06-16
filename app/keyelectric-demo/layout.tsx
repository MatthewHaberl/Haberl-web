import { redirect } from 'next/navigation'
import { Inter } from 'next/font/google'
import type { Metadata } from 'next'
import { getUser } from '@/lib/supabase/server'
import { StoreShell } from './_components/StoreShell'
import './keyelectric.css'

// Key Electric uses Inter on the live site — load it scoped to this demo.
const inter = Inter({ subsets: ['latin'], variable: '--font-ke', display: 'swap' })

export const metadata: Metadata = {
  // Stop the parent "| Haberl" title template inside the demo storefront.
  title: { default: 'Key Electric — Online Electrical Wholesaler (demo)', template: '%s' },
  robots: { index: false, follow: false },
}

export default async function KeyElectricDemoLayout({ children }: { children: React.ReactNode }) {
  // Same gate as the rest of the portal — this sandbox lives behind login.
  const user = await getUser()
  if (!user) redirect('/auth/login')

  return (
    <div className={`${inter.variable} ke-root`}>
      <StoreShell>{children}</StoreShell>
    </div>
  )
}
