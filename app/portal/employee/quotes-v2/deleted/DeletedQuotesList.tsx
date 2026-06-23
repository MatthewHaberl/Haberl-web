'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { RotateCcw, Loader2, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface DeletedRow {
  id: string
  customer_name: string | null
  quote_number: string | null
  total_amount: number | null
  created_at: string
  deleted_at: string
  site_label: string | null
  address: string | null
  deleter: { full_name: string | null } | null
}

export function DeletedQuotesList({ rows }: { rows: DeletedRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function restore(id: string) {
    setBusy(id)
    try {
      const supabase = createClient()
      await supabase.from('quote_requests').update({ deleted_at: null, deleted_by: null }).eq('id', id)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
        <Trash2 className="mx-auto mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm">No deleted quotes.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {r.customer_name ?? 'Unknown customer'}{r.quote_number ? ` · ${r.quote_number}` : ''}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {r.site_label || r.address || ''}
              {r.total_amount != null ? ` · ${formatCurrency(r.total_amount)}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              Deleted {new Date(r.deleted_at).toLocaleDateString('en-ZA')}
              {r.deleter?.full_name ? ` by ${r.deleter.full_name}` : ''}
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => restore(r.id)}>
            {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Restore
          </Button>
        </div>
      ))}
    </div>
  )
}
