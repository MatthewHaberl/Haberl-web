import Link from 'next/link'
import { Phone, Mail, MapPin, Clock, Facebook, Instagram, MessageCircle } from 'lucide-react'
import { categories } from '../_lib/data'

const BASE = '/keyelectric-demo'

const findItFast = [
  { label: 'Home', href: BASE },
  { label: 'About us', href: `${BASE}/about` },
  { label: 'Contact', href: `${BASE}/contact` },
  { label: 'Terms and Conditions', href: `${BASE}/terms` },
  { label: 'Wishlist', href: `${BASE}/wishlist` },
]

const customerCare = [
  { label: 'My Account', href: `${BASE}/account` },
  { label: 'Track your Order', href: `${BASE}/account` },
  { label: 'Returns / Exchange', href: `${BASE}/returns` },
  { label: 'FAQs', href: `${BASE}/faq` },
  { label: 'Blog', href: `${BASE}/blog` },
]

export function Footer() {
  const topCats = categories.slice(0, 6)

  return (
    <footer className="mt-12 bg-[var(--ke-slate)] text-gray-300">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-12 md:grid-cols-4">
        {/* Brand + contact */}
        <div className="col-span-2 md:col-span-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ke-demo-assets/logo.png" alt="Key Electric Wholesalers" className="mb-4 h-9 w-auto brightness-0 invert" />
          <p className="mb-4 text-sm leading-relaxed text-gray-400">
            Your trusted electrical wholesaler. Quality components, competitive prices, nationwide delivery.
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ke-yellow)]" /> The Link, 676 Gallagher Ave, Halfway House, Midrand, 1685</li>
            <li className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-[var(--ke-yellow)]" /> (011) 315 4826</li>
            <li className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-[var(--ke-yellow)]" /> webstore@keyelectric.co.za</li>
            <li className="flex items-center gap-2"><Clock className="h-4 w-4 shrink-0 text-[var(--ke-yellow)]" /> Mon–Fri 6:30–17:00 · Sat 7:00–12:00</li>
          </ul>
        </div>

        <FooterCol title="Find It Fast" links={findItFast} />

        <div>
          <h4 className="mb-4 font-bold uppercase tracking-wide text-white">Top Categories</h4>
          <ul className="space-y-2 text-sm">
            {topCats.map((c) => (
              <li key={c.slug}>
                <Link href={`${BASE}/shop?category=${c.slug}`} className="text-gray-400 hover:text-[var(--ke-yellow)]">{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>

        <FooterCol title="Customer Care" links={customerCare} />
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-gray-400 sm:flex-row">
          <p>Demo sandbox built by Haberl. Not the live Key Electric store — for demonstration only.</p>
          <div className="flex items-center gap-3">
            <a href="#" aria-label="Facebook" className="hover:text-[var(--ke-yellow)]"><Facebook className="h-4 w-4" /></a>
            <a href="#" aria-label="Instagram" className="hover:text-[var(--ke-yellow)]"><Instagram className="h-4 w-4" /></a>
            <a href="#" aria-label="WhatsApp" className="hover:text-[var(--ke-yellow)]"><MessageCircle className="h-4 w-4" /></a>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="mb-4 font-bold uppercase tracking-wide text-white">{title}</h4>
      <ul className="space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className="text-gray-400 hover:text-[var(--ke-yellow)]">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
