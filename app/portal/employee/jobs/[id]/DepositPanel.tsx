'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, ExternalLink, Landmark, Loader2, XCircle } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { formatCents } from '@/lib/quotes/public'

interface Props {
  jobId: string
  depositCents: number | null
  proofSignedUrl: string | null
  proofUploadedAt: string | null
  confirmedAt: string | null
  rejectedAt: string | null
  rejectedReason: string | null
  rejectedProofSignedUrl: string | null
  canConfirm: boolean
}

const DECLINE_REASONS = [
  "The amount paid doesn't match the deposit",
  'Payment reference missing or incorrect',
  "We couldn't open or read the file",
  "Payment hasn't reflected in our account yet",
]

export function DepositPanel({
  jobId,
  depositCents,
  proofSignedUrl,
  proofUploadedAt,
  confirmedAt,
  rejectedAt,
  rejectedReason,
  rejectedProofSignedUrl,
  canConfirm,
}: Props) {
  const router = useRouter()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showDecline, setShowDecline] = useState(false)
  const [reasonChoice, setReasonChoice] = useState(DECLINE_REASONS[0])
  const [note, setNote] = useState('')

  // Proof present and not yet confirmed → manager decides (confirm or decline).
  const awaitingDecision = !!proofSignedUrl && !confirmedAt
  // No live proof, not confirmed, but a prior decline stands → waiting on re-upload.
  const declinedWaiting = !proofSignedUrl && !confirmedAt && !!rejectedAt

  async function confirmDeposit() {
    if (!(await confirm({
      title: 'Confirm the deposit has been received and reconciled?',
      body: 'The job advances to Procurement and the customer gets a receipt email.',
      confirmText: 'Confirm deposit',
    }))) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/jobs/${jobId}/confirm-deposit`, { method: 'POST' })
      if (!res.ok) {
        setError(await res.text() || 'Could not confirm deposit')
        return
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function declineProof() {
    const trimmed = note.trim()
    const reason = reasonChoice === 'Other'
      ? trimmed
      : trimmed ? `${reasonChoice} — ${trimmed}` : reasonChoice
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/jobs/${jobId}/reject-deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      })
      if (!res.ok) {
        setError(await res.text() || 'Could not decline the proof of payment')
        return
      }
      setShowDecline(false)
      setNote('')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-accent" />
            <div>
              <p className="text-xs text-muted-foreground">Deposit</p>
              <p className="text-sm font-semibold">{formatCents(depositCents)}</p>
            </div>
          </div>

          {confirmedAt ? (
            <span className="flex items-center gap-1.5 text-sm text-success font-medium">
              <Check className="h-4 w-4" /> Confirmed{' '}
              {new Date(confirmedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
            </span>
          ) : canConfirm && awaitingDecision ? (
            <div className="flex items-center gap-2">
              <Button variant="accent" size="sm" onClick={confirmDeposit} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Confirm deposit received
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowDecline((v) => !v)} disabled={busy}>
                <XCircle className="h-3.5 w-3.5" /> Decline
              </Button>
            </div>
          ) : null}
        </div>

        {/* Live proof awaiting a decision */}
        {awaitingDecision && (
          <div className="text-sm">
            <a
              href={proofSignedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-accent underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View proof of payment
              {proofUploadedAt && (
                <span className="text-muted-foreground no-underline">
                  (uploaded {new Date(proofUploadedAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})
                </span>
              )}
            </a>
          </div>
        )}

        {/* Decline reason picker */}
        {awaitingDecision && showDecline && (
          <div className="rounded-md border border-border bg-muted/40 p-3 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Why are you declining? The customer gets an email with this reason and is asked to
              upload a new proof of payment.
            </p>
            <select
              value={reasonChoice}
              onChange={(e) => setReasonChoice(e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm"
            >
              {DECLINE_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
              <option value="Other">Other (use the note below)</option>
            </select>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={reasonChoice === 'Other'
                ? 'Tell the customer what to fix'
                : 'Optional — add detail (e.g. expected R5 000, received R3 500)'}
              rows={2}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm resize-none"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={busy || (reasonChoice === 'Other' && !note.trim())}
                onClick={declineProof}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                Decline &amp; request new proof
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowDecline(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Declined — waiting on the customer to re-upload */}
        {declinedWaiting && (
          <div className="rounded-md border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-300 flex flex-col gap-1">
            <span>
              Proof declined{' '}
              {new Date(rejectedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
              {rejectedReason ? ` — ${rejectedReason}` : ''}. We&apos;ve asked the customer to upload a new one.
            </span>
            {rejectedProofSignedUrl && (
              <a
                href={rejectedProofSignedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 underline w-fit"
              >
                <ExternalLink className="h-3.5 w-3.5" /> View the declined file
              </a>
            )}
          </div>
        )}

        {/* Nothing uploaded yet */}
        {!awaitingDecision && !declinedWaiting && !confirmedAt && (
          <p className="text-sm text-muted-foreground">
            No proof of payment uploaded yet — the customer has the EFT details on their quote page.
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
