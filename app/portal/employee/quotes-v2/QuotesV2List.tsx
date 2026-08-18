'use client'

import { useEffect, useState } from 'react'
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
  FileText, Plus, ChevronRight, ChevronDown, Clock, Sparkles, Map as MapIcon,
  MapPin, Copy, Pencil, Check, X, Loader2, Trash2, UserCog,
  Archive, ArchiveRestore, Undo2, Layers, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react'
import type { QuoteRequestStatus } from '@/types/database'
import { PageShell, PageHeader } from '@/components/layout/page'
import { RecordShareControl } from '@/components/records/RecordShareControl'
import type { StaffMember } from '@/lib/records/sharing'
import { workTypeFor } from '@/lib/quotes/work-types'
import type { QuoteListSummary } from '@/lib/quotes/quote-list-summary'

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
  work_type: string | null
  monthly_kwh: string | null
  created_at: string
  status: QuoteRequestStatus
  total_amount: number | null
  /** Derived on the server (lib/quotes/quote-list-summary): money + shape. */
  summary?: QuoteListSummary
  submitted_by: string | null
  archived_at: string | null
  submitter?: { full_name: string } | null
}

// Local-only: hiding the intro banner is a per-browser preference, not
// something worth a profile column.
const BANNER_KEY = 'quotes-v2-intro-dismissed'
// Which customers are minimised. Also per-browser — Matthew collapsing the
// customers he's done with shouldn't change what anyone else sees.
const COLLAPSED_KEY = 'quotes-v2-collapsed-customers'

// "Open" = still in play. Accepted and declined are finished business; everything
// before that is work sitting on someone's desk.
const OPEN_STATUSES: QuoteRequestStatus[] = ['pending', 'generated', 'sent']

type SiteGroup = { key: string; label: string; sortKey: number; options: QuoteRow[] }
type CustomerGroup = {
  key: string
  name: string
  latest: number
  optionCount: number
  openCount: number
  sites: SiteGroup[]
}

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
      const allOptions = sites.flatMap((s) => s.options)
      return {
        key,
        name: c.name,
        latest: c.latest,
        optionCount: allOptions.length,
        openCount: allOptions.filter((o) => OPEN_STATUSES.includes(o.status)).length,
        sites,
      }
    })
    .sort((a, b) => b.latest - a.latest)
}

