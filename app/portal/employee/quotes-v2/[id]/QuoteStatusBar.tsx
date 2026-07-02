'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Check, Copy, Send, X, Loader2, Briefcase, ArrowRight, Eye, MessageCircle, FileText, RefreshCw } from 'lucide-react'
import type { QuoteRequestStatus } from '@/types/database'

/**
 * Build a wa.me click-to-chat link. Normalises SA numbers to international
 * format (0XX… → 27XX…, strips spaces/punctuation). With no number it returns a
 * contact-picker link so the quote can still be shared to any WhatsApp chat.
 */
function waLink(phone: string | null, message: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  let number = ''
  if (digits) {
    if (digits.startsWith('00')) number = digits.slice(2)
    else if (digits.startsWith('27')) number = digits
    else if (digits.startsWith('0')) number = `27${digits.slice(1)}`
    else number = digits
  }
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

const STATUS_LABELS: Record<QuoteRequestStatus, string> = {
  pending:   'Pending',
  generated: 'Generated',
  sent:      'Sent',
  accepted:  'Accepted',
  declined:  'Declined',
}

const STATUS_VARIANT: Record<QuoteRequestStatus, 'default' | 'warning' | 'success'> = {
  pending:   'warning',
  generated: 'success', // matches the quotes list — "ready to send" reads green everywhere
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
  customerPhone: string | null
  customerName: string
  quoteNumber: string | null
  viewedAt: string | null
}

export function QuoteStatusBar({ requestId, initialStatus, initialJobId, shareToken, customerEmail, customerPhone, customerName, quoteNumber, viewedAt }: Props) {
  const router = useRouter()
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

  // Generate & save the customer quote from the live design (the v2 bridge):
  // renders quote_html, allocates the quote number, snapshots the BOM and
  // flips pending → generated so the send buttons appear.
  async function generateQuote() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/quotes/${requestId}/generate`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setStatus('generated')
        const bits = [
          `Quote ${data?.quoteNumber ?? ''} saved — R${Number(data?.totalR ?? 0).toLocaleString('en-ZA')}`,
          data?.needsPricing > 0 ? `${data.needsPricing} item(s) still need pricing` : null,
          data?.complianceBlockers > 0 ? `⚠ ${data.complianceBlockers} compliance blocker(s)` : null,
        ].filter(Boolean)
        setMessage(bits.join(' · '))
        router.refresh()
      } else {
        setError(data?.error ?? 'Generate failed')
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

  // Share the quote link over WhatsApp — SA customers reply on WhatsApp far more
  // than email. The chat opens with a pre-filled message; from the 'generated'
  // state sharing also stamps the quote 'sent' (markSent) so it enters the
  // follow-up pipeline, exactly like "Mark as sent". Re-shares leave status alone.
  async function shareWhatsApp(markSent: boolean) {
    setError('')
    const url = `${window.location.origin}/q/${shareToken}`
    const greeting = customerName ? `Hi ${customerName.trim().split(' ')[0]}` : 'Hi'
    const ref = quoteNumber ? ` (${quoteNumber})` : ''
    const message = `${greeting}, here's your Haberl Solar quote${ref}. You can view it, accept it, or ask me anything here: ${url}`
    // Open synchronously inside the click so the browser doesn't block the tab.
    window.open(waLink(customerPhone, message), '_blank', 'noopener')
    if (markSent) await sendToCustomer(true)
    else setMessage('Opened WhatsApp ✓')
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
        const detail = await response.text()
        setError(detail || `Job creation failed (HTTP ${response.status})`)
        return
      }
      const payload = await response.json()
      if (!payload.jobId) {
        setError('Job was created but no job ID came back. Refresh and try Open Job again.')
        return
      }
      setJobId(payload.jobId)
      router.push(`/portal/employee/jobs/${payload.jobId}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Job creation failed')
    } finally {
      setSaving(false)
    }
  }

  const copyButton = (
    <Button variant="outline" size="sm" onClick={copyLink}>
      <Copy className="h-3.5 w-3.5" /> Copy link
    </Button>
  )

  // markSent=true on first share (acts as a send); false for a re-share.
  const whatsappButton = (markSent: boolean) => (
    <Button
      variant="outline"
      size="sm"
      onClick={() => shareWhatsApp(markSent)}
      className="text-success border-success/40 hover:bg-success/10"
      title={customerPhone ? `Share on WhatsApp with ${customerPhone}` : 'Open WhatsApp and pick a contact to share the quote link'}
    >
      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
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

        {!saving && status === 'pending' && (
          <Button
            variant="accent"
            size="sm"
            onClick={generateQuote}
            title="Render the customer quote from the design, allocate a quote number and unlock sending"
          >
            <FileText className="h-3.5 w-3.5" /> Generate quote
          </Button>
        )}

        {!saving && status === 'generated' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={generateQuote}
              className="text-muted-foreground text-xs"
              title="Re-render the quote from the current design (overwrites the draft — fine until it's sent)"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Regenerate
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={() => sendToCustomer(false)}
              title={customerEmail ? `Email the quote link to ${customerEmail}` : 'No customer email on this quote'}
              disabled={!customerEmail}
            >
              <Send className="h-3.5 w-3.5" /> Email to customer
            </Button>
            {whatsappButton(true)}
            {copyButton}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => sendToCustomer(true)}
              className="text-muted-foreground text-xs"
              title="Stamp as sent without emailing — for in-person sharing"
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
            {whatsappButton(false)}
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
            {whatsappButton(false)}
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
