import type { Role } from '@/types/database'

export type BadgeVariant =
  | 'default' | 'accent' | 'success' | 'warning' | 'destructive' | 'outline'

/** Display metadata for each role — shared by the directory, detail and matrix. */
export const ROLE_META: Record<Role, { label: string; variant: BadgeVariant; description: string }> = {
  admin:        { label: 'Admin',        variant: 'destructive', description: 'Full access to everything, including user management.' },
  manager:      { label: 'Manager',      variant: 'accent',      description: 'Runs operations — quotes, jobs, customers, monitoring, finance.' },
  field_worker: { label: 'Field worker', variant: 'default',     description: 'Field staff — assigned jobs and the quote builder.' },
  customer:     { label: 'Customer',     variant: 'outline',     description: 'A customer login — only sees the customer portal.' },
}

export const ROLE_ORDER: Role[] = ['admin', 'manager', 'field_worker', 'customer']

export type CustomerLink = {
  id: string
  status: 'invited' | 'registered'
  sites: number
  quotes: number
}

/** A single row in the users directory, enriched with how the login is connected. */
export interface DirectoryUser {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: Role
  created_at: string
  /** Linked CRM customer record (this login is also a customer), if any. */
  customer: CustomerLink | null
  jobsAssigned: number
  quotesSubmitted: number
}
