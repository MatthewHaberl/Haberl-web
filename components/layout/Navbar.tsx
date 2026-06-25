'use client'

import Link from 'next/link'
import { useState, useRef } from 'react'
import { Menu, X, Zap, Battery, Sun, Package, Wrench, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

const SHOP_CATEGORIES = [
  { label: 'All Products', href: '/shop',                   Icon: Package },
  { label: 'Inverters',    href: '/shop?category=inverter', Icon: Zap     },
  { label: 'Batteries',    href: '/shop?category=battery',  Icon: Battery },
  { label: 'Solar Panels', href: '/shop?category=panel',    Icon: Sun     },
  { label: 'Components',   href: '/shop?category=other',    Icon: Wrench  },
]

const navLinks = [
  { label: 'Home',     href: '/' },
  { label: 'Services', href: '/#services' },
  { label: 'About',    href: '/#about' },
  { label: 'Contact',  href: '/#contact' },
]

interface Props {
  isLoggedIn?: boolean
}

export function Navbar({ isLoggedIn = false }: Props) {
  const [open, setOpen] = useState(false)
  const [shopOpen, setShopOpen] = useState(false)
  const [mobileShopOpen, setMobileShopOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleShopEnter() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setShopOpen(true)
  }

  function handleShopLeave() {
    closeTimer.current = setTimeout(() => setShopOpen(false), 120)
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-primary text-xl">
          <Zap className="h-6 w-6 text-accent" />
          Haberl
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}

          {/* Shop dropdown — opens on hover and keyboard focus, closes on Escape */}
          <div
            className="relative"
            onMouseEnter={handleShopEnter}
            onMouseLeave={handleShopLeave}
            onFocus={handleShopEnter}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setShopOpen(false) }}
            onKeyDown={(e) => { if (e.key === 'Escape') setShopOpen(false) }}
          >
            <Link
              href="/shop"
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              aria-haspopup="menu"
              aria-expanded={shopOpen}
            >
              Shop
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${shopOpen ? 'rotate-180' : ''}`} />
            </Link>

            {shopOpen && (
              <div
                className="absolute top-full left-1/2 -translate-x-1/2 pt-3 z-50"
                onMouseEnter={handleShopEnter}
                onMouseLeave={handleShopLeave}
              >
                <div className="bg-card border border-border rounded-xl shadow-xl p-2 w-52">
                  {SHOP_CATEGORIES.map((cat) => (
                    <Link
                      key={cat.href}
                      href={cat.href}
                      onClick={() => setShopOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors group"
                    >
                      <cat.Icon className="h-4 w-4 text-accent/60 group-hover:text-accent transition-colors shrink-0" />
                      <span className="font-medium text-foreground/80 group-hover:text-foreground">{cat.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          {isLoggedIn ? (
            <Button variant="accent" size="sm" asChild>
              <Link href="/portal">My portal</Link>
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href="/auth/login">Log in</Link>
              </Button>
              <Button variant="accent" size="sm" asChild>
                <a href="/quote-request">Get a quote</a>
              </Button>
            </>
          )}
        </div>

        {/* Mobile controls */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            className="p-2"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="mobile-menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div id="mobile-menu" className="md:hidden border-t border-border bg-background px-4 py-4 flex flex-col gap-3">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}

          {/* Mobile shop accordion */}
          <div>
            <button
              onClick={() => setMobileShopOpen(v => !v)}
              className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground py-0.5"
              aria-expanded={mobileShopOpen}
            >
              Shop
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${mobileShopOpen ? 'rotate-180' : ''}`} />
            </button>
            {mobileShopOpen && (
              <div className="mt-2 ml-3 flex flex-col gap-1 border-l-2 border-border pl-3">
                {SHOP_CATEGORIES.map((cat) => (
                  <Link
                    key={cat.href}
                    href={cat.href}
                    onClick={() => { setOpen(false); setMobileShopOpen(false) }}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground py-1"
                  >
                    <cat.Icon className="h-3.5 w-3.5 text-accent/60 shrink-0" />
                    {cat.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-border">
            {isLoggedIn ? (
              <Button variant="accent" asChild>
                <Link href="/portal">My portal</Link>
              </Button>
            ) : (
              <>
                <Button variant="outline" asChild>
                  <Link href="/auth/login">Log in</Link>
                </Button>
                <Button variant="accent" asChild>
                  <a href="/quote-request">Get a quote</a>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
