import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FIN_DOC_TYPE_LABEL, type FinDocType } from '@/lib/finance/types'

export interface SimilarDocVM {
  id: string
  file_name: string | null
  doc_type: FinDocType
  doc_date: string | null
  total_cents: number | null
  allocated: boolean
}

/**
 * Amber warning shown on a document when other documents look like the same
 * purchase (e.g. a pro forma vs the final invoice). Calls out the double-billing
 * risk — louder when both this and a match are already allocated.
 */
export function SimilarDocsWarning({ docs, thisAllocated }: { docs: SimilarDocVM[]; thisAllocated: boolean }) {
  if (docs.length === 0) return null
  const bothAllocated = thisAllocated && docs.some((d) => d.allocated)

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-4 dark:bg-amber-950/20">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 space-y-2 text-sm">
          <p className="font-medium text-amber-900 dark:text-amber-200">Possible duplicate — double-billing risk</p>
          <p className="text-amber-900/90 dark:text-amber-200/90">
            {bothAllocated
              ? 'This document and a match below are BOTH allocated and look like the same purchase — the customer may be billed twice. Keep only one allocated.'
              : 'These look like the same purchase as this document (same customer/supplier, close date, similar total). Don’t allocate or bill both, or the customer is charged twice.'}
          </p>
          <ul className="divide-y divide-amber-200/60 rounded-md border border-amber-200/60 bg-background/50">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <Link href={`/portal/employee/finance/${d.id}`}
                  className="min-w-0 flex-1 truncate text-accent hover:underline" title={d.file_name ?? undefined}>
                  {d.file_name ?? 'Document'}
                </Link>
                <Badge variant="outline">{FIN_DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}</Badge>
                {d.allocated && <Badge variant="warning">Allocated</Badge>}
                <span className="whitespace-nowrap text-muted-foreground">{d.doc_date ? formatDate(d.doc_date) : ''}</span>
                <span className="whitespace-nowrap font-medium tabular-nums">
                  {d.total_cents != null ? formatCurrency(d.total_cents) : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
