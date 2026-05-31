'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'

const navLinks = [
  { label: 'Home',     href: '/' },
  { label: 'Services', href: '/#services' },
  { label: 'Shop',     href: '/shop' },
  { label: 'About',    href: '/#about' },
  { label: 'Contact',  href: '/#contact' },
]

interface Props {
  isLoggedIn?: boolean
}

export function Navbar({ isLoggedIn = false }: Props) {
  const [open, setOpen] = useState(false)

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
        </nav>

        <div className="hidden md:flex items-center gap-3">
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
                <Link href="/auth/register">Get started</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-border bg-background px-4 py-4 flex flex-col gap-4">
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
                  <Link href="/auth/register">Get started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
