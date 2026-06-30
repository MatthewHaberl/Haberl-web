'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { ClipboardList, Loader2, Phone, Trash2, UserCheck, UserCog, Check, X, CalendarPlus } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import type { Lead } from '@/types/database'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp', phone: 'Phone', 'walk-in': 'Walk-in', referral: 'Referral', other: 'Other',
}

export interface StaffMember { id: string; full_name: string }

/** Everything a lead card needs that the server resolves once (owner + shares). */
export interface LeadCardData {
  lead: Lead
  customer: { id: string; full_name: string } | null
  /** A phone match the staff dismissed as wrong — kept so the card can offer Undo. */
  dismissedCustomer: { id: string; full_name: string } | null
  /** Display name of the owner; null = unassigned pool. */
  ownerName: string | null
  /** Staff this lead has additionally been shared with. */
  sharedWith: StaffMember[]
}

/**
 * `customer` is set when this lead's phone already matches a customer on file —
 * the page resolves it. The owner badge + Assign/Share panel (managers/admins
 * only) drive record-level visibility (migration 071): assigning hands the lead
 * to someone (it moves to their list); sharing keeps the owner but lets a
 * second person help — the "activate this lead to Zacques" action.
 */
export function LeadCard({
  data,
  staff,
  currentUserId,
  canManage,
}: {
  data: LeadCardData
  staff: StaffMember[]
  currentUserId: string
  canManage: boolean
}) {
  const { lead, customer, dismissedCustomer, ownerName, sharedWith } = data
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)

  const isMine = lead.owner_id === currentUserId
  const sharedIds = new Set(sharedWith.map((s) => s.id))

  async function setStatus(status: 'contacted' | 'discarded') {
    if (status === 'discarded' && !(await confirm({
      title: `Discard the lead from ${lead.name}?`,
      confirmText: 'Discard',
      destructive: true,
    }))) return
    setBusy(true)
    const supabase = createClient()
    await supabase
      .from('leads')
      .update({ status, ...(status === 'contacted' ? { contacted_at: new Date().toISOString() } : {}) })
      .eq('id', lead.id)
    router.refresh()
    setBusy(false)
  }

  async function convertToCustomer() {
    setBusy(true)
    const res = await fetch(`/api/leads/${lead.id}/convert`, { method: 'POST' })
    if (!res.ok) {
      setBusy(false)
      await confirm({
        title: 'Could not convert this lead',
        body: 'Please try again, or check your connection.',
        confirmText: 'OK',
      })
      return
    }
    const { customerId } = await res.json()
    router.push(`/portal/employee/customers/${customerId}`)
  }

  /**
   * The "Existing customer" badge is a phone match, not a certainty — two
   * people can share a number. This records that the match is wrong so the
   * inbox stops flagging this lead as that customer and gives back the normal
   * "Convert to customer" action.
   */
  async function notTheSamePerson() {
    if (!customer) return
    setBusy(true)
    const supabase = createClient()
    await supabase.from('leads').update({ not_duplicate_customer_id: customer.id }).eq('id', lead.id)
    router.refresh()
    setBusy(false)
  }

  /** Undo a "not the same person" call — let the phone match flag the lead again. */
  async function restoreMatch() {
    setBusy(true)
    const supabase = createClient()
    await supabase.from('leads').update({ not_duplicate_customer_id: null }).eq('id', lead.id)
    router.refresh()
    setBusy(false)
  }

  async function assignOwner(ownerId: string) {
    setBusy(true)
    const supabase = createClient()
    await supabase.from('leads').update({ owner_id: ownerId || null }).eq('id', lead.id)
    router.refresh()
    setBusy(false)
  }

  async function toggleShare(memberId: string, on: boolean) {
    setBusy(true)
    const supabase = createClient()
    if (on) {
      await supabase.from('record_grants').insert({
        section: 'leads', record_id: lead.id, user_id: memberId, granted_by: currentUserId,
      })
    } else {
      await supabase.from('record_grants').delete()
        .eq('section', 'leads').eq('record_id', lead.id).eq('user_id', memberId)
    }
    router.refresh()
    setBusy(false)
  }

  return (
    <Card className="border-accent/40">
      <CardContent className="pt-4 pb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">{lead.name}</p>
              <Badge variant={lead.status === 'new' ? 'warning' : 'default'}>
                {lead.status === 'new' ? 'New lead' : 'Contacted'}
              </Badge>
              {customer && (
                <span className="inline-flex items-center gap-1">
                  <Badge variant="success">Existing customer</Badge>
                  <button
                    type="button"
                    onClick={notTheSamePerson}
                    disabled={busy}
                    className="text-[11px] text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                    title={`Mark this lead as NOT ${customer.full_name} (clears the phone match)`}
                  >
                    Not the same person?
                  </button>
                </span>
              )}
              {dismissedCustomer && (
                <span className="text-[11px] text-muted-foreground">
                  Marked not {dismissedCustomer.full_name} ·{' '}
                  <button
                    type="button"
                    onClick={restoreMatch}
                    disabled={busy}
                    className="underline hover:text-foreground disabled:opacity-50"
                    title={`Undo — flag this lead as ${dismissedCustomer.full_name} again`}
                  >
                    Undo
                  </button>
                </span>
              )}
              {/* ownership */}
              {isMine ? (
                <Badge variant="accent">Yours</Badge>
              ) : ownerName ? (
                <Badge variant="outline">{ownerName}</Badge>
              ) : (
                <Badge variant="outline">Unassigned</Badge>
              )}
              <span className="text-xs text-muted-foreground">{timeAgo(lead.created_at)}</span>
              {lead.source && lead.source !== 'website' && (
                <span className="text-xs text-muted-foreground">· via {SOURCE_LABELS[lead.source] ?? lead.source}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              <a href={`tel:${lead.phone.replace(/\D/g, '')}`} className="text-accent underline">{lead.phone}</a>
              {lead.suburb ? ` · ${lead.suburb}` : ''}
            </p>
            {sharedWith.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Shared with {sharedWith.map((s) => s.full_name).join(', ')}
              </p>
            )}
            {lead.note && <p className="text-xs text-muted-foreground mt-1 max-w-xl">&ldquo;{lead.note}&rdquo;</p>}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {!busy && lead.status === 'new' && (
              <Button variant="outline" size="sm" onClick={() => setStatus('contacted')}>
                <Phone className="h-3.5 w-3.5" /> Called
              </Button>
            )}
            {!busy && (
              <>
                {customer ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/portal/employee/customers/${customer.id}`)}
                    title="This person is already a customer"
                  >
                    <UserCheck className="h-3.5 w-3.5" /> View customer
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={convertToCustomer}
                    title="Create a customer record from this lead"
                  >
                    <UserCheck className="h-3.5 w-3.5" /> Convert to customer
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/portal/employee/calendar?leadId=${lead.id}`)}
                  title="Book a site meeting, inspection or follow-up with this lead"
                >
                  <CalendarPlus className="h-3.5 w-3.5" /> Schedule
                </Button>
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => router.push(`/portal/employee/quotes-v2/new?lead=${lead.id}`)}
                >
                  <ClipboardList className="h-3.5 w-3.5" /> Convert to survey
                </Button>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={panelOpen ? 'text-foreground' : 'text-muted-foreground'}
                    onClick={() => setPanelOpen((o) => !o)}
                    title="Assign or share this lead"
                  >
                    <UserCog className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => setStatus('discarded')}
                  title="Discard lead"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {canManage && panelOpen && (
          <div className="rounded-md border border-border bg-muted/30 p-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <label htmlFor={`owner-${lead.id}`} className="text-xs font-semibold text-muted-foreground w-28 shrink-0">
                Owner
              </label>
              <Select
                id={`owner-${lead.id}`}
                value={lead.owner_id ?? ''}
                onChange={(e) => assignOwner(e.target.value)}
                disabled={busy}
                className="sm:max-w-xs"
              >
                <option value="">Unassigned (pool)</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}{s.id === currentUserId ? ' (you)' : ''}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
              <span className="text-xs font-semibold text-muted-foreground w-28 shrink-0 sm:pt-1">
                Also shared with
              </span>
              <div className="flex flex-wrap gap-1.5">
                {staff.filter((s) => s.id !== lead.owner_id).map((s) => {
                  const on = sharedIds.has(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={busy}
                      onClick={() => toggleShare(s.id, !on)}
                      className={
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors disabled:opacity-50 ' +
                        (on
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border text-muted-foreground hover:text-foreground')
                      }
                    >
                      {on ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-40" />}
                      {s.full_name}{s.id === currentUserId ? ' (you)' : ''}
                    </button>
                  )
                })}
                {staff.filter((s) => s.id !== lead.owner_id).length === 0 && (
                  <span className="text-xs text-muted-foreground">No other staff to share with.</span>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
