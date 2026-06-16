'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Check, Copy, Send, X, Loader2, Briefcase, ArrowRight, Eye } from 'lucide-react'
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
  shareToken: string
  customerEmail: string | null
  viewedAt: string | null
}

export function QuoteStatusBar({ requestId, initialStatus, initialJobId, shareToken, customerEmail, viewedAt }: Props) {
  const [status, setStatus] = useState<QuoteRequestStatus>(initialStatus)
  const [saving, setSaving] = useState(false)
  const [jobId, setJobId] = useState<string | null>(initialJobId ?? null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function updateStatus(next: QuoteRequestStatus, extra: Record<string, unknown> = {}) {
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { error: dbError } = await supabase
      .from('quote_requests')
      .update({ status: next, ...extra })
      .eq('id', requestId)
    if (!dbError) setStatus(next)
    else setError(dbError.message)
    setSaving(false)
    return !dbError
  }

  // Email the tokenized quote link to the customer (or stamp 'sent' for
  // manual WhatsApp/in-person sharing when manual=true).
  async function sendToCustomer(manual = false, resend = false) {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/quotes/${requestId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual, resend }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        // A resend leaves an accepted/declined quote in its current state.
        if (!resend) setStatus('sent')
        setMessage(
          manual
            ? 'Marked as sent — use Copy link to share it'
            : resend
              ? 'Re-sent to customer ✓'
              : 'Emailed to customer ✓',
        )
      } else {
        setError(data?.error ?? 'Send failed')
      }
    } finally {
      setSaving(false)
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/q/${shareToken}`
    try {
      await navigator.clipboard.writeText(url)
      setMessage('Link copied ✓')
    } catch {
      setError(url) // clipboard blocked — show the URL so it can be copied by hand
    }
  }

  // Accepting a quote opens a job: pipeline stages, install checklist, and the
  // BOM copied into job materials so loading/usage can be tracked on site.
  async function acceptAndCreateJob() {
    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const { error: dbError } = await supabase
        .from('quote_requests')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', requestId)
      if (dbError) { setError(dbError.message); return }
      setStatus('accepted')

      const response = await fetch('/api/jobs/from-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteRequestId: requestId }),
      })
      if (!response.ok) {
        setError(await response.text() || `Job creation failed (HTTP ${response.status})`)
        return
      }
      const payload = await response.json()
      setJobId(payload.jobId ?? null)
    } finally {
      setSaving(false)
    }
  }

  const copyButton = (
    <Button variant="outline" size="sm" onClick={copyLink}>
      <Copy className="h-3.5 w-3.5" /> Copy link
    </Button>
  )

  // Re-email the quote without changing its status. Available in every state
  // after the first send (sent / accepted / declined).
  const resendButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => sendToCustomer(false, true)}
      disabled={!customerEmail}
      title={customerEmail ? `Re-send the quote email to ${customerEmail}` : 'No customer email on this quote — use Copy link instead'}
    >
      <Send className="h-3.5 w-3.5" /> Resend email
    </Button>
  )

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3 flex-wrap py-2 justify-end">
        <Badge variant={STATUS_VARIANT[status]} className="shrink-0">
          {STATUS_LABELS[status]}
        </Badge>

        {viewedAt && (status === 'sent' || status === 'accepted' || status === 'declined') && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Customer opened the quote link">
            <Eye className="h-3 w-3" />
            Viewed {new Date(viewedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
          </span>
        )}

        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        {!saving && status === 'generated' && (
          <>
            <Button
              variant="accent"
              size="sm"
              onClick={() => sendToCustomer(false)}
              title={customerEmail ? `Email the quote link to ${customerEmail}` : 'No customer email on this quote'}
              disabled={!customerEmail}
            >
              <Send className="h-3.5 w-3.5" /> Email to customer
            </Button>
            {copyButton}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => sendToCustomer(true)}
              className="text-muted-foreground text-xs"
              title="Stamp as sent without emailing — for WhatsApp or in-person sharing"
            >
              Mark as sent
            </Button>
          </>
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
              onClick={() => updateStatus('declined', { declined_at: new Date().toISOString() })}
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
            >
              <X className="h-3.5 w-3.5" /> Declined
            </Button>
            {resendButton}
            {copyButton}
          </>
        )}

        {!saving && status === 'accepted' && (
          <>
            {jobId ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/portal/employee/jobs/${jobId}`}>
                  <Briefcase className="h-3.5 w-3.5" /> Open Job <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={acceptAndCreateJob}>
                <Briefcase className="h-3.5 w-3.5" /> Create Job
              </Button>
            )}
            {resendButton}
          </>
        )}

        {!saving && status === 'declined' && (
          <>
            {resendButton}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateStatus('sent', { declined_at: null, decline_reason: null })}
              className="text-muted-foreground text-xs"
            >
              Reopen
            </Button>
          </>
        )}
      </div>
      {message && <p className="text-xs text-success">{message}</p>}
      {error && (
        <p className="text-xs text-destructive max-w-xs text-right break-all">{error}</p>
      )}
    </div>
  )
}
