'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Apply supplier prices (W100) — "the RFQ came back, price the quote off it".
//
// Opens on one uploaded supplier quote, asks the server which of this quote's
// items that document prices, and shows three lists:
//   · what will change     — ticked by default, old cost → new cost, per item
//   · what it doesn't cover — the items to price by hand, stated plainly so the
//                             gap is visible instead of assumed
//   · what it prices that we don't use — usually something to add to the quote
//
// Applying writes an override onto the quote (not the catalog): those parts cost
// what this document says for THIS job. Everything else keeps pricing normally.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { Check, FileText, Loader2, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type {
  SupplierPriceMatch, SupplierPriceMatchReport, SupplierPriceTier,
} from '@/lib/quotes/supplier-price-match'
import { requestApplySupplierPrices } from './supplier-prices-bus'

const rand = (n: number) =>
  `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TIER_NOTE: Record<SupplierPriceTier, string | null> = {
  catalog: null,
  exact: null,
  // The one match worth a second look: the part numbers differ by punctuation.
  loose: 'Part numbers differ by a dash or a space — check this is the same item.',
}

interface MatchResponse extends SupplierPriceMatchReport {
  engine: 'scope' | 'solar'
  supplierQuote: { id: string; supplier: string; reference: string | null; quoteDate: string | null }
  markup: number
}

export function ApplySupplierPricesDialog({ requestId, supplierQuoteId, onClose }: {
  requestId: string
  supplierQuoteId: string
  onClose: () => void
}) {
  const [report, setReport] = useState<MatchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [showUnused, setShowUnused] = useState(false)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the previous document's error before re-fetching; the rest of the state lands after the request resolves.
    setError(null)
    fetch(`/api/quotes/${requestId}/supplier-quotes/${supplierQuoteId}/match`)
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok) { setError(body?.error ?? 'Could not read this supplier quote.'); return }
        const data = body as MatchResponse
        setReport(data)
        // Everything that actually moves the price starts ticked — this is a
        // bulk action, and the point is one click for the whole document.
        setPicked(new Set(data.matches.filter((m) => !m.unchanged).map((m) => m.key)))
      })
      .catch(() => { if (!cancelled) setError('Could not read this supplier quote.') })
    return () => { cancelled = true }
  }, [requestId, supplierQuoteId])

  const toggle = (key: string) =>
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })

  const chosen = useMemo(
    () => (report?.matches ?? []).filter((m) => picked.has(m.key)),
    [report, picked],
  )

  // What this does to the job's cost — the number worth knowing before applying.
  const delta = useMemo(
    () => chosen.reduce((t, m) => t + (m.newUnitCostR - m.currentUnitCostR) * m.qty, 0),
    [chosen],
  )

  function apply() {
    if (!report || chosen.length === 0) return
    requestApplySupplierPrices({
      matches: chosen,
      supplierQuoteId: report.supplierQuote.id,
      supplier: report.supplierQuote.supplier,
      reference: report.supplierQuote.reference,
    })
    onClose()
  }

  const title = report
    ? [report.supplierQuote.supplier, report.supplierQuote.reference].filter(Boolean).join(' · ')
    : 'Supplier quote'

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Apply supplier prices to this quote"
        className="fixed inset-x-0 top-[4vh] z-50 mx-auto flex max-h-[92vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold">Price this quote off {title}</span>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!report && !error && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Matching the document against this quote…
          </div>
        )}

        {error && (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {report && (
          <>
            <div className="border-b border-border bg-muted/40 px-4 py-2.5">
              <p className="text-xs text-muted-foreground">
                Every item below is matched by part number. Applying puts the supplier&rsquo;s price
                on <strong className="font-medium text-foreground">this quote only</strong>{' '}
                — landed cost is the ex-VAT rate&nbsp;×&nbsp;1.15, and the sell price follows your
                markup. The catalog and every other quote are left alone.
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {report.matches.length === 0 && (
                <div className="py-10 text-center">
                  <p className="text-sm font-medium">Nothing on this quote matches that document</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                    No part number on the supplier&rsquo;s quote appears on this one. Check the SKUs
                    in the panel behind this dialog, or pull the lines in one at a time.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                {report.matches.map((m) => (
                  <MatchRow key={m.key} m={m} on={picked.has(m.key)} onToggle={() => toggle(m.key)} />
                ))}
              </div>

              {/* The gap, stated. These are the ones to price by hand. */}
              {report.unmatched.length > 0 && (
                <div className="mt-4 rounded-md border border-border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                    onClick={() => setShowUnmatched((v) => !v)}
                  >
                    <span className="text-xs font-medium">
                      {report.unmatched.length} item{report.unmatched.length === 1 ? '' : 's'} on this
                      quote that {report.supplierQuote.supplier || 'the supplier'}{' '}didn&rsquo;t price
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {showUnmatched ? 'Hide' : 'Show'}
                    </span>
                  </button>
                  {showUnmatched && (
                    <ul className="space-y-1 border-t border-border px-3 py-2">
                      {report.unmatched.map((u, i) => (
                        <li key={`${u.sku}-${i}`} className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="min-w-0">
                            <span className="font-medium">{u.sku || '(no part number)'}</span>
                            <span className="text-muted-foreground"> — {u.description}</span>
                          </span>
                          <span className="shrink-0 text-muted-foreground">
                            {u.qty} × {u.currentUnitCostR > 0 ? rand(u.currentUnitCostR) : 'no price'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {report.unused.length > 0 && (
                <div className="mt-2 rounded-md border border-border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                    onClick={() => setShowUnused((v) => !v)}
                  >
                    <span className="text-xs font-medium">
                      {report.unused.length} priced line{report.unused.length === 1 ? '' : 's'}{' '}on
                      the document that this quote doesn&rsquo;t use
                    </span>
                    <span className="text-xs text-muted-foreground">{showUnused ? 'Hide' : 'Show'}</span>
                  </button>
                  {showUnused && (
                    <ul className="space-y-1 border-t border-border px-3 py-2">
                      {report.unused.map((u) => (
                        <li key={u.lineId} className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="min-w-0">
                            <span className="font-medium">{u.sku || '(no part number)'}</span>
                            <span className="text-muted-foreground"> — {u.description}</span>
                          </span>
                          <span className="shrink-0 text-muted-foreground">
                            {u.qty} × {rand(u.unitCostR)} landed
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                    Add these with &ldquo;From supplier quote&rdquo; in the section they belong to.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
              <span className="text-xs text-muted-foreground">
                {chosen.length} of {report.matches.length} ticked
                {chosen.length > 0 && (
                  <>
                    {' · '}job cost{' '}
                    <span className={`font-medium ${delta > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                      {delta === 0 ? 'unchanged' : `${delta > 0 ? '+' : '−'}${rand(Math.abs(delta))}`}
                    </span>
                  </>
                )}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                <Button type="button" size="sm" onClick={apply} disabled={chosen.length === 0}>
                  <Check className="h-3.5 w-3.5" />
                  Apply {chosen.length} price{chosen.length === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function MatchRow({ m, on, onToggle }: { m: SupplierPriceMatch; on: boolean; onToggle: () => void }) {
  const moved = m.currentUnitCostR > 0 && Math.abs(m.newUnitCostR - m.currentUnitCostR) >= 0.005
  const pct = moved ? ((m.newUnitCostR - m.currentUnitCostR) / m.currentUnitCostR) * 100 : 0
  const note = TIER_NOTE[m.tier]
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors ${
        on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
      }`}
    >
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
        }`}
      >
        {on && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{m.sku || '(no part number)'}</span>
          <span className="truncate text-xs text-muted-foreground">{m.description}</span>
          {m.unchanged && <Badge variant="outline">Already applied</Badge>}
          {m.tier === 'loose' && <Badge variant="warning">Near match</Badge>}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {m.section} · {m.qty} × {m.currentUnitCostR > 0 ? rand(m.currentUnitCostR) : 'no price yet'}
          {' → '}
          <span className="font-medium text-foreground">{rand(m.newUnitCostR)}</span> landed
          {moved && (
            <span className={pct > 0 ? ' text-amber-600 dark:text-amber-400' : ' text-emerald-600 dark:text-emerald-400'}>
              {' '}({pct > 0 ? '+' : '−'}{Math.abs(pct).toFixed(0)}%)
            </span>
          )}
        </span>
        {note && (
          <span className="mt-1 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
            <TriangleAlert className="h-3 w-3" /> {note}
          </span>
        )}
      </span>
    </button>
  )
}
