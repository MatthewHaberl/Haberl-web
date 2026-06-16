'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, ChevronDown, Tag } from 'lucide-react'
import { categories } from '../_lib/data'

const BASE = '/keyelectric-demo'

const quickLinks = [
  { label: 'Home', href: BASE },
  { label: 'Shop All', href: `${BASE}/shop` },
  { label: 'Specials', href: `${BASE}/shop?sale=1` },
  { label: 'About us', href: `${BASE}/about` },
  { label: 'Contact', href: `${BASE}/contact` },
  { label: 'FAQ', href: `${BASE}/faq` },
]

export function CategoryNav() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="relative z-20 border-b border-[var(--ke-line)] bg-white" onMouseLeave={() => setOpen(false)}>
      <div className="mx-auto flex max-w-7xl items-center gap-1 px-4">
        {/* All categories trigger */}
        <button
          onClick={() => setOpen((v) => !v)}
          onMouseEnter={() => setOpen(true)}
          className="flex items-center gap-2 bg-[var(--ke-yellow)] px-4 py-3 text-sm font-bold text-[var(--ke-slate)] transition-colors hover:bg-[var(--ke-yellow-dark)]"
        >
          <Menu className="h-4 w-4" /> All Categories
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {/* Quick links */}
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {quickLinks.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="whitespace-nowrap rounded px-3 py-3 text-sm font-medium text-[var(--ke-slate)] hover:text-[var(--ke-yellow-dark)]"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <a
          href="https://wa.me/27113154826"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-[var(--ke-yellow-dark)] sm:flex"
        >
          <Tag className="h-4 w-4" /> Trade account? Get pricing
        </a>
      </div>

      {/* Mega panel */}
      {open && (
        <div className="absolute inset-x-0 top-full border-b border-[var(--ke-line)] bg-white shadow-xl">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-5 px-4 py-6 md:grid-cols-3 lg:grid-cols-4">
            {categories.map((c) => (
              <div key={c.slug}>
                <Link
                  href={`${BASE}/shop?category=${c.slug}`}
                  onClick={() => setOpen(false)}
                  className="block text-sm font-bold text-[var(--ke-slate)] hover:text-[var(--ke-yellow-dark)]"
                >
                  {c.name}
                </Link>
                <ul className="mt-1.5 space-y-1">
                  {c.subcategories.map((s) => (
                    <li key={s}>
                      <Link
                        href={`${BASE}/shop?category=${c.slug}`}
                        onClick={() => setOpen(false)}
                        className="text-xs text-[var(--ke-muted)] hover:text-[var(--ke-yellow-dark)]"
                      >
                        {s}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
