'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Check an invoice before it goes out, and change it while that is still
// allowed.
//
// The panel on the right is not a mock-up of the document — it IS the document.
// renderInvoice() is a pure module, so the browser runs exactly the renderer
// the issue route freezes, over exactly the data it will freeze. Type in the
// left-hand column and the customer's page redraws as you go; press Issue and
// what is on the right is what is stored and sent, byte for byte.
//
// Once issued the editing comes off and the frozen HTML is shown instead. A
// document that has left the building is a record, and the only honest way to
// change one is to void it and raise another.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle, ExternalLink, Loader2, Plus, Save, Send, Trash2, Check,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { QuoteFrame } from '@/app/q/[token]/QuoteFrame'
import { PrintQuoteButton } from '@/app/q/[token]/PrintQuoteButton'
import { formatCents, issueBlocker, randsToCents, KIND_LABEL } from '@/lib/invoices/invoice'
import { invoiceDocumentData, type InvoiceSurroundings } from '@/lib/invoices/document'
import { renderInvoice } from '@/lib/invoices/render-invoice'
import type { InvoiceCompany } from '@/lib/invoices/query'
import type { Invoice, InvoiceLine, InvoiceKind } from '@/types/database'

interface LineDraft {
  key: string
  description: string
  detail: string
  qty: string
  unit: string
  unitPriceRands: string
  /** Typed directly when the line has no honest qty x rate behind it. */
  amountRands: string
  source: InvoiceLine['source']
  sourceRef: string | null
}

const centsToRands = (cents: number) => (cents / 100).toFixed(2)

function toDraft(line: InvoiceLine, index: number): LineDraft {
  const qty = Number(line.qty) || 1
  const unitPrice = Number(line.unit_price_cents) || 0
  const amount = Number(line.amount_cents) || 0
  return {
    key: `${line.id}-${index}`,
    description: line.description,
    detail: line.detail ?? '',
    qty: String(qty),
    unit: line.unit ?? '',
    unitPriceRands: centsToRands(unitPrice),
    // Only carry an explicit amount when qty x rate does not reach it —
    // otherwise editing the rate would be ignored in favour of a stale total.
    amountRands: Math.round(qty * unitPrice) === amount ? '' : centsToRands(amount),
    source: line.source,
    sourceRef: line.source_ref,
  }
}

const draftAmountCents = (l: LineDraft): number =>
  l.amountRands.trim() !== ''
    ? randsToCents(l.amountRands)
    : Math.round((Number(l.qty) || 1) * randsToCents(l.unitPriceRands))

