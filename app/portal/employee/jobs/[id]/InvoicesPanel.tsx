'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Invoicing, from the job (migration 133).
//
// The job is where invoicing belongs because the job is where the work is: you
// bill the deposit when it is booked, a slice when the boards are in, and the
// balance at handover — and each of those moments is a stage on this page.
//
// The strip at the top is the whole story in four figures: what the contract
// is worth, what has been invoiced, what has been paid, and what is left. A
// final invoice bills exactly that last number, and says so in its own line
// detail so the customer can follow the subtraction rather than trust it.
//
// A DRAFT is editable by being deleted and re-raised. Once issued the document
// is frozen and a mistake is corrected by voiding and raising another — the
// database enforces that, not this component.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle, Ban, Check, ExternalLink, Loader2, Mail, Plus, Receipt, Send, Trash2, X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  KIND_LABEL, STATUS_LABEL, formatCents, isOverdue, jobBilling, linesForBasis,
  linesTotalCents, overBillWarning, randsToCents, trimNumber,
  type InvoiceBasis, type InvoiceLineDraft, type InvoiceSummaryRow, type MaterialPick,
} from '@/lib/invoices/invoice'
import type { Invoice } from '@/types/database'

/** One BOM line the panel can bill. */
export interface BillableMaterial {
  id: string
  section: string
  description: string
  qtyPlanned: number
  unitSellCents: number
}

interface ExtraLineDraft {
  key: string
  description: string
  qty: string
  unit: string
  unitPriceRands: string
}

const BASIS_LABEL: Record<InvoiceBasis, string> = {
  deposit: 'The deposit',
  percentage: 'A percentage of the contract',
  amount: 'An amount I type',
  materials: 'Materials off the job BOM',
  final: 'The balance — final invoice',
}

