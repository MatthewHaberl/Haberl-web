import Link from 'next/link'
import { LogIn, UserPlus, Package, MapPin, Heart } from 'lucide-react'
import type { Metadata } from 'next'
import { InfoLayout } from '../_components/InfoLayout'

export const metadata: Metadata = { title: 'My Account | Key Electric (demo)' }

const BASE = '/keyelectric-demo'

export default function AccountPage() {
  return (
    <InfoLayout title="My Account" subtitle="Sign in to track orders, manage addresses and check out faster." trail={[{ label: 'My Account' }]} wide>
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Sign in */}
        <div className="rounded-xl border border-[var(--ke-line)] bg-white p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-[var(--ke-slate)]"><LogIn className="h-5 w-5" /> Sign In</h2>
          <form className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ke-slate)]">Email</label>
              <input type="email" className="w-full rounded-md border border-[var(--ke-line)] px-3 py-2 text-sm outline-none focus:border-[var(--ke-yellow)]" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--ke-slate)]">Password</label>
              <input type="password" className="w-full rounded-md border border-[var(--ke-line)] px-3 py-2 text-sm outline-none focus:border-[var(--ke-yellow)]" />
            </div>
            <button type="button" className="w-full rounded-md bg-[var(--ke-yellow)] py-2.5 font-bold text-[var(--ke-slate)] hover:bg-[var(--ke-yellow-dark)]">Sign In</button>
            <p className="text-center text-xs text-[var(--ke-muted)]">Demo only — sign-in is not wired up in this sandbox.</p>
          </form>
        </div>

        {/* Register / perks */}
        <div className="rounded-xl border border-[var(--ke-line)] bg-[var(--ke-soft)] p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-[var(--ke-slate)]"><UserPlus className="h-5 w-5" /> New customer?</h2>
          <p className="mb-4 text-sm text-[var(--ke-muted)]">Create an account to enjoy a faster checkout and keep track of everything in one place.</p>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-2"><Package className="h-4 w-4 text-[var(--ke-yellow-dark)]" /> Track orders & view history</li>
            <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[var(--ke-yellow-dark)]" /> Save delivery addresses</li>
            <li className="flex items-center gap-2"><Heart className="h-4 w-4 text-[var(--ke-yellow-dark)]" /> Build a wishlist</li>
          </ul>
          <button type="button" className="mt-5 w-full rounded-md border border-[var(--ke-slate)] py-2.5 font-bold text-[var(--ke-slate)] hover:bg-white">Create Account</button>
          <p className="mt-4 text-center text-xs text-[var(--ke-muted)]">
            Looking for the real store? <Link href={`${BASE}`} className="font-semibold text-[var(--ke-yellow-dark)] underline">Back to demo home</Link>
          </p>
        </div>
      </div>
    </InfoLayout>
  )
}
