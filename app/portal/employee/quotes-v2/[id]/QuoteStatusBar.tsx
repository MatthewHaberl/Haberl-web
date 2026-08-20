'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Check, Copy, Send, X, Loader2, Briefcase, ArrowRight, Eye, MessageCircle, FilePen, FileText, RefreshCw, ScanEye } from 'lucide-react'
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
  /** Solar-engine quote — drives the WhatsApp message wording (W97). */
  isSolar?: boolean
  /**
   * Asked before Generate runs. Returns the reasons the builder can't become a
   * document yet (empty = go ahead) and reveals them in the builder itself.
   * The server refuses the same cases; this is so nobody has to round-trip to
   * find out, and so the answer lands next to the field that caused it.
   */
  preflight?: () => string[]
}

export function QuoteStatusBar({ requestId, initialStatus, initialJobId, shareToken, customerEmail, customerPhone, customerName, quoteNumber, viewedAt, isSolar = true, preflight }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState<QuoteRequestStatus>(initialStatus)
  const [saving, setSaving] = useState(false)
  const [jobId, setJobId] = useState<string | null>(initialJobId ?? null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  // Reissue: the reason box is open, and what has been typed into it. A sent
  // quote is never re-rendered without one — the reason is what the amendment
  // trail is FOR, and asking afterwards never happens.
  const [reissuing, setReissuing] = useState(false)
  const [reason, setReason] = useState('')

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
  async function sendToCustomer(
    manual = false,
    resend = false,
    method: 'email' | 'whatsapp' | 'manual' = manual ? 'manual' : 'email',
  ) {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/quotes/${requestId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual, resend, method }),
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
  async function generateQuote(amend = false) {
    setError('')
    setMessage('')
    // Ask the builder first. A quote that can't be rendered should say so here,
    // with the offending field on screen — not after it has been sent.
    const blockers = preflight?.() ?? []
    if (blockers.length > 0) {
      setError(blockers.length === 1
        ? blockers[0]
        : `${blockers.length} things need fixing first — they're marked in red below.`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/quotes/${requestId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(amend ? { amend: true, reason } : {}),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        // A reissue drops the quote back to 'generated' server-side, which is
        // what puts the send buttons back — the customer only hears about the
        // change when it is actually sent.
        setStatus('generated')
        setReissuing(false)
        setReason('')
        const bits = [
          amend
            ? `Reissued — R${Number(data?.totalR ?? 0).toLocaleString('en-ZA')}. Send it to the customer.`
            : `Quote ${data?.quoteNumber ?? ''} saved — R${Number(data?.totalR ?? 0).toLocaleString('en-ZA')}`,
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
    const message = `${greeting}, here's your ${isSolar ? 'Haberl Solar quote' : 'quote from Haberl Electrical & Solar'}${ref}. You can view it, accept it, or ask me anything here: ${url}`
    // Open synchronously inside the click so the browser doesn't block the tab.
    window.open(waLink(customerPhone, message), '_blank', 'noopener')
    // Recorded as a WhatsApp share, not a generic "manual" one: "they never got
    // it" is answered completely differently for a chat than for an email.
    if (markSent) await sendToCustomer(true, false, 'whatsapp')
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

  /**
   * Reissue — how an already-sent quote gets changed.
   *
   * The builders never locked, so a sent quote could always be EDITED; what it
   * could not do was rebuild the document, which meant the edit sat on screen
   * while the customer's link went on serving the old page. This re-prices from
   * today's catalog, replaces the document and drops the quote back to
   * 'generated', so the ordinary send buttons are what put the change in front
   * of the customer — and the send is what records the new version.
   */
  const reissueButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setReissuing(true)}
      title="Rebuild this quote's document from the current design and send it again. Re-prices from today's catalog; the version the customer already has is kept in Sent history."
    >
      <FilePen className="h-3.5 w-3.5" /> Reissue
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

        {/* The document switches used to live here and disappear the moment the
            quote was sent — which is the one time you most need to see them.
            They are in the "Sending & document settings" panel below now, at
            every status, next to the record of how the quote went out. */}

        {/* See it the customer's way, at any status. Draft quotes render live
            from the current design; sent ones show the document they hold. */}
        <Button asChild variant="outline" size="sm">
          <Link
            href={`/q/preview/${requestId}`}
            target="_blank"
            rel="noopener"
            title="Open this quote in the customer's view — nothing is sent or saved"
          >
            <ScanEye className="h-3.5 w-3.5" /> Preview as customer
          </Link>
        </Button>

        {!saving && status === 'pending' && (
          <Button
            variant="accent"
            size="sm"
            onClick={() => generateQuote()}
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
              onClick={() => generateQuote()}
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
            {reissueButton}
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
            {reissueButton}
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

      {/* Why it changed. Asked BEFORE the document is replaced, because nobody
          ever comes back to fill it in afterwards — and it is what makes the
          Sent history an audit trail rather than a list of dates. */}
      {reissuing && (
        <div className="flex flex-col items-end gap-1.5 rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground max-w-sm text-right">
            Rebuilds the document from the current design and re-prices it at today&rsquo;s catalog
            costs. The version the customer already has is kept in Sent history &mdash; they only see
            the new one once you send it.
          </p>
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What changed? e.g. added the second battery"
            maxLength={200}
            className="h-9 w-72 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground text-xs"
              onClick={() => { setReissuing(false); setReason('') }}
            >
              Cancel
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={reason.trim().length < 3}
              onClick={() => generateQuote(true)}
              title={reason.trim().length < 3 ? 'Say what changed first' : 'Rebuild and re-price the document'}
            >
              <FilePen className="h-3.5 w-3.5" /> Reissue quote
            </Button>
          </div>
        </div>
      )}

      {message && <p className="text-xs text-success">{message}</p>}
      {error && (
        <p className="text-xs text-destructive max-w-xs text-right break-all">{error}</p>
      )}
    </div>
  )
}
