'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Mail, Phone, MapPin, FileText, Briefcase, ChevronRight, Search, UserRound,
} from 'lucide-react'
import { RoleSelect } from './RoleSelect'
import { ROLE_META, ROLE_ORDER, type DirectoryUser } from './shared'
import type { Role } from '@/types/database'

const FILTERS: { key: Role | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  ...ROLE_ORDER.map((r) => ({ key: r, label: ROLE_META[r].label + 's' })),
]

export function UsersDirectory({ users }: { users: DirectoryUser[] }) {
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: users.length }
    for (const r of ROLE_ORDER) c[r] = users.filter((u) => u.role === r).length
    return c
  }, [users])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (!q) return true
      return (
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.phone ?? '').toLowerCase().includes(q)
      )
    })
  }, [users, query, roleFilter])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email or phone…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const active = roleFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => setRoleFilter(f.key)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label} <span className="opacity-70">{counts[f.key] ?? 0}</span>
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <UserRound className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No users match</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a different search or filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((u) => (
            <UserRow key={u.id} user={u} />
          ))}
        </div>
      )}
    </div>
  )
}

function UserRow({ user }: { user: DirectoryUser }) {
  const meta = ROLE_META[user.role]
  const connections = buildConnections(user)

  return (
    <Card className="transition-colors hover:border-accent">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Identity + connections */}
        <Link href={`/portal/employee/users/${user.id}`} className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold leading-snug">{user.full_name || 'Unnamed user'}</p>
            <Badge variant={meta.variant}>{meta.label}</Badge>
            {user.customer && (
              <Badge variant="outline">
                {user.customer.status === 'registered' ? 'Customer' : 'Customer (invited)'}
              </Badge>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{user.email || 'No email'}</span>
            </span>
            {user.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 shrink-0" />{user.phone}
              </span>
            )}
          </div>
          {connections.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {connections.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
                  <c.icon className="h-3 w-3" />{c.label}
                </span>
              ))}
            </div>
          )}
        </Link>

        {/* Role control + view */}
        <div className="flex items-center gap-3 sm:shrink-0">
          <RoleSelect userId={user.id} role={user.role} />
          <Link
            href={`/portal/employee/users/${user.id}`}
            className="flex items-center gap-1 text-xs font-medium text-accent"
          >
            View <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

function buildConnections(user: DirectoryUser) {
  const items: { icon: React.ComponentType<{ className?: string }>; label: string }[] = []
  if (user.customer) {
    items.push({ icon: MapPin, label: `${user.customer.sites} site${user.customer.sites !== 1 ? 's' : ''}` })
    items.push({ icon: FileText, label: `${user.customer.quotes} quote${user.customer.quotes !== 1 ? 's' : ''}` })
  }
  if (user.jobsAssigned > 0) {
    items.push({ icon: Briefcase, label: `${user.jobsAssigned} job${user.jobsAssigned !== 1 ? 's' : ''} assigned` })
  }
  if (user.quotesSubmitted > 0) {
    items.push({ icon: FileText, label: `${user.quotesSubmitted} quote${user.quotesSubmitted !== 1 ? 's' : ''} created` })
  }
  return items
}
