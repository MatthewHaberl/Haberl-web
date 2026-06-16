import Link from 'next/link'
import { Heart } from 'lucide-react'
import type { Metadata } from 'next'
import { InfoLayout } from '../_components/InfoLayout'

export const metadata: Metadata = { title: 'Wishlist | Key Electric (demo)' }

const BASE = '/keyelectric-demo'

export default function WishlistPage() {
  return (
    <InfoLayout title="My Wishlist" trail={[{ label: 'Wishlist' }]}>
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-[var(--ke-line)] py-20 text-center">
        <Heart className="h-14 w-14 text-gray-300" />
        <p className="text-[var(--ke-muted)]">Your wishlist is empty.</p>
        <Link href={`${BASE}/shop`} className="rounded-md bg-[var(--ke-yellow)] px-6 py-3 font-bold text-[var(--ke-slate)] hover:bg-[var(--ke-yellow-dark)]">
          Discover products
        </Link>
      </div>
    </InfoLayout>
  )
}
