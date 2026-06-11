'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, ExternalLink, Landmark, Loader2 } from 'lucide-react'
import { formatCents } from '@/lib/quotes/public'

interface Props {
  jobId: string
  depositCents: number | null
  proofSignedUrl: string | null
  proofUploadedAt: string | null
  confirmedAt: string | null
  canConfirm: boolean
}

export function DepositPanel({ jobId, depositCents, proofSignedUrl, proofUploadedAt, confirmedAt, canConfirm }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirmDeposit() {
    if (!window.confirm('Confirm the deposit has been received and reconciled? The job advances to Procurement and the customer gets a receipt email.')) return
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
          ) : canConfirm ? (
            <Button variant="accent" size="sm" onClick={confirmDeposit} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Confirm deposit received
            </Button>
          ) : null}
        </div>

        <div className="text-sm">
          {proofSignedUrl ? (
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
          ) : confirmedAt ? null : (
            <p className="text-muted-foreground">
              No proof of payment uploaded yet — the customer has the EFT details on their quote page.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
