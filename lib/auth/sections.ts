import {
  Home, Briefcase, Sparkles, Sunrise, PhoneIncoming, ClipboardList,
  Users, Activity, BarChart2, Search, PackageX, Receipt, ShoppingBag,
  Settings, UserCog, Ticket,
} from 'lucide-react'
import type { Role } from '@/types/database'

/**
 * Canonical registry of gated **employee-portal** sections.
 *
 * Single source of truth for both the sidebar (which links to show) and the
 * page guards (`requireSection`). `defaultRoles` reproduces the access each
 * section had before permissions became data-driven — migration 060 seeds
 * `role_permissions` from exactly these lists, so day-one behaviour is
 * unchanged and the matrix simply lets an admin diverge from it.
 *
 * Admin is intentionally omitted from the editable model: the permission
 * helper hard-codes admin = all sections, so admins can never be locked out.
 * `customer` never appears here — the customer portal is separate and uniform.
 */
export interface PortalSection {
  key: string
  label: string
  description: string
  /** Where the sidebar link points. */
  href: string
  /** Route prefix this section owns (for pathname → section mapping). */
  match: string
  icon: React.ComponentType<{ className?: string }>
  /** Roles allowed by default (employee roles only). */
  defaultRoles: Role[]
}

const ALL_EMPLOYEE: Role[] = ['field_worker', 'manager', 'admin']
const MANAGER_UP: Role[] = ['manager', 'admin']
const ADMIN_ONLY: Role[] = ['admin']

export const PORTAL_SECTIONS = [
  { key: 'dashboard',   label: 'Dashboard',   description: 'The employee home dashboard.',                                  href: '/portal/employee',                 match: '/portal/employee',                icon: Home,          defaultRoles: ALL_EMPLOYEE },
  { key: 'briefing',    label: 'Today',       description: 'Daily briefing — what needs attention and what is auto-sending.', href: '/portal/employee/briefing',        match: '/portal/employee/briefing',       icon: Sunrise,       defaultRoles: MANAGER_UP },
  { key: 'leads',       label: 'Leads',       description: 'Incoming quote requests and lead follow-up.',                    href: '/portal/employee/leads',           match: '/portal/employee/leads',          icon: PhoneIncoming, defaultRoles: MANAGER_UP },
  { key: 'jobs',        label: 'Jobs',        description: 'Installation jobs and field checklists.',                        href: '/portal/employee/jobs',            match: '/portal/employee/jobs',           icon: Briefcase,     defaultRoles: ALL_EMPLOYEE },
  { key: 'quotes',      label: 'Quotes',      description: 'The quote builder and quote list.',                              href: '/portal/employee/quotes-v2',       match: '/portal/employee/quotes-v2',      icon: Sparkles,      defaultRoles: ALL_EMPLOYEE },
  { key: 'procurement', label: 'Procurement', description: 'Purchase orders and supplier receiving.',                        href: '/portal/employee/procurement',     match: '/portal/employee/procurement',    icon: ClipboardList, defaultRoles: MANAGER_UP },
  { key: 'customers',   label: 'Customers',   description: 'Lead, quote and registered-customer directory.',                 href: '/portal/employee/customers',       match: '/portal/employee/customers',      icon: Users,         defaultRoles: MANAGER_UP },
  { key: 'monitoring',  label: 'Monitoring',  description: 'Live system monitoring, alerts and performance.',                href: '/portal/employee/monitoring',      match: '/portal/employee/monitoring',     icon: Activity,      defaultRoles: MANAGER_UP },
  { key: 'metrics',     label: 'Metrics',     description: 'Business metrics and reporting dashboards.',                     href: '/portal/employee/metrics',         match: '/portal/employee/metrics',        icon: BarChart2,     defaultRoles: MANAGER_UP },
  { key: 'lead_finder', label: 'Lead Finder', description: 'Area scan and solar-coverage prospecting tools.',                href: '/portal/employee/lead-finder',     match: '/portal/employee/lead-finder',    icon: Search,        defaultRoles: MANAGER_UP },
  { key: 'wastage',     label: 'Wastage',     description: 'Material wastage reporting.',                                    href: '/portal/employee/reports/wastage', match: '/portal/employee/reports/wastage', icon: PackageX,     defaultRoles: MANAGER_UP },
  { key: 'finance',     label: 'Finance',     description: 'Receipts, invoices and bank reconciliation.',                    href: '/portal/employee/finance',         match: '/portal/employee/finance',        icon: Receipt,       defaultRoles: MANAGER_UP },
  { key: 'shop',        label: 'Shop Mgmt',   description: 'Web-store products, orders, discounts and shipping.',            href: '/portal/employee/shop',            match: '/portal/employee/shop',           icon: ShoppingBag,   defaultRoles: ADMIN_ONLY },
  { key: 'tickets',     label: 'Tickets',     description: 'In-portal “Report an issue” submissions from staff and customers.', href: '/portal/employee/tickets',      match: '/portal/employee/tickets',        icon: Ticket,        defaultRoles: ADMIN_ONLY },
  { key: 'settings',    label: 'Settings',    description: 'Company, catalog, rules and quote-engine configuration.',        href: '/portal/employee/settings/company', match: '/portal/employee/settings',      icon: Settings,      defaultRoles: ADMIN_ONLY },
  { key: 'users',       label: 'Users',       description: 'Everyone on the site — roles, connections and access control.',  href: '/portal/employee/users',           match: '/portal/employee/users',          icon: UserCog,       defaultRoles: ADMIN_ONLY },
] as const satisfies readonly PortalSection[]

export type PortalSectionKey = (typeof PORTAL_SECTIONS)[number]['key']

/** Editable roles in the permissions matrix (admin is locked all-on, customer is excluded). */
export const EDITABLE_ROLES: Role[] = ['field_worker', 'manager']

export function sectionDefaultAllowed(key: string, role: Role): boolean {
  const section = PORTAL_SECTIONS.find((s) => s.key === key)
  return section ? section.defaultRoles.includes(role) : false
}
