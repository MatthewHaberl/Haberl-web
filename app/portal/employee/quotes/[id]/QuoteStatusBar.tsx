'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Check, Send, X, Loader2, Briefcase, ArrowRight } from 'lucide-react'
import type { QuoteRequestStatus } from '@/types/database'

const STATUS_LABELS: Record<QuoteRequestStatus, string> = {
  pending:   'Pending',
  generated: 'Generated',
  sent:      'Sent',
  accepted:  'Accepted',
  declined:  'Declined',
}

const STATUS_VARIANT: Record<QuoteRequestStatus, 'default' | 'warning' | 'success'> = {
  pending:   'warning',
  generated: 'default',
  sent:      'default',
  accepted:  'success',
  declined:  'default',
}

interface Props {
  requestId: string
  initialStatus: QuoteRequestStatus
  initialJobId?: string | null
}

export function QuoteStatusBar({ requestId, initialStatus, initialJobId }: Props) {
  const [status, setStatus] = useState<QuoteRequestStatus>(initialStatus)
  const [saving, setSaving] = useState(false)
  const [jobId, setJobId] = useState<string | null>(initialJobId ?? null)
  const [jobError, setJobError] = useState('')

  async function updateStatus(next: QuoteRequestStatus) {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('quote_requests')
      .update({ status: next, ...(next === 'sent' ? { sent_at: new Date().toISOString() } : {}) })
      .eq('id', requestId)
    if (!error) setStatus(next)
    setSaving(false)
    return !error
  }

  // Accepting a quote opens a job: pipeline stages, install checklist, and the
  // BOM copied into job materials so loading/usage can be tracked on site.
  async function acceptAndCreateJob() {
    setSaving(true)
    setJobError('')
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('quote_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId)
      if (error) { setJobError(error.message); return }
      setStatus('accepted')

      const response = await fetch('/api/jobs/from-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteRequestId: requestId }),
      })
      if (!response.ok) {
        setJobError(await response.text() || `Job creation failed (HTTP ${response.status})`)
        return
      }
      const payload = await response.json()
      setJobId(payload.jobId ?? null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3 flex-wrap py-2">
        <Badge variant={STATUS_VARIANT[status]} className="shrink-0">
          {STATUS_LABELS[status]}
        </Badge>

        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        {!saving && status === 'generated' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateStatus('sent')}
          >
            <Send className="h-3.5 w-3.5" /> Mark as Sent
          </Button>
        )}

        {!saving && status === 'sent' && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={acceptAndCreateJob}
              className="text-success border-success/40 hover:bg-success/10"
            >
              <Check className="h-3.5 w-3.5" /> Accepted — Create Job
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateStatus('declined')}
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
            >
              <X className="h-3.5 w-3.5" /> Declined
            </Button>
          </>
        )}

        {!saving && status === 'accepted' && (
          jobId ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/portal/employee/jobs/${jobId}`}>
                <Briefcase className="h-3.5 w-3.5" /> Open Job <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={acceptAndCreateJob}>
              <Briefcase className="h-3.5 w-3.5" /> Create Job
            </Button>
          )
        )}

        {!saving && status === 'declined' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => updateStatus('sent')}
            className="text-muted-foreground text-xs"
          >
            Reopen
          </Button>
        )}
      </div>
      {jobError && (
        <p className="text-xs text-destructive max-w-xs text-right">{jobError}</p>
      )}
    </div>
  )
}
