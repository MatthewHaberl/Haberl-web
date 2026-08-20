'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Credits (migration 126) — money that comes off what this customer pays,
// for a reason that has nothing to do with what the job costs.
//
// Engine-agnostic on purpose: a credit is a property of the QUOTE, not of the
// design or the scope behind it, so this panel sits below both builders and
// works the same either way. Nothing here touches a line item — the sections
// still add up to the price of the work, and the credit comes off the bottom.
//
// The kind is the whole point of the form. A deposit already paid reduces the
// DEPOSIT still due; a credit or a reimbursement reduces the BALANCE. Picking
// the wrong one either asks the customer for the same deposit twice or has us
// buying materials to settle a debt that isn't due until the job is finished.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Trash2, TriangleAlert, Wallet } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CollapsibleSection } from '@/components/ui/collapsible-section'
import {
  CREDIT_KINDS, applyCredits, creditKindSpec, grossFiguresFromDocument, newCreditId,
  parseCredits, randZA, type QuoteCredit, type QuoteCreditKind,
} from '@/lib/quotes/credits'

interface Props {
  requestId: string
  /** quote_requests.credits — the saved jsonb. */
  rawCredits: unknown
  /** Drives the wording: nothing is on paper yet until the quote is generated. */
  status: string
  /**
   * quote_requests.generated_quote — the priced document, read ONLY for the
   * gross total and gross deposit behind it.
   *
   * total_amount / deposit_amount on the row are no use here: they are already
   * net of the saved credits, so previewing an edited list against them would
   * credit an already-credited figure. See grossFiguresFromDocument.
   */
  generatedQuote: unknown
  /** True when the quote is split into work packages. See the note in render. */
  hasPackages: boolean
}

/** A row being edited. `amount` stays a string so a half-typed number isn't 0. */
interface Draft {
  id: string
  kind: QuoteCreditKind
  label: string
  amount: string
  note: string
  createdAt: string | null
}

function toDraft(c: QuoteCredit): Draft {
  return {
    id: c.id,
    kind: c.kind,
    label: c.label,
    amount: String(c.amountR),
    note: c.note ?? '',
    createdAt: c.createdAt,
  }
}

function toCredit(d: Draft): QuoteCredit | null {
  const amountR = Number(d.amount)
  if (!Number.isFinite(amountR) || amountR <= 0) return null
  return {
    id: d.id,
    kind: d.kind,
    label: d.label.trim() || creditKindSpec(d.kind).defaultLabel,
    amountR,
    note: d.note.trim() || null,
    createdAt: d.createdAt,
  }
}

