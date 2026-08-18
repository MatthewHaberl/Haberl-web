'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home, MapPin, ShoppingBag, LogOut, Briefcase,
  BarChart2, Users, Zap, User, Menu, X, Settings, Activity,
  ClipboardList, PackageX, Search, Sunrise, PhoneIncoming, Sparkles,
  PanelLeftClose, PanelLeftOpen, Receipt, Ticket, UserCog, CalendarDays,
  BookOpenCheck, HardHat, Eye, Check,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LABELS, viewableRoles } from '@/lib/auth/roles'
import type { Role } from '@/types/database'

const customerLinks = [
  { label: 'Dashboard',   href: '/portal/customer',              icon: Home },
  { label: 'My Sites',    href: '/portal/customer/sites',        icon: MapPin },
  { label: 'Monitoring',  href: '/portal/customer/monitoring',   icon: Activity },
  { label: 'Documents',   href: '/portal/customer/documents',    icon: Receipt },
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
  { label: 'Calendar',  href: '/portal/employee/calendar',         icon: CalendarDays, section: 'calendar' },
  { label: 'Quotes',    href: '/portal/employee/quotes-v2',          icon: Sparkles,  section: 'quotes' },
  { label: 'Procurement', href: '/portal/employee/procurement',    icon: ClipboardList, section: 'procurement' },
  { label: 'Customers', href: '/portal/employee/customers',        icon: Users,     section: 'customers' },
  { label: 'Monitoring', href: '/portal/employee/monitoring',        icon: Activity,  section: 'monitoring' },
  { label: 'Metrics',   href: '/portal/employee/metrics',          icon: BarChart2, section: 'metrics' },
  { label: 'Lead Finder', href: '/portal/employee/lead-finder',     icon: Search,    section: 'lead_finder' },
  { label: 'Wastage',   href: '/portal/employee/reports/wastage',  icon: PackageX,  section: 'wastage' },
  { label: 'Finance',   href: '/portal/employee/finance',          icon: Receipt,   section: 'finance' },
  { label: 'Staff',     href: '/portal/employee/staff',            icon: HardHat,   section: 'staff' },
  { label: 'SANS 10142-1', href: '/portal/employee/sans',          icon: BookOpenCheck, section: 'sans' },
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
  realRole: Role
  viewingAs: Role | null
  busy: boolean
  collapsed?: boolean
  onLinkClick: () => void
  onSignOut: () => void
  onViewAs: (role: Role | null) => void
  onToggleCollapse?: () => void
}

function isLinkActive(pathname: string, href: string) {
  if (href === '/portal/customer' || href === '/portal/employee') {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(href + '/')
}

/**
 * "View the portal as…" picker. Only lists roles below the user's real one —
 * the switcher is a way to see less, never more — so it renders nothing at all
 * for a field worker or a customer.
 */
function RoleSwitcher({
  realRole, viewingAs, busy, onViewAs,
}: { realRole: Role; viewingAs: Role | null; busy: boolean; onViewAs: (role: Role | null) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const options = viewableRoles(realRole)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (options.length === 0) return null

  const current = viewingAs ?? realRole

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        title="View the portal as another role"
        aria-label="View the portal as another role"
        aria-expanded={open}
        className={cn(
          'rounded-md p-1.5 transition-colors disabled:opacity-50',
          viewingAs
            ? 'bg-accent text-white'
            : 'text-sidebar-text/70 hover:bg-white/10 hover:text-white'
        )}
      >
        <Eye className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-white/15 bg-sidebar-bg shadow-xl">
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-sidebar-text/50">
            View portal as
          </p>
          {[realRole, ...options].map((r) => (
            <button
              key={r}
              onClick={() => { setOpen(false); onViewAs(r === realRole ? null : r) }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-sidebar-text hover:bg-white/10 hover:text-white"
            >
              <span>
                {ROLE_LABELS[r]}
                {r === realRole && <span className="text-sidebar-text/50"> (me)</span>}
              </span>
              {r === current && <Check className="h-3.5 w-3.5 text-accent shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SidebarContent({
  links, pathname, name, role, realRole, viewingAs, busy, collapsed = false,
  onLinkClick, onSignOut, onViewAs, onToggleCollapse,
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
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-sidebar-text/60 uppercase tracking-wider">Signed in as</p>
              <p className="text-sm font-medium text-white mt-0.5 truncate">{name}</p>
              <p className="text-xs text-sidebar-text/60 capitalize">{role.replace('_', ' ')}</p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <RoleSwitcher realRole={realRole} viewingAs={viewingAs} busy={busy} onViewAs={onViewAs} />
              <button
                onClick={onSignOut}
                title="Sign out"
                aria-label="Sign out"
                className="rounded-md p-1.5 text-sidebar-text/70 hover:bg-white/10 hover:text-white transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Preview banner — so a borrowed view is never mistaken for the real one */}
          {viewingAs && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-md bg-accent/15 border border-accent/40 px-2.5 py-1.5">
              <span className="text-xs text-white truncate">
                Viewing as <strong>{ROLE_LABELS[viewingAs]}</strong>
              </span>
              <button
                onClick={() => onViewAs(null)}
                disabled={busy}
                className="text-xs font-medium text-accent hover:text-white transition-colors disabled:opacity-50"
              >
                Exit
              </button>
            </div>
          )}
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
        {/* The collapsed rail has no user block, so sign out lives down here instead */}
        {collapsed && (
          <button
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="flex w-full items-center justify-center rounded-lg px-2 py-2.5 text-sm font-medium text-sidebar-text hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
          </button>
        )}

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
  /** Effective role — the previewed one while a role preview is active. */
  role: Role
  /** The role actually on the profile. */
  realRole: Role
  viewingAs: Role | null
  name: string
  /** Section keys the user may access (from the permissions matrix). */
  allowedSections?: string[]
}

const COLLAPSE_KEY = 'haberl.portal.sidebarCollapsed'

export function PortalSidebar({ role, realRole, viewingAs, name, allowedSections = [] }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [busy, setBusy] = useState(false)

  // Restore the saved collapse preference after mount (client-only). localStorage
  // does not exist during SSR, so this cannot be read during render without
  // breaking hydration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of localStorage; must run post-hydration
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

  async function setViewAs(next: Role | null) {
    setBusy(true)
    try {
      const res = await fetch('/api/portal/view-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: next }),
      })
      if (!res.ok) {
        setBusy(false)
        return
      }
      // Full navigation to /portal: it re-resolves the right dashboard for the
      // new role and drops any client-cached pages the old role rendered.
      window.location.assign('/portal')
    } catch {
      setBusy(false)
    }
  }

  async function handleSignOut() {
    // Drop any role preview first, so the next sign-in starts as yourself.
    try {
      await fetch('/api/portal/view-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: null }),
      })
    } catch {
      // Signing out matters more than clearing the preview.
    }
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
    realRole,
    viewingAs,
    busy,
    onLinkClick: () => setMobileOpen(false),
    onSignOut: handleSignOut,
    onViewAs: setViewAs,
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
