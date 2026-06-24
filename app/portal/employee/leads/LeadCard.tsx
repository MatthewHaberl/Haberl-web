'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClipboardList, Loader2, Phone, Trash2, UserCheck } from 'lucide-react'
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

export function LeadCard({ lead }: { lead: Lead }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)

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

  return (
    <Card className="border-accent/40">
      <CardContent className="pt-4 pb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm">{lead.name}</p>
            <Badge variant={lead.status === 'new' ? 'warning' : 'default'}>
              {lead.status === 'new' ? 'New lead' : 'Contacted'}
            </Badge>
            <span className="text-xs text-muted-foreground">{timeAgo(lead.created_at)}</span>
            {lead.source && lead.source !== 'website' && (
              <span className="text-xs text-muted-foreground">· via {SOURCE_LABELS[lead.source] ?? lead.source}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            <a href={`tel:${lead.phone.replace(/\D/g, '')}`} className="text-accent underline">{lead.phone}</a>
            {lead.suburb ? ` · ${lead.suburb}` : ''}
          </p>
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
              <Button
                variant="outline"
                size="sm"
                onClick={convertToCustomer}
                title="Create a customer record from this lead"
              >
                <UserCheck className="h-3.5 w-3.5" /> Convert to customer
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={() => router.push(`/portal/employee/quotes/new?lead=${lead.id}`)}
              >
                <ClipboardList className="h-3.5 w-3.5" /> Convert to survey
              </Button>
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
      </CardContent>
    </Card>
  )
}