export function InvoiceEditor({
  invoice,
  lines,
  company,
  around,
  frozenHtml,
}: {
  invoice: Invoice
  lines: InvoiceLine[]
  company: InvoiceCompany
  around: InvoiceSurroundings
  /** The document as issued. Null while it is still a draft. */
  frozenHtml: string | null
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const editable = invoice.status === 'draft'

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [kind, setKind] = useState<InvoiceKind>(invoice.kind)
  const [issueDate, setIssueDate] = useState(invoice.issue_date)
  const [dueDate, setDueDate] = useState(invoice.due_date ?? '')
  const [billToName, setBillToName] = useState(invoice.bill_to_name)
  const [billToEmail, setBillToEmail] = useState(invoice.bill_to_email ?? '')
  const [billToAddress, setBillToAddress] = useState(invoice.bill_to_address ?? '')
  const [notes, setNotes] = useState(invoice.notes ?? '')
  const [terms, setTerms] = useState(invoice.terms ?? '')
  const [drafts, setDrafts] = useState<LineDraft[]>(() => lines.map(toDraft))

  const totalCents = useMemo(
    () => drafts.filter((l) => l.description.trim()).reduce((sum, l) => sum + draftAmountCents(l), 0),
    [drafts],
  )

  /**
   * The customer's document, rebuilt from what is on screen right now. Same
   * builder and same renderer as the issue route — the only difference is the
   * number, which a draft has not consumed yet.
   */
  const html = useMemo(() => {
    if (frozenHtml) return frozenHtml
    const previewLines: InvoiceLine[] = drafts
      .filter((l) => l.description.trim())
      .map((l, index) => ({
        id: l.key,
        invoice_id: invoice.id,
        description: l.description.trim(),
        detail: l.detail.trim() || null,
        qty: Number(l.qty) || 1,
        unit: l.unit.trim() || null,
        unit_price_cents: randsToCents(l.unitPriceRands),
        amount_cents: draftAmountCents(l),
        source: l.source,
        source_ref: l.sourceRef,
        sort_order: index,
      }))
    return renderInvoice(
      invoiceDocumentData(
        {
          ...invoice,
          kind,
          issue_date: issueDate,
          due_date: dueDate || null,
          bill_to_name: billToName.trim() || invoice.bill_to_name,
          bill_to_email: billToEmail.trim() || null,
          bill_to_address: billToAddress.trim() || null,
          notes: notes.trim() || null,
          terms: terms.trim() || null,
          total_cents: totalCents,
        },
        previewLines,
        company,
        around,
      ),
    )
  }, [
    frozenHtml, drafts, invoice, kind, issueDate, dueDate, billToName, billToEmail,
    billToAddress, notes, terms, totalCents, company, around,
  ])

  const dirty = useMemo(() => {
    if (!editable) return false
    return (
      kind !== invoice.kind ||
      issueDate !== invoice.issue_date ||
      dueDate !== (invoice.due_date ?? '') ||
      billToName !== invoice.bill_to_name ||
      billToEmail !== (invoice.bill_to_email ?? '') ||
      billToAddress !== (invoice.bill_to_address ?? '') ||
      notes !== (invoice.notes ?? '') ||
      terms !== (invoice.terms ?? '') ||
      JSON.stringify(drafts) !== JSON.stringify(lines.map(toDraft))
    )
  }, [editable, kind, issueDate, dueDate, billToName, billToEmail, billToAddress, notes, terms, drafts, invoice, lines])

  const blocker = issueBlocker(
    drafts
      .filter((l) => l.description.trim())
      .map((l) => ({
        description: l.description,
        qty: Number(l.qty) || 1,
        unitPriceCents: randsToCents(l.unitPriceRands),
        amountCents: draftAmountCents(l),
        source: l.source,
      })),
    { name: billToName },
  )

  function patchLine(index: number, changes: Partial<LineDraft>) {
    setDrafts((prev) => prev.map((l, i) => (i === index ? { ...l, ...changes } : l)))
  }

  const payload = () => ({
    kind,
    issueDate,
    dueDate: dueDate || null,
    billToName,
    billToEmail,
    billToAddress,
    notes,
    terms,
    lines: drafts
      .filter((l) => l.description.trim())
      .map((l) => ({
        description: l.description,
        detail: l.detail,
        qty: Number(l.qty) || 1,
        unit: l.unit,
        unitPriceRands: l.unitPriceRands,
        amountRands: l.amountRands,
        source: l.source,
        sourceRef: l.sourceRef,
      })),
  })

  async function save(): Promise<boolean> {
    setBusy('save')
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      })
      if (!res.ok) throw new Error(await res.text())
      setNotice('Saved.')
      router.refresh()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the invoice.')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function issue() {
    const method = billToEmail.trim() ? 'email' : 'manual'
    const ok = await confirm({
      title: 'Issue this invoice?',
      body:
        `${formatCents(totalCents)} to ${billToName}. ` +
        (method === 'email'
          ? `It gets a number, the document on the right is frozen exactly as it stands, and it goes to ${billToEmail.trim()}. `
          : 'It gets a number and the document on the right is frozen exactly as it stands. There is no email address on it, so send the link yourself. ') +
        'After that it can only be voided, not edited.',
      confirmText: method === 'email' ? 'Issue and send' : 'Issue',
    })
    if (!ok) return

    // Unsaved edits are on screen and therefore in the preview — issuing
    // without persisting them first would freeze a document nobody has seen.
    if (dirty && !(await save())) return

    setBusy('issue')
    setError(null)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'issue', method }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setNotice(
        data.emailError
          ? `Issued as ${data.invoiceNumber}, but the email did not go: ${data.emailError}`
          : data.emailSent
            ? `Issued as ${data.invoiceNumber} and sent.`
            : `Issued as ${data.invoiceNumber}.`,
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not issue the invoice.')
    } finally {
      setBusy(null)
    }
  }

  async function discard() {
    const ok = await confirm({
      title: 'Delete this draft?',
      body: 'Nothing has been sent and no number was used, so it disappears completely.',
      confirmText: 'Delete',
      destructive: true,
    })
    if (!ok) return
    setBusy('delete')
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      router.push(invoice.job_id ? `/portal/employee/jobs/${invoice.job_id}` : '/portal/employee/jobs')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the draft.')
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
      {/* ── What it says ───────────────────────────────────────────────────── */}
      <Card className="lg:sticky lg:top-4">
        <CardHeader>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-base">
              {editable ? 'Check it before it goes' : 'As issued'}
            </CardTitle>
            <span className="text-sm font-semibold tabular-nums">
              {formatCents(editable ? totalCents : invoice.total_cents)}
            </span>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {!editable && (
            <p className="rounded-md border border-border p-2.5 text-xs text-muted-foreground">
              This invoice has been issued, so the document is frozen — it is the record of what was
              claimed. To change it, void it on the job and raise another.
            </p>
          )}

          {editable && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  What it is
                  <Select value={kind} onChange={(e) => setKind(e.target.value as InvoiceKind)}>
                    {(['deposit', 'progress', 'final'] as InvoiceKind[]).map((k) => (
                      <option key={k} value={k}>{KIND_LABEL[k]}</option>
                    ))}
                  </Select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Issued
                  <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Due (blank = on receipt)
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Invoiced to
                  <Input value={billToName} onChange={(e) => setBillToName(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                  Their email {billToEmail.trim() ? '' : '— blank means you send the link yourself'}
                  <Input
                    type="email"
                    value={billToEmail}
                    placeholder="nobody@example.com"
                    onChange={(e) => setBillToEmail(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
                  Billing address
                  <Input value={billToAddress} onChange={(e) => setBillToAddress(e.target.value)} />
                </label>
              </div>

              {/* ── The lines ──────────────────────────────────────────────── */}
              <div className="flex flex-col gap-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Lines</p>
                {drafts.map((line, index) => (
                  <div key={line.key} className="flex flex-col gap-2 rounded-md border border-border p-2.5">
                    <div className="flex items-start gap-2">
                      <Input
                        className="flex-1"
                        placeholder="What the customer reads"
                        value={line.description}
                        onChange={(e) => patchLine(index, { description: e.target.value })}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label="Remove line"
                        onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Smaller print under it (optional)"
                      value={line.detail}
                      onChange={(e) => patchLine(index, { detail: e.target.value })}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                        Qty
                        <Input
                          type="number"
                          step="any"
                          className="h-9"
                          value={line.qty}
                          onChange={(e) => patchLine(index, { qty: e.target.value })}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                        Unit
                        <Input
                          className="h-9"
                          placeholder="ea"
                          value={line.unit}
                          onChange={(e) => patchLine(index, { unit: e.target.value })}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                        Rate
                        <Input
                          className="h-9"
                          inputMode="decimal"
                          leadingText="R"
                          value={line.unitPriceRands}
                          onChange={(e) => patchLine(index, { unitPriceRands: e.target.value })}
                        />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                      Line total {line.amountRands.trim() === '' ? '— follows qty × rate' : '— overriding qty × rate'}
                      <Input
                        className="h-9"
                        inputMode="decimal"
                        leadingText="R"
                        placeholder={centsToRands(draftAmountCents({ ...line, amountRands: '' }))}
                        value={line.amountRands}
                        onChange={(e) => patchLine(index, { amountRands: e.target.value })}
                      />
                    </label>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDrafts((prev) => [
                        ...prev,
                        {
                          key: `new-${prev.length}-${Date.now()}`,
                          description: '',
                          detail: '',
                          qty: '1',
                          unit: '',
                          unitPriceRands: '',
                          amountRands: '',
                          source: 'manual',
                          sourceRef: null,
                        },
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Add a line
                  </Button>
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    A negative amount reads as a credit.
                  </span>
                </div>
              </div>

              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Note above the terms
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Terms {terms.trim() ? '' : '— blank uses the company default'}
                <Textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} />
              </label>
            </>
          )}

          {notice && <p className="text-xs text-success">{notice}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {editable && blocker && (
            <p className="flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {blocker}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {editable ? (
              <>
                <Button type="button" variant="outline" disabled={!dirty || !!busy} onClick={save}>
                  {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </Button>
                <Button type="button" variant="accent" disabled={!!blocker || !!busy} onClick={issue}>
                  {busy === 'issue' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : billToEmail.trim() ? (
                    <Send className="h-3.5 w-3.5" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {billToEmail.trim() ? 'Issue and send' : 'Issue'}
                </Button>
                <Button type="button" variant="ghost" disabled={!!busy} onClick={discard}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete draft
                </Button>
              </>
            ) : (
              invoice.status !== 'void' && (
                <Button variant="outline" asChild>
                  <Link href={`/i/${invoice.share_token}`} target="_blank">
                    <ExternalLink className="h-3.5 w-3.5" /> Open the customer&apos;s link
                  </Link>
                </Button>
              )
            )}
          </div>

          {editable && (
            <p className="text-[11px] text-muted-foreground">
              The document beside this is exactly what the customer opens. Issuing freezes it as it
              stands — nothing is re-rendered afterwards.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── What they see ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            The customer&apos;s view
          </p>
          <PrintQuoteButton html={html} />
        </div>
        <QuoteFrame html={html} title="Invoice" />
      </div>
    </div>
  )
}