export function QuotesV2List({
  rows, isManager, isAdmin, deletedCount,
  staff, sharesByQuote, nameById, currentUserId,
}: {
  rows: QuoteRow[]
  isManager: boolean
  isAdmin: boolean
  deletedCount: number
  staff: StaffMember[]
  sharesByQuote: Record<string, { id: string; full_name: string }[]>
  nameById: Record<string, string>
  currentUserId: string
}) {
  const router = useRouter()
  const confirm = useConfirm()

  const [editingSite, setEditingSite] = useState<string | null>(null)
  const [editingOption, setEditingOption] = useState<string | null>(null)
  const [sharingOption, setSharingOption] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  // null until the browser preference is read, so a dismissed banner never flashes.
  const [bannerDismissed, setBannerDismissed] = useState<boolean | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Post-hydration read of external state: localStorage does not exist during SSR,
  // so the preference cannot be seeded during render without a hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the saved dismissal after mount
    setBannerDismissed(window.localStorage.getItem(BANNER_KEY) === '1')
    try {
      const saved = JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) ?? '[]')
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the saved collapse state after mount
      if (Array.isArray(saved)) setCollapsed(new Set(saved as string[]))
    } catch {
      // A corrupt preference is not worth an error — start expanded.
    }
  }, [])

  function dismissBanner() {
    window.localStorage.setItem(BANNER_KEY, '1')
    setBannerDismissed(true)
  }

  function persistCollapsed(next: Set<string>) {
    setCollapsed(next)
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
  }

  function toggleCustomer(key: string) {
    const next = new Set(collapsed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    persistCollapsed(next)
  }

  const activeRows = rows.filter((r) => !r.archived_at)
  const archivedRows = rows.filter((r) => r.archived_at)
  const groups = buildGroups(showArchived ? archivedRows : activeRows)
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.key))
  const totalOpen = groups.reduce((n, g) => n + g.openCount, 0)

  function toggleAll() {
    persistCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)))
  }

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

  // Archive: keep the quote whole, just take it off the active list (and out of
  // the follow-up chase + daily briefing). Reversible by any manager — unlike
  // delete, which shrinks the row and needs an admin to restore.
  async function setArchived(id: string, label: string, archive: boolean) {
    if (archive && !(await confirm({
      title: `Archive "${label}"?`,
      body: 'Nothing is lost — it drops off the active list and stops appearing in follow-ups and the daily briefing. You can restore it any time.',
      confirmText: 'Archive',
    }))) return
    setSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('quote_requests').update({
        archived_at: archive ? new Date().toISOString() : null,
        archived_by: archive ? user?.id ?? null : null,
      }).eq('id', id)
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
    <PageShell width="wide">
      <PageHeader
        icon={Sparkles}
        title={showArchived ? 'Archived quotes' : 'Quotes'}
        description={
          showArchived
            ? `${archivedRows.length} archived ${archivedRows.length === 1 ? 'option' : 'options'} · kept whole, restore any time`
            : `${groups.length} ${groups.length === 1 ? 'customer' : 'customers'} · ${activeRows.length} ${activeRows.length === 1 ? 'option' : 'options'} · ${totalOpen} open`
        }
        actions={
          <>
            {groups.length > 0 && (
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {allCollapsed ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />}
                {allCollapsed ? 'Expand all' : 'Collapse all'}
              </Button>
            )}
            {archivedRows.length > 0 && (
              <Button
                variant={showArchived ? 'outline' : 'ghost'}
                size="sm"
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? <Undo2 className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {showArchived ? 'Back to active' : `Archived (${archivedRows.length})`}
              </Button>
            )}
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
          </>
        }
      />

      {bannerDismissed === false && !showArchived && (
        <div className="flex items-start gap-3 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3">
          <Sparkles className="h-5 w-5 text-accent shrink-0 mt-0.5" />
          <div className="text-sm flex-1">
            <p className="font-medium text-foreground">New Quotes workspace</p>
            <p className="text-muted-foreground">
              Customer → site → option. Rename a site or option inline, duplicate an option, or add a new site for the same customer.
            </p>
          </div>
          <button
            type="button"
            onClick={dismissBanner}
            className="shrink-0 -mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Dismiss"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showArchived && archivedRows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Archive className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">Nothing archived</p>
            <p className="text-muted-foreground text-sm mt-1">Archived quotes land here and can be restored any time.</p>
          </CardContent>
        </Card>
      ) : !showArchived && activeRows.length === 0 ? (
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
            const isCollapsed = collapsed.has(group.key)
            return (
              <Card key={group.key}>
                <CardContent className="pt-4 pb-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    {/* The whole name is the hit target — minimising a customer you're
                        done with is the most common thing to do on this row. */}
                    <button
                      type="button"
                      onClick={() => toggleCustomer(group.key)}
                      aria-expanded={!isCollapsed}
                      title={isCollapsed ? 'Expand customer' : 'Minimise customer'}
                      className="flex items-center gap-1.5 min-w-0 text-left text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                      <span className="font-semibold text-sm text-foreground truncate">{group.name}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      {/* Open work first — it's the number you act on. */}
                      <Badge variant={group.openCount > 0 ? 'warning' : 'outline'}>
                        {group.openCount} open
                      </Badge>
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

                  {!isCollapsed && group.sites.map((site) => (
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
                          <div key={option.id} className="flex flex-col">
                           <div className="flex items-center">
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
                                      {/* Money on every row, not just generated ones: a draft
                                          figure reads muted with a dashed underline so nobody
                                          quotes it as final, but you can still tell the R4k job
                                          from the R140k one without opening either. */}
                                      {option.summary?.totalR != null && (
                                        <span
                                          className={
                                            option.summary.draft
                                              ? 'text-xs text-muted-foreground border-b border-dashed border-muted-foreground/50'
                                              : 'text-xs font-semibold text-foreground'
                                          }
                                          title={
                                            option.summary.draft
                                              ? 'Working total from the builder — this quote hasn’t been generated yet'
                                              : 'Total on the generated quote'
                                          }
                                        >
                                          {formatCurrency(Math.round(option.summary.totalR * 100))}
                                        </span>
                                      )}
                                      {(option.summary?.needsPricing ?? 0) > 0 && (
                                        <span
                                          className="text-xs text-warning"
                                          title="Lines still waiting on a supplier price — not in the figure shown"
                                        >
                                          +{option.summary!.needsPricing} to price
                                        </span>
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
                                  {option.archived_at && <Badge variant="outline">archived</Badge>}
                                  {/* One option, several jobs inside it (W99 combined quotes).
                                      The customer accepts the lot or one part, so the list has
                                      to say that this line is more than one piece of work. */}
                                  {(option.summary?.packages.length ?? 0) > 1 && (
                                    <Badge variant="outline" className="gap-1" title="Combined quote — several jobs priced under one option">
                                      <Layers className="h-3 w-3" />
                                      {option.summary!.packages.length} jobs
                                    </Badge>
                                  )}
                                  {/* Work type (W97) — only 'solar' is the unmarked default; every other
                                      offering (incl. backup_inverter) gets its badge. */}
                                  {option.work_type && option.work_type !== 'solar' && (
                                    <Badge variant="outline">{workTypeFor(option.work_type)?.label ?? option.work_type}</Badge>
                                  )}
                                  <Badge variant={statusVariant[option.status]}>{option.status}</Badge>
                                  <Link href={`/portal/employee/quotes-v2/${option.id}`} title="Open">
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  </Link>
                                </div>
                              )}
                            </div>
                            {!option.archived_at && (
                              <Link
                                href={`/portal/employee/quotes-v2/new?from=${option.id}`}
                                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors whitespace-nowrap"
                                title="Duplicate this option"
                              >
                                <Copy className="h-3 w-3" /> Duplicate
                              </Link>
                            )}
                            {isManager && (
                              option.archived_at ? (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => setArchived(option.id, optionDisplay(option, i), false)}
                                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors whitespace-nowrap disabled:opacity-50"
                                  title="Restore this quote to the active list"
                                >
                                  <ArchiveRestore className="h-3 w-3" /> Restore
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => setArchived(option.id, optionDisplay(option, i), true)}
                                  className="shrink-0 flex items-center justify-center px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors disabled:opacity-50"
                                  title="Archive this quote (kept whole; restore any time)"
                                >
                                  <Archive className="h-3 w-3" />
                                </button>
                              )
                            )}
                            {isManager && (
                              <button
                                type="button"
                                onClick={() => setSharingOption((cur) => (cur === option.id ? null : option.id))}
                                className={
                                  'shrink-0 flex items-center justify-center px-2.5 py-1.5 text-xs rounded-md transition-colors ' +
                                  (sharingOption === option.id
                                    ? 'text-foreground bg-muted'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')
                                }
                                title="Owner & sharing"
                              >
                                <UserCog className="h-3 w-3" />
                              </button>
                            )}
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
                           {/* What's inside a combined quote, each job at the price it
                               costs bought on its own. Indented under its option so the
                               nesting is visible without opening anything. */}
                           {(option.summary?.packages.length ?? 0) > 1 && (
                             <div className="px-4 pb-3">
                               <div className="ml-1 flex flex-col gap-1 border-l-2 border-border pl-3">
                                 {option.summary!.packages.map((pkg) => (
                                   <div key={pkg.name} className="flex items-center justify-between gap-3 text-xs">
                                     <span className="truncate text-muted-foreground">{pkg.name}</span>
                                     <span className="shrink-0 text-muted-foreground tabular-nums">
                                       {pkg.ownTotalR > 0 ? `${formatCurrency(Math.round(pkg.ownTotalR * 100))} on its own` : 'not priced yet'}
                                     </span>
                                   </div>
                                 ))}
                               </div>
                             </div>
                           )}
                           {isManager && sharingOption === option.id && (
                             <div className="px-3 pb-3">
                               <RecordShareControl
                                 section="quotes"
                                 recordId={option.id}
                                 table="quote_requests"
                                 ownerColumn="submitted_by"
                                 ownerId={option.submitted_by}
                                 ownerName={option.submitted_by ? nameById[option.submitted_by] ?? 'Assigned' : null}
                                 staff={staff}
                                 sharedWith={sharesByQuote[option.id] ?? []}
                                 currentUserId={currentUserId}
                                 canAssignOwner={isAdmin}
                                 canShare={isManager}
                                 ownerNoun="No owner set"
                               />
                             </div>
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
    </PageShell>
  )
}
