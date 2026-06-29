'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home, MapPin, ShoppingBag, LogOut, Briefcase,
  BarChart2, Users, Zap, User, Menu, X, Settings, Activity,
  ClipboardList, PackageX, Search, Sunrise, PhoneIncoming, Sparkles,
  PanelLeftClose, PanelLeftOpen, Receipt, Ticket, UserCog,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Role } from '@/types/database'

const customerLinks = [
  { label: 'Dashboard',   href: '/portal/customer',              icon: Home },
  { label: 'My Sites',    href: '/portal/customer/sites',        icon: MapPin },
  { label: 'Monitoring',  href: '/portal/customer/monitoring',   icon: Activity },
  { label: 'Orders',      href: '/portal/customer/orders',       icon: ShoppingBag },
  { label: 'Profile',     href: '/portal/customer/profile',      icon: User },
]

// Links tagged with `section` are gated by the data-driven permissions matrix
// (lib/auth/sections.ts + role_permissions). Links with `roles` use the legacy
// inline role check; `Profile` (neither) is always shown to employees.
const employeeLinks = [
  { label: 'Dashboard', href: '/portal/employee',                  icon: Home,      section: 'dashboard' },
  { label: 'Today',     href: '/portal/employee/briefing',         icon: Sunrise,   section: 'briefing' },
  { label: 'Leads',     href: '/portal/employee/leads',            icon: PhoneIncoming, section: 'leads' },
  { label: 'Jobs',      href: '/portal/employee/jobs',             icon: Briefcase, section: 'jobs' },
  { label: 'Quotes',    href: '/portal/employee/quotes-v2',          icon: Sparkles,  section: 'quotes' },
  { label: 'Procurement', href: '/portal/employee/procurement',    icon: ClipboardList, section: 'procurement' },
  { label: 'Customers', href: '/portal/employee/customers',        icon: Users,     section: 'customers' },
  { label: 'Monitoring', href: '/portal/employee/monitoring',        icon: Activity,  section: 'monitoring' },
  { label: 'Metrics',   href: '/portal/employee/metrics',          icon: BarChart2, section: 'metrics' },
  { label: 'Lead Finder', href: '/portal/employee/lead-finder',     icon: Search,    section: 'lead_finder' },
  { label: 'Wastage',   href: '/portal/employee/reports/wastage',  icon: PackageX,  section: 'wastage' },
  { label: 'Finance',   href: '/portal/employee/finance',          icon: Receipt,   section: 'finance' },
  { label: 'Profile',   href: '/portal/employee/profile',          icon: User },
  { label: 'Shop Mgmt', href: '/portal/employee/shop',             icon: ShoppingBag, section: 'shop' },
  { label: 'Tickets',   href: '/portal/employee/tickets',          icon: Ticket,    section: 'tickets' },
  { label: 'Users',     href: '/portal/employee/users',            icon: UserCog,   section: 'users' },
  { label: 'Settings',  href: '/portal/employee/settings/company', icon: Settings,  section: 'settings' },
]

type NavIcon = React.ComponentType<{ className?: string }>

interface SidebarContentProps {
  links: { label: string; href: string; icon: NavIcon; roles?: string[]; section?: string }[]
  pathname: string
  name: string
  role: Role
  collapsed?: boolean
  onLinkClick: () => void
  onSignOut: () => void
  onToggleCollapse?: () => void
}

function isLinkActive(pathname: string, href: string) {
  if (href === '/portal/customer' || href === '/portal/employee') {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(href + '/')
}

function SidebarContent({
  links, pathname, name, role, collapsed = false,
  onLinkClick, onSignOut, onToggleCollapse,
}: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo — links back to main website */}
      <Link
        href="/"
        onClick={onLinkClick}
        title={collapsed ? 'Haberl — home' : undefined}
        className={cn(
          'flex h-16 items-center gap-2 border-b border-white/10 hover:bg-white/5 transition-colors',
          collapsed ? 'justify-center px-2' : 'px-6'
        )}
      >
        <Zap className="h-5 w-5 text-accent shrink-0" />
        {!collapsed && <span className="font-bold text-white text-lg">Haberl</span>}
      </Link>

      {/* User info — hidden when collapsed to keep the rail narrow */}
      {!collapsed && (
        <div className="px-6 py-4 border-b border-white/10">
          <p className="text-xs text-sidebar-text/60 uppercase tracking-wider">Signed in as</p>
          <p className="text-sm font-medium text-white mt-0.5 truncate">{name}</p>
          <p className="text-xs text-sidebar-text/60 capitalize">{role.replace('_', ' ')}</p>
        </div>
      )}

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto sidebar-scroll px-3 py-4 flex flex-col gap-1">
        {links.map(({ label, href, icon: Icon }) => {
          const active = isLinkActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              onClick={onLinkClick}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2' : 'px-3',
                active
                  ? 'bg-accent text-white'
                  : 'text-sidebar-text hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && label}
            </Link>
          )
        })}
      </nav>

      {/* Footer actions */}
      <div className="mt-auto px-3 py-4 border-t border-white/10 flex flex-col gap-1">
        <button
          onClick={onSignOut}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-sidebar-text hover:bg-white/10 hover:text-white transition-colors',
            collapsed ? 'justify-center px-2' : 'px-3'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && 'Sign out'}
        </button>

        {/* Collapse toggle — desktop only */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            className={cn(
              'hidden md:flex w-full items-center gap-3 rounded-lg py-2.5 text-sm font-medium text-sidebar-text hover:bg-white/10 hover:text-white transition-colors',
              collapsed ? 'justify-center px-2' : 'px-3'
            )}
          >
            {collapsed
              ? <PanelLeftOpen className="h-4 w-4 shrink-0" />
              : <PanelLeftClose className="h-4 w-4 shrink-0" />}
            {!collapsed && 'Collapse'}
          </button>
        )}
      </div>
    </div>
  )
}

interface Props {
  role: Role
  name: string
  /** Section keys the user may access (from the permissions matrix). */
  allowedSections?: string[]
}

const COLLAPSE_KEY = 'haberl.portal.sidebarCollapsed'

export function PortalSidebar({ role, name, allowedSections = [] }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  // Restore the saved collapse preference after mount (client-only).
  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
  }, [])

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  const isCustomer = role === 'customer'
  const links = isCustomer
    ? customerLinks
    : employeeLinks.filter((l) => {
        const link = l as { section?: string; roles?: string[] }
        if (link.section) return allowedSections.includes(link.section)
        if (link.roles) return link.roles.includes(role)
        return true // sectionless, role-less links (e.g. Profile) show for all employees
      })

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const sharedProps: SidebarContentProps = {
    links,
    pathname,
    name,
    role,
    onLinkClick: () => setMobileOpen(false),
    onSignOut: handleSignOut,
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex shrink-0 flex-col bg-sidebar-bg h-screen sticky top-0 overflow-y-auto sidebar-scroll transition-[width] duration-200 ease-in-out',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <SidebarContent
          {...sharedProps}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between bg-sidebar-bg px-4">
        <Link href="/" className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-accent" />
          <span className="font-bold text-white">Haberl</span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-white p-1"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-sidebar-bg">
            <SidebarContent {...sharedProps} />
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
