'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, MapPin, ShoppingBag, LogOut, Briefcase,
  BarChart2, Users, Zap, User, Menu, X
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { Role } from '@/types/database'

const customerLinks = [
  { label: 'Dashboard',      href: '/portal/customer',        icon: Home },
  { label: 'My Sites',       href: '/portal/customer/sites',  icon: MapPin },
  { label: 'Orders',         href: '/portal/customer/orders', icon: ShoppingBag },
  { label: 'Profile',        href: '/portal/customer/profile',icon: User },
]

const employeeLinks = [
  { label: 'Dashboard',      href: '/portal/employee',            icon: Home,     roles: ['field_worker','manager','admin'] },
  { label: 'Jobs',           href: '/portal/employee/jobs',       icon: Briefcase,roles: ['field_worker','manager','admin'] },
  { label: 'Customers',      href: '/portal/employee/customers',  icon: Users,    roles: ['manager','admin'] },
  { label: 'Metrics',        href: '/portal/employee/metrics',    icon: BarChart2,roles: ['manager','admin'] },
  { label: 'Profile',        href: '/portal/employee/profile',    icon: User,     roles: ['field_worker','manager','admin'] },
]

interface Props {
  role: Role
  name: string
}

export function PortalSidebar({ role, name }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isCustomer = role === 'customer'
  const links = isCustomer
    ? customerLinks
    : employeeLinks.filter((l) => (l.roles as string[]).includes(role))

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 px-6 border-b border-white/10">
        <Zap className="h-5 w-5 text-accent" />
        <span className="font-bold text-white text-lg">Haberl</span>
      </div>

      {/* User info */}
      <div className="px-6 py-4 border-b border-white/10">
        <p className="text-xs text-sidebar-text/60 uppercase tracking-wider">Signed in as</p>
        <p className="text-sm font-medium text-white mt-0.5 truncate">{name}</p>
        <p className="text-xs text-sidebar-text/60 capitalize">{role.replace('_', ' ')}</p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1">
        {links.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent text-white'
                  : 'text-sidebar-text hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar-bg min-h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between bg-sidebar-bg px-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-accent" />
          <span className="font-bold text-white">Haberl</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-white p-1"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-sidebar-bg">
            <SidebarContent />
          </div>
          <div
            className="flex-1 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}
    </>
  )
}
