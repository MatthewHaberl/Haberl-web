'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import {
  FileText, Plus, ChevronRight, Clock, Sparkles, Map as MapIcon,
  MapPin, Copy, Pencil, Check, X, Loader2, Trash2,
} from 'lucide-react'
import type { QuoteRequestStatus } from '@/types/database'

const statusVariant: Record<QuoteRequestStatus, 'default' | 'warning' | 'success'> = {
  pending: 'warning',
  generated: 'success',
  sent: 'default',
  accepted: 'success',
  declined: 'default',
}

export type QuoteRow = {
  id: string
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  site_number: number | null
  site_label: string | null
  option_label: string | null
  quote_number: string | null
  address: string | null
  system_type: string
  monthly_kwh: string | null
  created_at: string
  status: QuoteRequestStatus
  total_amount: number | null
  submitter?: { full_name: string } | null
}

type SiteGroup = { key: string; label: string; sortKey: number; options: QuoteRow[] }
type CustomerGroup = { key: string; name: string; latest: number; optionCount: number; sites: SiteGroup[] }

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function customerKey(r: QuoteRow) {
  return [
    r.customer_name.trim().toLowerCase(),
    r.customer_phone?.trim().toLowerCase() ?? '',
    r.customer_email?.trim().toLowerCase() ?? '',
  ].join('|')
}

function siteKey(r: QuoteRow) {
  return r.site_label?.trim().toLowerCase() || r.address?.trim().toLowerCase() || `site-${r.site_number ?? 1}`
}

function siteLabel(options: QuoteRow[]) {
  const labelled = options.find((o) => o.site_label?.trim())
  if (labelled?.site_label) return labelled.site_label.trim()
  const addressed = options.find((o) => o.address?.trim())
  if (addressed?.address) return addressed.address.trim()
  return `Site ${options[0]?.site_number ?? 1}`
}

function optionDisplay(o: QuoteRow, index: number) {
  return o.option_label?.trim() || o.quote_number || `Option ${index + 1}`
}

function buildGroups(rows: QuoteRow[]): CustomerGroup[] {
  const customers = new Map<string, { name: string; latest: number; sites: Map<string, QuoteRow[]> }>()
  for (const row of rows) {
    const ck = customerKey(row)
    const c = customers.get(ck) ?? { name: row.customer_name, latest: 0, sites: new Map() }
    c.latest = Math.max(c.latest, new Date(row.created_at).getTime())
    const sk = siteKey(row)
    const arr = c.sites.get(sk) ?? []
    arr.push(row)
    c.sites.set(sk, arr)
    customers.set(ck, c)
  }
  return [...customers.entries()]
    .map(([key, c]) => {
      const sites: SiteGroup[] = [...c.sites.values()]
        .map((options) => {
          const sorted = [...options].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          )
          return { key: siteKey(sorted[0]), label: siteLabel(sorted), sortKey: sorted[0]?.site_number ?? 1, options: sorted }
        })
        .sort((a, b) => a.sortKey - b.sortKey)
      return { key, name: c.name, latest: c.latest, optionCount: sites.reduce((n, s) => n + s.options.length, 0), sites }
    })
    .sort((a, b) => b.latest - a.latest)
}

