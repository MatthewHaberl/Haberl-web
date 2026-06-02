'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Check, Send, X, Loader2 } from 'lucide-react'
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
}

export function QuoteStatusBar({ requestId, initialStatus }: Props) {
  const [status, setStatus] = useState<QuoteRequestStatus>(initialStatus)
  const [saving, setSaving] = useState(false)

  async function updateStatus(next: QuoteRequestStatus) {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('quote_requests')
      .update({ status: next, ...(next === 'sent' ? { sent_at: new Date().toISOString() } : {}) })
      .eq('id', requestId)
    if (!error) setStatus(next)
    setSaving(false)
  }

  return (
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
            onClick={() => updateStatus('accepted')}
            className="text-success border-success/40 hover:bg-success/10"
          >
            <Check className="h-3.5 w-3.5" /> Accepted
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
        <span className="text-xs text-success font-medium flex items-center gap-1">
          <Check className="h-3.5 w-3.5" /> Quote accepted
        </span>
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
  )
}
