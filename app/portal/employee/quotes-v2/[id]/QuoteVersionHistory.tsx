'use client'

import { useState } from 'react'
import { History, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react'
import { diffVersions, type QuoteVersion } from '@/lib/quotes/versions'

/**
 * What the customer was actually sent, and when (W56 phase 1).
 *
 * Each send archives the whole quote into an append-only row, so this list is
 * the record a dispute gets settled from — "the quote you accepted on 14 July
 * was v2 at R148,300" — rather than whatever the quote happens to say today.
 */
export function QuoteVersionHistory({ versions }: { versions: QuoteVersion[] }) {
  const [open, setOpen] = useState(false)
  if (versions.length === 0) return null

  const dateTime = (iso: string) =>
    new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const rands = (cents: number | null) =>
    cents == null ? '—' : `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="mx-auto mb-4 max-w-5xl rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-sm"
      >
        <span className="flex items-center gap-2 font-medium text-foreground">
          <History className="h-4 w-4 text-muted-foreground" />
          Sent history
          <span className="font-normal text-muted-foreground">
            {versions.length} version{versions.length === 1 ? '' : 's'} · latest v{versions[0].version} on {dateTime(versions[0].sent_at)}
          </span>
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="flex flex-col divide-y divide-border border-t border-border">
          {versions.map((v, i) => {
            // versions are newest-first, so the NEXT entry is the older one.
            const previous = versions[i + 1]
            const changes = previous ? diffVersions(previous, v) : []
            return (
              <div key={v.id} className="flex flex-col gap-1 px-4 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    v{v.version}
                    {v.version === 1 && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">original</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dateTime(v.sent_at)} · {rands(v.total_amount)}
                    {v.expiry_date && ` · valid to ${v.expiry_date}`}
                  </span>
                </div>
                {v.amendment_reason && (
                  <p className="text-xs text-muted-foreground">Reason: {v.amendment_reason}</p>
                )}
                {changes.length > 0 && (
                  <ul className="flex flex-col gap-0.5">
                    {changes.map((c) => (
                      <li key={c.label} className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{c.label}</span>
                        <span className="line-through">{c.from}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="font-medium text-foreground">{c.to}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
          <p className="px-4 py-2 text-[11px] text-muted-foreground">
            Each send is archived and can never be edited. Editing this quote and sending again
            records a new version — the customer always sees the latest one.
          </p>
        </div>
      )}
    </div>
  )
}