export function InvoicesPanel({
  jobId,
  invoices,
  contractCents,
  quoteDepositCents,
  depositConfirmed,
  quoteNumber,
  workLabel,
  billToName,
  billToEmail,
  materials,
}: {
  jobId: string
  invoices: Invoice[]
  /** quote_requests.total_amount. Null on a job with no quote behind it. */
  contractCents: number | null
  quoteDepositCents: number | null
  depositConfirmed: boolean
  quoteNumber: string | null
  workLabel: string
  billToName: string
  billToEmail: string | null
  materials: BillableMaterial[]
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** Which invoice row has an inline form open, and which one. */
  const [rowForm, setRowForm] = useState<{ id: string; mode: 'payment' | 'void' } | null>(null)
  const [paymentRands, setPaymentRands] = useState('')
  const [voidReason, setVoidReason] = useState('')

  // ── The draft being composed ───────────────────────────────────────────────
  // A job that owes a deposit almost always wants that first — open on it.
  const [basis, setBasis] = useState<InvoiceBasis>(
    quoteDepositCents && !invoices.some((i) => i.kind === 'deposit' && i.status !== 'void')
      ? 'deposit'
      : 'amount',
  )
  const [percent, setPercent] = useState('')
  const [amountRands, setAmountRands] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [extras, setExtras] = useState<ExtraLineDraft[]>([])

  const summaries: InvoiceSummaryRow[] = useMemo(
    () =>
      invoices.map((i) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        kind: i.kind,
        status: i.status,
        issue_date: i.issue_date,
        due_date: i.due_date,
        total_cents: i.total_cents,
        amount_paid_cents: i.amount_paid_cents,
      })),
    [invoices],
  )

  const billing = useMemo(
    () => jobBilling({ contractCents, invoices: summaries, quoteDepositCents, depositConfirmed }),
    [contractCents, summaries, quoteDepositCents, depositConfirmed],
  )

  const depositAlreadyInvoiced = summaries.some((i) => i.kind === 'deposit' && i.status !== 'void')

  // Preview the lines exactly as the server will build them — same function,
  // same inputs. What you see in the dialog is what gets written.
  const materialPicks: MaterialPick[] = useMemo(
    () =>
      materials
        .map((m) => ({
          id: m.id,
          section: m.section,
          description: m.description,
          qty: Number(picked[m.id] ?? '') || 0,
          unitSellCents: m.unitSellCents,
        }))
        .filter((m) => m.qty > 0),
    [materials, picked],
  )

  const extraDrafts: InvoiceLineDraft[] = useMemo(
    () =>
      extras
        .filter((e) => e.description.trim())
        .map((e) => {
          const qty = Number(e.qty) || 1
          const unitPriceCents = randsToCents(e.unitPriceRands)
          return {
            description: e.description.trim(),
            detail: null,
            qty,
            unit: e.unit.trim() || null,
            unitPriceCents,
            amountCents: Math.round(qty * unitPriceCents),
            source: unitPriceCents < 0 ? ('credit' as const) : ('manual' as const),
            sourceRef: null,
          }
        }),
    [extras],
  )

  const previewLines: InvoiceLineDraft[] = useMemo(
    () => [
      ...linesForBasis(
        basis,
        { billing, quoteNumber, quoteDepositCents, workLabel },
        {
          percent: Number(percent) || 0,
          amountCents: randsToCents(amountRands),
          description,
          materials: materialPicks,
        },
      ),
      ...extraDrafts,
    ],
    [basis, billing, quoteNumber, quoteDepositCents, workLabel, percent, amountRands, description, materialPicks, extraDrafts],
  )

  const previewTotal = linesTotalCents(previewLines)
  const warning = overBillWarning(billing, previewTotal)
  const canRaise = previewTotal > 0 && !!billToName.trim()

  function reset() {
    setBasis(
      quoteDepositCents && !invoices.some((i) => i.kind === 'deposit' && i.status !== 'void')
        ? 'deposit'
        : 'amount',
    )
    setPercent('')
    setAmountRands('')
    setDescription('')
    setNotes('')
    setPicked({})
    setExtras([])
    setError(null)
  }

  async function raise() {
    setBusy('create')
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basis,
          percent: Number(percent) || 0,
          amountRands,
          description,
          notes,
          materials: materialPicks.map((m) => ({ id: m.id, qty: m.qty })),
          extraLines: extras
            .filter((e) => e.description.trim())
            .map((e) => ({
              description: e.description,
              qty: Number(e.qty) || 1,
              unit: e.unit,
              unitPriceRands: e.unitPriceRands,
            })),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setOpen(false)
      reset()
      setNotice('Draft invoice raised — check it, then issue it.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not raise the invoice.')
    } finally {
      setBusy(null)
    }
  }

  async function act(invoiceId: string, body: Record<string, unknown>, label: string) {
    setBusy(`${invoiceId}:${label}`)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      if (data.emailError) setNotice(`Issued, but the email did not go: ${data.emailError}`)
      else if (data.emailSent) setNotice('Sent to the customer.')
      else if (data.invoiceNumber) setNotice(`Issued as ${data.invoiceNumber}.`)
      else if (data.settled) setNotice('Settled — receipt sent.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
    } finally {
      setBusy(null)
    }
  }

  async function issueInvoice(invoice: Invoice) {
    const method = invoice.bill_to_email ? 'email' : 'manual'
    const ok = await confirm({
      title: `Issue this ${KIND_LABEL[invoice.kind].toLowerCase()} invoice?`,
      body:
        `${formatCents(invoice.total_cents)} to ${invoice.bill_to_name}. ` +
        (method === 'email'
          ? `It gets a number, the document is frozen, and it goes to ${invoice.bill_to_email}. `
          : 'It gets a number and the document is frozen — there is no email address on file, so send the link yourself. ') +
        'After that it can only be voided, not edited.',
      confirmText: method === 'email' ? 'Issue and send' : 'Issue',
    })
    if (!ok) return
    await act(invoice.id, { action: 'issue', method }, 'issue')
  }

  async function voidInvoice(invoice: Invoice) {
    const ok = await confirm({
      title: `Void ${invoice.invoice_number ?? 'this invoice'}?`,
      body: 'It stays on the record marked void, stops counting towards what this job has been billed, and the customer link stops serving it. This cannot be undone.',
      confirmText: 'Void it',
      destructive: true,
    })
    if (!ok) return
    if (!voidReason.trim()) {
      setError('Say why it is being voided before confirming — the reason stays on the record.')
      return
    }
    await act(invoice.id, { action: 'void', reason: voidReason }, 'void')
    setRowForm(null)
    setVoidReason('')
  }

  async function deleteDraft(invoice: Invoice) {
    const ok = await confirm({
      title: 'Delete this draft?',
      body: 'Nothing has been sent and no number was used, so it disappears completely.',
      confirmText: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setBusy(`${invoice.id}:delete`)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the draft.')
    } finally {
      setBusy(null)
    }
  }

  async function recordPayment(invoice: Invoice, full: boolean) {
    const remaining = invoice.total_cents - invoice.amount_paid_cents
    if (full) {
      await act(invoice.id, { action: 'payment', full: true }, 'payment')
      setRowForm(null)
      return
    }
    const cents = randsToCents(paymentRands)
    if (cents <= 0) {
      setError('Enter the amount that came in.')
      return
    }
    await act(
      invoice.id,
      cents >= remaining ? { action: 'payment', full: true } : { action: 'payment', amountRands: paymentRands },
      'payment',
    )
    setRowForm(null)
    setPaymentRands('')
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Invoicing
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {invoices.length === 0
              ? 'Nothing invoiced yet'
              : `${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* ── Where the money stands ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 sm:grid-cols-4">
          <Figure
            label="Contract"
            value={billing.contractCents == null ? '—' : formatCents(billing.contractCents)}
            sub={quoteNumber ?? (billing.contractCents == null ? 'No quote on this job' : undefined)}
          />
          <Figure
            label="Invoiced"
            value={formatCents(billing.issuedCents)}
            sub={billing.draftCents > 0 ? `+ ${formatCents(billing.draftCents)} in draft` : undefined}
          />
          <Figure
            label="Received"
            value={formatCents(billing.paidCents + billing.depositCollectedCents)}
            sub={
              billing.depositCollectedCents > 0
                ? `incl. ${formatCents(billing.depositCollectedCents)} deposit`
                : billing.outstandingCents > 0
                  ? `${formatCents(billing.outstandingCents)} outstanding`
                  : undefined
            }
          />
          <Figure
            label={billing.overContract ? 'Over the contract' : 'Left to invoice'}
            value={
              billing.remainingCents == null
                ? '—'
                : formatCents(
                    billing.overContract
                      ? billing.invoicedCents + billing.depositCollectedCents - (billing.contractCents ?? 0)
                      : billing.remainingCents,
                  )
            }
            tone={billing.overContract ? 'bad' : billing.remainingCents === 0 ? 'good' : undefined}
          />
        </div>

        {notice && <p className="text-xs text-success">{notice}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!billToName.trim() && (
          <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This job has no customer on it, so there is nobody to invoice. Link a customer to the
            quote or the site first.
          </p>
        )}

        {/* ── The invoices ───────────────────────────────────────────────── */}
        {invoices.length > 0 && (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {invoices.map((invoice) => {
              const overdue = isOverdue({
                id: invoice.id,
                invoice_number: invoice.invoice_number,
                kind: invoice.kind,
                status: invoice.status,
                issue_date: invoice.issue_date,
                due_date: invoice.due_date,
                total_cents: invoice.total_cents,
                amount_paid_cents: invoice.amount_paid_cents,
              })
              const due = Math.max(0, invoice.total_cents - invoice.amount_paid_cents)
              return (
                <li key={invoice.id} className="flex flex-col gap-2 p-3">
                 <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">
                        {invoice.invoice_number ?? 'Draft'}
                      </span>
                      <Badge variant="outline">{KIND_LABEL[invoice.kind]}</Badge>
                      <Badge
                        variant={
                          invoice.status === 'paid'
                            ? 'success'
                            : invoice.status === 'void'
                              ? 'destructive'
                              : overdue
                                ? 'warning'
                                : invoice.status === 'draft'
                                  ? 'outline'
                                  : 'default'
                        }
                      >
                        {overdue && invoice.status === 'sent' ? 'Overdue' : STATUS_LABEL[invoice.status]}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(`${invoice.issue_date}T00:00:00`).toLocaleDateString('en-ZA', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                      {invoice.status !== 'void' && invoice.amount_paid_cents > 0 && due > 0 &&
                        ` · ${formatCents(invoice.amount_paid_cents)} received, ${formatCents(due)} still due`}
                      {invoice.status === 'void' && invoice.void_reason && ` · ${invoice.void_reason}`}
                    </p>
                  </div>

                  <span className="font-semibold tabular-nums">{formatCents(invoice.total_cents)}</span>

                  <div className="flex items-center gap-1">
                    {invoice.status === 'draft' ? (
                      <>
                        <Button
                          size="sm"
                          variant="accent"
                          disabled={!!busy}
                          onClick={() => issueInvoice(invoice)}
                        >
                          {busy === `${invoice.id}:issue` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : invoice.bill_to_email ? (
                            <Send className="h-3.5 w-3.5" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Issue
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!!busy}
                          onClick={() => deleteDraft(invoice)}
                          aria-label="Delete draft"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : invoice.status === 'void' ? null : (
                      <>
                        {due > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!busy}
                            onClick={() => {
                              setError(null)
                              setPaymentRands(((invoice.total_cents - invoice.amount_paid_cents) / 100).toFixed(2))
                              setRowForm(
                                rowForm?.id === invoice.id && rowForm.mode === 'payment'
                                  ? null
                                  : { id: invoice.id, mode: 'payment' },
                              )
                            }}
                          >
                            {busy === `${invoice.id}:payment` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            Payment
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" asChild aria-label="Open the customer's copy">
                          <Link href={`/i/${invoice.share_token}`} target="_blank">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        {invoice.bill_to_email && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!!busy}
                            onClick={() => act(invoice.id, { action: 'resend' }, 'resend')}
                            aria-label="Email it again"
                          >
                            {busy === `${invoice.id}:resend` ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Mail className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!!busy}
                          onClick={() => {
                            setError(null)
                            setVoidReason('')
                            setRowForm(
                              rowForm?.id === invoice.id && rowForm.mode === 'void'
                                ? null
                                : { id: invoice.id, mode: 'void' },
                            )
                          }}
                          aria-label="Void it"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                 </div>

                  {/* Money in, and withdrawals — typed here rather than in a
                      browser prompt, so the amount is visible while you check it. */}
                  {rowForm?.id === invoice.id && rowForm.mode === 'payment' && (
                    <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2.5">
                      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Amount received
                        <Input
                          className="h-8 w-32"
                          inputMode="decimal"
                          leadingText="R"
                          value={paymentRands}
                          onChange={(e) => setPaymentRands(e.target.value)}
                        />
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!!busy}
                        onClick={() => recordPayment(invoice, false)}
                      >
                        Record it
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => recordPayment(invoice, true)}
                      >
                        Settle in full ({formatCents(due)})
                      </Button>
                      <span className="text-[11px] text-muted-foreground">
                        Settling in full emails the customer a receipt.
                      </span>
                    </div>
                  )}

                  {rowForm?.id === invoice.id && rowForm.mode === 'void' && (
                    <div className="flex flex-wrap items-end gap-2 rounded-md border border-destructive/40 bg-destructive/[0.03] p-2.5">
                      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted-foreground">
                        Why is it being voided? (stays on the record)
                        <Input
                          className="h-8"
                          value={voidReason}
                          placeholder="Wrong amount — replaced by a corrected invoice"
                          onChange={(e) => setVoidReason(e.target.value)}
                        />
                      </label>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={!!busy || !voidReason.trim()}
                        onClick={() => voidInvoice(invoice)}
                      >
                        {busy === `${invoice.id}:void` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Void it
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* ── Raise one ──────────────────────────────────────────────────── */}
        {!open ? (
          <div>
            <Button type="button" size="sm" onClick={() => { reset(); setOpen(true) }}>
              <Plus className="h-3.5 w-3.5" /> New invoice
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 rounded-lg border border-accent/40 bg-accent/[0.03] p-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">New invoice</p>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); reset() }}>
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
            </div>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:max-w-sm">
              What is this invoice for?
              <Select value={basis} onChange={(e) => setBasis(e.target.value as InvoiceBasis)}>
                {(Object.keys(BASIS_LABEL) as InvoiceBasis[])
                  // A deposit is a once-per-job thing, and the figure comes off
                  // the quote — hide it when there is no quote or one already exists.
                  .filter((b) => b !== 'deposit' || (!!quoteDepositCents && !depositAlreadyInvoiced))
                  .filter((b) => (b === 'percentage' || b === 'final' ? contractCents != null : true))
                  .filter((b) => (b === 'materials' ? materials.length > 0 : true))
                  .map((b) => (
                    <option key={b} value={b}>{BASIS_LABEL[b]}</option>
                  ))}
              </Select>
            </label>

            {basis === 'percentage' && (
              <div className="grid gap-3 sm:grid-cols-2 sm:max-w-md">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Percentage of the contract
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={percent}
                    placeholder=""
                    trailingText="%"
                    onChange={(e) => setPercent(e.target.value)}
                  />
                </label>
                <div className="flex items-end pb-2 text-xs text-muted-foreground">
                  {percent
                    ? `${trimNumber(Number(percent) || 0)}% of ${formatCents(contractCents ?? 0)}`
                    : 'Type a percentage to see the claim.'}
                </div>
              </div>
            )}

            {basis === 'amount' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Amount
                  <Input
                    inputMode="decimal"
                    value={amountRands}
                    placeholder=""
                    leadingText="R"
                    onChange={(e) => setAmountRands(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  What the customer should read
                  <Input
                    value={description}
                    placeholder="Progress claim — first fix complete"
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </div>
            )}

            {basis === 'materials' && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Bill the parts that are on site. Quantities default to none — type what is being
                  claimed, up to what the job plans to use.
                </p>
                <ul className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {materials.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{m.description || m.section}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {m.section} · {m.qtyPlanned} planned · {formatCents(m.unitSellCents)} each
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={m.qtyPlanned}
                        step="any"
                        className="h-8 w-20"
                        value={picked[m.id] ?? ''}
                        onChange={(e) => setPicked((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {basis === 'final' && (
              <p className="rounded-md border border-border p-2.5 text-xs text-muted-foreground">
                Bills everything not yet invoiced: {formatCents(billing.contractCents ?? 0)} contract
                {billing.invoicedCents > 0 && `, less ${formatCents(billing.invoicedCents)} already invoiced`}
                {billing.depositCollectedCents > 0 &&
                  `, less ${formatCents(billing.depositCollectedCents)} deposit received`}
                {' '}= <strong className="text-foreground">{formatCents(billing.remainingCents ?? 0)}</strong>.
              </p>
            )}

            {/* ── Extra lines ────────────────────────────────────────────── */}
            <div className="flex flex-col gap-2">
              {extras.map((line, index) => (
                <div key={line.key} className="grid gap-2 sm:grid-cols-[1fr_5rem_4rem_8rem_2rem]">
                  <Input
                    placeholder="Extra work, materials, a discount…"
                    value={line.description}
                    onChange={(e) => patchExtra(setExtras, index, { description: e.target.value })}
                  />
                  <Input
                    type="number"
                    step="any"
                    placeholder="Qty"
                    value={line.qty}
                    onChange={(e) => patchExtra(setExtras, index, { qty: e.target.value })}
                  />
                  <Input
                    placeholder="Unit"
                    value={line.unit}
                    onChange={(e) => patchExtra(setExtras, index, { unit: e.target.value })}
                  />
                  <Input
                    inputMode="decimal"
                    leadingText="R"
                    placeholder=""
                    value={line.unitPriceRands}
                    onChange={(e) => patchExtra(setExtras, index, { unitPriceRands: e.target.value })}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Remove line"
                    onClick={() => setExtras((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setExtras((prev) => [
                      ...prev,
                      { key: `l${prev.length}${Date.now()}`, description: '', qty: '1', unit: '', unitPriceRands: '' },
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Add a line
                </Button>
                <span className="ml-2 text-[11px] text-muted-foreground">
                  A negative amount is a credit — money back, or a discount.
                </span>
              </div>
            </div>

            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Note on the invoice (optional)
              <Textarea
                rows={2}
                value={notes}
                placeholder="Anything the customer should read above the terms."
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            {/* ── What will be written ───────────────────────────────────── */}
            <div className="rounded-md border border-border">
              <ul className="divide-y divide-border">
                {previewLines.length === 0 ? (
                  <li className="p-2.5 text-xs text-muted-foreground">
                    Nothing on this invoice yet.
                  </li>
                ) : (
                  previewLines.map((l, i) => (
                    <li key={i} className="flex items-baseline gap-3 p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{l.description}</p>
                        {l.detail && <p className="text-[11px] text-muted-foreground">{l.detail}</p>}
                      </div>
                      <span
                        className={`text-sm font-medium tabular-nums ${
                          l.amountCents < 0 ? 'text-success' : ''
                        }`}
                      >
                        {formatCents(l.amountCents)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <div className="flex items-baseline justify-between border-t border-border p-2.5">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Invoice total
                </span>
                <span className="text-base font-semibold tabular-nums">{formatCents(previewTotal)}</span>
              </div>
            </div>

            {warning && (
              <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {warning}
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button type="button" disabled={!canRaise || busy === 'create'} onClick={raise}>
                {busy === 'create' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Raise the draft
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Saved as a draft — no number is used and nothing is sent until you issue it.
                {billToEmail ? ` Issuing emails ${billToEmail}.` : ' No email on file, so you send the link yourself.'}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function patchExtra(
  setExtras: React.Dispatch<React.SetStateAction<ExtraLineDraft[]>>,
  index: number,
  changes: Partial<ExtraLineDraft>,
) {
  setExtras((prev) => prev.map((l, i) => (i === index ? { ...l, ...changes } : l)))
}

function Figure({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'bad'
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`text-sm font-semibold tabular-nums ${
          tone === 'bad' ? 'text-destructive' : tone === 'good' ? 'text-success' : ''
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}