export function QuotesV2List({ rows, isManager, isAdmin, deletedCount }: { rows: QuoteRow[]; isManager: boolean; isAdmin: boolean; deletedCount: number }) {
  const router = useRouter()
  const confirm = useConfirm()
  const groups = buildGroups(rows)

  const [editingSite, setEditingSite] = useState<string | null>(null)
  const [editingOption, setEditingOption] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  async function saveSite(optionIds: string[]) {
    setSaving(true)
    try {
      const supabase = createClient()
      await supabase.from('quote_requests').update({ site_label: draft.trim() || null }).in('id', optionIds)
      setEditingSite(null)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function saveOption(id: string) {
    setSaving(true)
    try {
      const supabase = createClient()
      await supabase.from('quote_requests').update({ option_label: draft.trim() || null }).eq('id', id)
      setEditingOption(null)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  // Soft-delete: archive + shrink the row (strip the regenerable heavy fields).
  // generated_quote is kept so an admin can restore it from the Deleted view.
  async function deleteOption(id: string, label: string) {
    if (!(await confirm({
      title: `Delete "${label}"?`,
      body: "It's archived (shrunk to the essentials) and only an admin can restore it.",
      confirmText: 'Delete',
      destructive: true,
    }))) return
    setSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('quote_requests').update({
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id ?? null,
        quote_html: null,
        bom_snapshot: null,
      }).eq('id', id)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3">
        <Sparkles className="h-5 w-5 text-accent shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-foreground">New Quotes workspace</p>
          <p className="text-muted-foreground">
            Customer → site → option. Rename a site or option inline, duplicate an option, or add a new site for the same customer.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Quotes</h1>
          <p className="text-muted-foreground mt-1">
            {groups.length} {groups.length === 1 ? 'customer' : 'customers'} · {rows.length}{' '}
            {rows.length === 1 ? 'option' : 'options'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && deletedCount > 0 && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/portal/employee/quotes-v2/deleted">
                <Trash2 className="h-4 w-4" />
                Deleted ({deletedCount})
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/portal/employee/quotes-v2/workflow">
              <MapIcon className="h-4 w-4" />
              Workflow map
            </Link>
          </Button>
          <Button asChild variant="accent" size="sm">
            <Link href="/portal/employee/quotes-v2/new">
              <Plus className="h-4 w-4" />
              New request
            </Link>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No quote requests yet</p>
            <p className="text-muted-foreground text-sm mt-1">Submit a site survey to get started.</p>
            <Button asChild variant="accent" size="sm" className="mt-4">
              <Link href="/portal/employee/quotes-v2/new">New request</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const firstOptionId = group.sites[0]?.options[0]?.id
            return (
              <Card key={group.key}>
                <CardContent className="pt-4 pb-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm">{group.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="default">
                        {group.optionCount} {group.optionCount === 1 ? 'option' : 'options'} ·{' '}
                        {group.sites.length} {group.sites.length === 1 ? 'site' : 'sites'}
                      </Badge>
                      {firstOptionId && (
                        <Link
                          href={`/portal/employee/quotes-v2/new?from=${firstOptionId}&newSite=1`}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors whitespace-nowrap"
                          title="Add a new site for this customer"
                        >
                          <Plus className="h-3 w-3" />
                          Add site
                        </Link>
                      )}
                    </div>
                  </div>

                  {group.sites.map((site) => (
                    <div key={site.key} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {editingSite === site.key ? (
                          <span className="flex items-center gap-1.5 flex-1">
                            <Input
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder="Site name (e.g. Home, Business)"
                              className="h-7 text-xs max-w-xs"
                              autoFocus
                            />
                            <Button size="sm" variant="ghost" className="h-7 px-2" disabled={saving} onClick={() => saveSite(site.options.map((o) => o.id))}>
                              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingSite(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        ) : (
                          <>
                            <span className="uppercase tracking-wider">{site.label}</span>
                            <button
                              type="button"
                              onClick={() => { setEditingSite(site.key); setEditingOption(null); setDraft(site.options.find((o) => o.site_label)?.site_label ?? '') }}
                              className="text-muted-foreground/60 hover:text-foreground"
                              title="Rename site"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <Link
                              href={`/portal/employee/quotes-v2/new?from=${site.options[0].id}`}
                              className="ml-auto flex items-center gap-1 text-muted-foreground/70 hover:text-foreground"
                              title="Add another option to this site"
                            >
                              <Plus className="h-3 w-3" /> Add option
                            </Link>
                          </>
                        )}
                      </div>

                      <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
                        {site.options.map((option, i) => (
                          <div key={option.id} className="flex items-center">
                            <div
                              className="flex-1 flex items-center justify-between gap-3 px-4 py-3 min-w-0 cursor-pointer hover:bg-muted/40 transition-colors"
                              onClick={() => { if (editingOption !== option.id) router.push(`/portal/employee/quotes-v2/${option.id}`) }}
                            >
                              <div className="min-w-0">
                                {editingOption === option.id ? (
                                  <span className="flex items-center gap-1.5">
                                    <Input
                                      value={draft}
                                      onChange={(e) => setDraft(e.target.value)}
                                      placeholder="Option name (e.g. 8 kW hybrid)"
                                      className="h-7 text-xs max-w-xs"
                                      autoFocus
                                    />
                                    <Button size="sm" variant="ghost" className="h-7 px-2" disabled={saving} onClick={() => saveOption(option.id)}>
                                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingOption(null)}>
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </span>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Link href={`/portal/employee/quotes-v2/${option.id}`} className="text-sm font-medium hover:text-accent">
                                        {optionDisplay(option, i)}
                                      </Link>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setEditingOption(option.id); setEditingSite(null); setDraft(option.option_label ?? '') }}
                                        className="text-muted-foreground/60 hover:text-foreground"
                                        title="Rename option"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                      {option.total_amount != null && (
                                        <span className="text-xs font-semibold text-foreground">{formatCurrency(option.total_amount)}</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {option.system_type}{option.monthly_kwh ? ` · ${option.monthly_kwh} kWh/mo` : ''}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(option.created_at)}</span>
                                      {isManager && option.submitter?.full_name && <span>by {option.submitter.full_name}</span>}
                                    </div>
                                  </>
                                )}
                              </div>
                              {editingOption !== option.id && (
                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge variant={statusVariant[option.status]}>{option.status}</Badge>
                                  <Link href={`/portal/employee/quotes-v2/${option.id}`} title="Open">
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  </Link>
                                </div>
                              )}
                            </div>
                            <Link
                              href={`/portal/employee/quotes-v2/new?from=${option.id}`}
                              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors whitespace-nowrap"
                              title="Duplicate this option"
                            >
                              <Copy className="h-3 w-3" /> Duplicate
                            </Link>
                            {isManager && (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => deleteOption(option.id, optionDisplay(option, i))}
                                className="shrink-0 flex items-center justify-center px-2.5 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-50"
                                title="Delete this quote (archived; admin can restore)"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
