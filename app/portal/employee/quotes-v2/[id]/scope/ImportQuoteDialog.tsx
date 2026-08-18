'use client'

// ─────────────────────────────────────────────────────────────────────────────
// "Add another quote to this one" — the picker behind combined quotes.
//
// Matthew quotes a customer three times over a fortnight: repair the panels,
// add a battery, rewire the AC combiner. This is how those become one document
// with one price for taking the lot.
//
// It lists the customer's OTHER scope quotes, newest first, and pulls the
// chosen ones in as work packages. Nothing is moved: the source quotes are read
// and copied, never edited or deleted — what happens to them afterwards is a
// separate, explicit choice on the combined quote's status bar.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { Check, FileText, Loader2, PackagePlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { parseScope, scopeTotals, type QuoteScope } from '@/lib/quotes/scope'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

export interface ImportableQuote {
  id: string
  label: string
  /** Quote number, site and status — the line under the name. */
  detail: string
  status: string
  createdAt: string
  scope: QuoteScope
  /** What it prices at on its own, from its own stored figures. */
  ownTotalR: number
  lineCount: number
}

/**
 * The customer's other scope quotes, in the shape the dialog lists.
 *
 * Matched on customer_id where the quote has one and on the typed name where it
 * doesn't — quotes written before customers were linked still need to combine.
 * Solar-canvas quotes are deliberately absent: they carry a SystemDesign, not a
 * scope, and there is nothing here that could import one.
 */
export function useImportableQuotes(requestId: string, customerId: string | null, customerName: string) {
  const supabase = useMemo(() => createClient(), [])
  const [quotes, setQuotes] = useState<ImportableQuote[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      let q = supabase
        .from('quote_requests')
        .select('id, quote_number, option_label, site_label, address, status, created_at, scope, work_type')
        .neq('id', requestId)
        .is('deleted_at', null)
        .not('scope', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)
      q = customerId ? q.eq('customer_id', customerId) : q.eq('customer_name', customerName)

      const { data } = await q
      if (cancelled) return

      const rows: ImportableQuote[] = []
      for (const r of data ?? []) {
        const scope = parseScope(r.scope)
        // A row whose scope won't parse, or holds nothing, has nothing to add.
        if (!scope || (scope.lines.length === 0 && !scope.summary.trim())) continue
        const detail = [r.quote_number, r.site_label || r.address, r.status]
          .filter(Boolean)
          .join(' · ')
        rows.push({
          id: r.id,
          label: (r.option_label || '').trim() || r.quote_number || 'Untitled quote',
          detail,
          status: r.status ?? 'pending',
          createdAt: r.created_at,
          scope,
          ownTotalR: scopeTotals(scope).sellR,
          lineCount: scope.lines.length,
        })
      }
      setQuotes(rows)
    }
    void run()
    return () => { cancelled = true }
  }, [supabase, requestId, customerId, customerName])

  return quotes
}

export function ImportQuoteDialog({ quotes, onImport, onClose }: {
  quotes: ImportableQuote[] | null
  /** In list order, so packages land in the order they were ticked. */
  onImport: (picked: ImportableQuote[]) => void
  onClose: () => void
}) {
  const [picked, setPicked] = useState<string[]>([])

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const chosen = (quotes ?? []).filter((q) => picked.includes(q.id))
  const separateR = chosen.reduce((t, q) => t + q.ownTotalR, 0)

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add another quote to this one"
        className="fixed inset-x-0 top-[5vh] z-50 mx-auto flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Add another quote to this one</span>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-b border-border bg-muted/40 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">
            Each quote you pick becomes a <strong className="font-medium text-foreground">work package</strong> on
            this one, keeping its own sections, items and labour. Nothing is merged and the original
            quotes are not changed — you get one document showing what each job costs on its own, plus
            a combined price for doing them all in one visit.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {quotes === null && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading this customer&rsquo;s quotes…
            </div>
          )}

          {quotes?.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm font-medium">No other quotes for this customer</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Only quotes built with the scope builder can be combined. Solar designs from the
                canvas are not on this list.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            {(quotes ?? []).map((q) => {
              const on = picked.includes(q.id)
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => toggle(q.id)}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
                    on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                    }`}
                  >
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{q.label}</span>
                      {q.status === 'sent' && <Badge variant="default">sent</Badge>}
                      {q.status === 'accepted' && <Badge variant="success">accepted</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {q.detail || 'No quote number yet'} · {q.lineCount} line
                      {q.lineCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-medium">
                    {q.ownTotalR > 0 ? rand(q.ownTotalR) : '—'}
                  </span>
                </button>
              )
            })}
          </div>

          {/* An accepted quote is work already sold. Combining it into a new
              document is how you end up billing the same job twice. */}
          {chosen.some((q) => q.status === 'accepted') && (
            <p className="mt-3 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-[11px] text-foreground">
              One of these has already been accepted. Adding it here quotes work the customer has
              already bought — make sure that is what you want.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {picked.length === 0
              ? 'Nothing picked yet'
              : `${picked.length} quote${picked.length === 1 ? '' : 's'} · ${rand(separateR)} bought separately`}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              type="button"
              size="sm"
              disabled={picked.length === 0}
              onClick={() => onImport(chosen)}
            >
              <FileText className="h-3.5 w-3.5" />
              Add {picked.length > 0 ? `${picked.length} ` : ''}as package{picked.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