export function CreditsPanel({
  requestId, rawCredits, status, generatedQuote, hasPackages,
}: Props) {
  const router = useRouter()
  const saved = useMemo(() => parseCredits(rawCredits), [rawCredits])
  const [rows, setRows] = useState<Draft[]>(() => saved.map(toDraft))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Re-seed when the row is re-read from the server (a save, a regenerate).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to a new server prop, not deriving state from render.
    setRows(saved.map(toDraft))
  }, [saved])

  const valid = rows.map(toCredit).filter((c): c is QuoteCredit => c !== null)
  const incomplete = rows.length - valid.length
  const dirty = JSON.stringify(valid) !== JSON.stringify(saved)

  // Preview off the document's own GROSS figures, so the arithmetic here is the
  // same arithmetic the server will run. Null until the quote is generated —
  // there is no priced document to credit yet, and the panel says so instead of
  // inventing a total.
  const gross = useMemo(() => grossFiguresFromDocument(generatedQuote), [generatedQuote])
  const preview = gross ? applyCredits(gross.grossTotalR, gross.grossDepositR, valid) : null
  const creditTotalR = valid.reduce((t, c) => t + c.amountR, 0)
  const generated = status !== 'pending'
  const issued = status === 'sent' || status === 'accepted' || status === 'declined'

  function update(id: string, patch: Partial<Draft>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function add() {
    setRows((prev) => [...prev, {
      id: newCreditId(),
      kind: 'credit',
      label: '',
      amount: '',
      note: '',
      createdAt: new Date().toISOString(),
    }])
  }

  async function save() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(`/api/quotes/${requestId}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits: valid }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? 'Could not save the credits')
        return
      }
      setMessage(
        data?.reissued
          ? `Saved and the quote document reissued — total payable ${randZA(Number(data.payableTotalR ?? 0))}.`
          : 'Saved — it lands on the document the next time you generate the quote.',
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the credits')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <CollapsibleSection
          storageKey={`quote-credits:${requestId}`}
          title="Credits & payments received"
          icon={<Wallet />}
          count={saved.length || undefined}
          defaultOpen={saved.length > 0}
          actions={
            <Button variant="outline" size="sm" onClick={add} type="button">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          }
        >
          <p className="text-xs text-muted-foreground mb-3 max-w-3xl">
            Money that comes off what this customer pays, for a reason that isn&rsquo;t about the
            work: a deposit they&rsquo;ve already paid, a part back under warranty, materials they
            bought themselves, or something taken off as a gesture. It never changes a line item &mdash;
            the sections still price the job, and this comes off the bottom of the quote with the
            reason printed next to it.
          </p>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              Nothing credited on this quote.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const spec = creditKindSpec(row.kind)
                return (
                  <div key={row.id} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex flex-wrap gap-2 items-start">
                      <div className="w-56">
                        <Select
                          value={row.kind}
                          onChange={(e) => update(row.id, { kind: e.target.value as QuoteCreditKind })}
                          aria-label="Type of transaction"
                        >
                          {CREDIT_KINDS.map((k) => (
                            <option key={k.key} value={k.key}>{k.label}</option>
                          ))}
                        </Select>
                      </div>
                      <div className="flex-1 min-w-[16rem]">
                        <Input
                          value={row.label}
                          placeholder={`${spec.defaultLabel} — reason the customer will read`}
                          onChange={(e) => update(row.id, { label: e.target.value })}
                          aria-label="Reason shown on the quote"
                        />
                      </div>
                      <div className="w-40">
                        <Input
                          value={row.amount}
                          onChange={(e) => update(row.id, { amount: e.target.value })}
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          leadingText="R"
                          placeholder="0.00"
                          aria-label="Amount"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                        className="text-destructive"
                        title="Remove this credit"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Input
                      value={row.note}
                      placeholder="Internal note — invoice it relates to, who approved it (never printed)"
                      onChange={(e) => update(row.id, { note: e.target.value })}
                      aria-label="Internal note"
                      className="text-xs"
                    />
                    <p className="text-xs text-muted-foreground">{spec.hint}</p>
                  </div>
                )
              })}
            </div>
          )}

          {/* What it does to the money, before anything is saved — the same
              arithmetic the server runs, so there are no surprises on save. */}
          {preview ? (
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">Quote total</span>
                <span className="tabular-nums">{randZA(preview.grossR)}</span>
              </div>
              {preview.appliedR > 0 && (
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">Credits</span>
                  <span className="tabular-nums text-accent">−{randZA(preview.appliedR)}</span>
                </div>
              )}
              <div className="flex justify-between py-0.5 font-semibold border-t border-border mt-1 pt-1.5">
                <span>Total payable</span>
                <span className="tabular-nums">{randZA(preview.payableR)}</span>
              </div>
              <div className="flex justify-between py-0.5 text-xs text-muted-foreground">
                <span>Deposit still due</span>
                <span className="tabular-nums">{randZA(preview.depositR)}</span>
              </div>
              <div className="flex justify-between py-0.5 text-xs text-muted-foreground">
                <span>Balance on completion</span>
                <span className="tabular-nums">{randZA(preview.balanceR)}</span>
              </div>
            </div>
          ) : creditTotalR > 0 ? (
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm flex justify-between">
              <span className="text-muted-foreground">
                Credits on this quote{generated ? '' : ' — the quote total is worked out when you generate it'}
              </span>
              <span className="tabular-nums text-accent">−{randZA(creditTotalR)}</span>
            </div>
          ) : null}

          {/* A credit worth more than the job can't be paid out by a quote. Say so
              here rather than letting it silently vanish into a R0 total. */}
          {preview && preview.unappliedR > 0 && (
            <p className="mt-3 text-xs text-warning flex items-start gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {preview ? randZA(preview.unappliedR) : ''} of this is more than the quote is worth. The quote takes it
              to R0.00 and no further &mdash; the rest stays owed to them and has to be settled on their
              statement or on the next job.
            </p>
          )}

          {hasPackages && valid.length > 0 && (
            <p className="mt-3 text-xs text-warning flex items-start gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              This quote is split into work packages. The credit comes off the combined price only &mdash;
              if the customer accepts one package on its own, it is billed at its standalone price with
              no credit applied. Credit them on a single-package quote instead, or turn the packages off.
            </p>
          )}

          {incomplete > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {incomplete} {incomplete === 1 ? 'row has' : 'rows have'} no amount yet and won&rsquo;t be saved.
            </p>
          )}

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <Button onClick={save} disabled={saving || !dirty} type="button" variant="accent" size="sm">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save credits
            </Button>
            <span className="text-xs text-muted-foreground">
              {!generated
                ? 'The quote hasn’t been generated yet — this lands on the document when you generate it.'
                : issued
                  ? 'Saving reissues the customer’s document at the new figure. The version they already have is archived first.'
                  : 'Saving rebuilds the draft document at the new figure — nothing is re-priced.'}
            </span>
          </div>

          {message && <p className="mt-2 text-xs text-success">{message}</p>}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </CollapsibleSection>
      </CardContent>
    </Card>
  )
}
