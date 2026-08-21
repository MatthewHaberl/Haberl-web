// ─────────────────────────────────────────────────────────────────────────────
// Invoices — the arithmetic. Pure, so it can be tested without a database.
//
// One job, several invoices. The three figures every screen here works from:
//
//   contract   what the accepted quote says the job is worth
//   invoiced   every invoice on the job that is not void, added up
//   remaining  contract - invoiced - any deposit collected outside invoicing
//
// That last subtraction is the one that is easy to get wrong. This system
// collected deposits long before it could invoice: the customer paid off the
// quote and a manager confirmed the proof on the job. If a final invoice bills
// `contract - invoiced` it bills that deposit a second time. So a confirmed
// deposit with no deposit invoice behind it counts as already collected, and
// the final invoice says so in the line detail rather than quietly netting it
// off — the customer needs to be able to follow the subtraction.
//
// Everything is CENTS, integers, all the way through. No screen adds up a
// float, and nothing here divides a lump to recover a part of it.
// ─────────────────────────────────────────────────────────────────────────────

/** A line as the UI holds it before it becomes an invoice_lines row. */
export interface InvoiceLineDraft {
  description: string
  detail?: string | null
  qty: number
  unit?: string | null
  unitPriceCents: number
  amountCents: number
  source: InvoiceLineSource
  sourceRef?: string | null
}

export type InvoiceLineSource =
  | 'quote_section'
  | 'quote_line'
  | 'job_material'
  | 'labour'
  | 'percentage'
  | 'manual'
  | 'credit'

export type InvoiceKind = 'deposit' | 'progress' | 'final'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void'

/** The slice of an invoice every summary here needs. */
export interface InvoiceSummaryRow {
  id: string
  invoice_number: string | null
  kind: InvoiceKind
  status: InvoiceStatus
  issue_date: string
  due_date: string | null
  total_cents: number
  amount_paid_cents: number
}

/**
 * Money, with the sign in front of the R rather than inside it.
 *
 * A credit line rendered the naive way reads "R-150,00", which looks like a
 * typo on a document a customer is being asked to pay. The minus belongs
 * before the currency, as it does on every bank statement.
 */
export const formatCents = (cents: number): string => {
  const abs = Math.abs(cents / 100).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${cents < 0 ? '-' : ''}R${abs}`
}

/** Rands typed into a box → cents, without the float. `"1 234,56"` and `"1234.56"` both work. */
export function randsToCents(input: string | number | null | undefined): number {
  if (input == null || input === '') return 0
  if (typeof input === 'number') return Math.round(input * 100)
  const cleaned = input.replace(/[\sR]/g, '').replace(',', '.')
  const value = Number(cleaned)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

/**
 * What a job has been billed, and what is left.
 *
 * `void` invoices are excluded everywhere — a voided invoice is a mistake that
 * was withdrawn, and counting it would make the remaining figure wrong for the
 * rest of the job. Drafts ARE counted: a draft sitting on the job is money
 * about to be claimed, and offering to bill it twice is the trap this figure
 * exists to prevent. The UI labels the draft portion separately so it is never
 * mistaken for money already claimed.
 */
export interface JobBilling {
  /** Quote total. Null when the job has no quote behind it (a manual job). */
  contractCents: number | null
  /** Issued (sent/paid) invoices. */
  issuedCents: number
  /** Drafts not yet issued. */
  draftCents: number
  /** issued + draft — everything a line has been written for. */
  invoicedCents: number
  /** Money actually received against invoices. */
  paidCents: number
  /** Issued but unpaid. */
  outstandingCents: number
  /**
   * A deposit confirmed on the job (proof of payment) that no deposit invoice
   * accounts for. Already in the bank; must not be billed again.
   */
  depositCollectedCents: number
  /** contract - invoiced - depositCollected. Null without a contract; never below zero. */
  remainingCents: number | null
  /** True when the lines written already exceed the contract. */
  overContract: boolean
}

export interface BillingInput {
  contractCents: number | null
  invoices: InvoiceSummaryRow[]
  /** quote_requests.deposit_amount, in cents. */
  quoteDepositCents: number | null
  /** jobs.deposit_confirmed_at — a proof of payment a manager accepted. */
  depositConfirmed: boolean
}

export function jobBilling({
  contractCents,
  invoices,
  quoteDepositCents,
  depositConfirmed,
}: BillingInput): JobBilling {
  const live = invoices.filter((i) => i.status !== 'void')
  const issued = live.filter((i) => i.status !== 'draft')
  const drafts = live.filter((i) => i.status === 'draft')

  const issuedCents = issued.reduce((sum, i) => sum + i.total_cents, 0)
  const draftCents = drafts.reduce((sum, i) => sum + i.total_cents, 0)
  const paidCents = issued.reduce((sum, i) => sum + i.amount_paid_cents, 0)
  const invoicedCents = issuedCents + draftCents

  // The old deposit flow only counts while nothing has invoiced it. The moment
  // a deposit invoice exists — even a draft — that invoice is the record.
  const hasDepositInvoice = live.some((i) => i.kind === 'deposit')
  const depositCollectedCents =
    depositConfirmed && !hasDepositInvoice ? Math.max(0, quoteDepositCents ?? 0) : 0

  const remainingRaw =
    contractCents == null ? null : contractCents - invoicedCents - depositCollectedCents

  return {
    contractCents,
    issuedCents,
    draftCents,
    invoicedCents,
    paidCents,
    outstandingCents: Math.max(0, issuedCents - paidCents),
    depositCollectedCents,
    remainingCents: remainingRaw == null ? null : Math.max(0, remainingRaw),
    overContract: remainingRaw != null && remainingRaw < 0,
  }
}

// ── Building the lines ───────────────────────────────────────────────────────

/** How the person raising the invoice is choosing the amount. */
export type InvoiceBasis = 'deposit' | 'percentage' | 'amount' | 'materials' | 'final'

export interface BasisContext {
  billing: JobBilling
  quoteNumber: string | null
  /** quote_requests.deposit_amount, in cents. */
  quoteDepositCents: number | null
  /** Work type label for the wording — "Solar PV", "Electrical work". */
  workLabel: string
}

/** One pickable material line off the job's BOM. */
export interface MaterialPick {
  id: string
  section: string
  description: string
  qty: number
  unitSellCents: number
}

/**
 * Turn a basis and its inputs into the lines of a draft invoice.
 *
 * Every branch returns lines whose amounts add up to what the caller asked
 * for — nothing here silently rounds a total into place. A percentage claim is
 * one line with the percentage in the description, because that is what the
 * customer agreed to and dividing it into fake quantities helps nobody.
 */
export function linesForBasis(
  basis: InvoiceBasis,
  ctx: BasisContext,
  input: {
    /** 'percentage' — 0..100. */
    percent?: number
    /** 'amount' — the figure typed, in cents. */
    amountCents?: number
    /** 'amount' — what the customer should read. */
    description?: string
    /** 'materials' — the picked BOM lines. */
    materials?: MaterialPick[]
  } = {},
): InvoiceLineDraft[] {
  const ref = ctx.quoteNumber ? ` — ${ctx.quoteNumber}` : ''

  switch (basis) {
    case 'deposit': {
      const amount = Math.max(0, ctx.quoteDepositCents ?? 0)
      return [
        line({
          description: `Deposit${ref}`,
          detail: 'Confirms the booking and releases the materials order.',
          amountCents: amount,
          source: 'quote_section',
          sourceRef: ctx.quoteNumber,
        }),
      ]
    }

    case 'percentage': {
      const pct = clampPercent(input.percent ?? 0)
      const base = ctx.billing.contractCents ?? 0
      // Round the claim itself, once. Deriving it from a rounded rate and a
      // quantity is where the stray cent comes from.
      const amount = Math.round((base * pct) / 100)
      return [
        line({
          description: `Progress claim — ${trimNumber(pct)}% of the contract${ref}`,
          detail: `${trimNumber(pct)}% of ${formatCents(base)}.`,
          amountCents: amount,
          source: 'percentage',
          sourceRef: ctx.quoteNumber,
        }),
      ]
    }

    case 'amount': {
      const amount = Math.max(0, input.amountCents ?? 0)
      return [
        line({
          description: input.description?.trim() || `Progress claim${ref}`,
          amountCents: amount,
          source: 'manual',
          sourceRef: ctx.quoteNumber,
        }),
      ]
    }

    case 'materials': {
      return (input.materials ?? [])
        .filter((m) => m.qty > 0)
        .map((m) =>
          line({
            description: m.description || m.section || 'Material',
            detail: m.section || null,
            qty: m.qty,
            unit: 'ea',
            unitPriceCents: m.unitSellCents,
            amountCents: Math.round(m.qty * m.unitSellCents),
            source: 'job_material',
            sourceRef: m.id,
          }),
        )
    }

    case 'final': {
      const { contractCents, invoicedCents, depositCollectedCents, remainingCents } = ctx.billing
      const amount = Math.max(0, remainingCents ?? 0)
      const parts: string[] = []
      if (contractCents != null) parts.push(`Contract ${formatCents(contractCents)}`)
      if (invoicedCents > 0) parts.push(`less ${formatCents(invoicedCents)} already invoiced`)
      if (depositCollectedCents > 0) parts.push(`less ${formatCents(depositCollectedCents)} deposit received`)
      return [
        line({
          description: `Balance of works — ${ctx.workLabel}${ref}`,
          detail: parts.length > 1 ? `${parts.join(', ')}.` : null,
          amountCents: amount,
          source: 'quote_section',
          sourceRef: ctx.quoteNumber,
        }),
      ]
    }
  }
}

function line(partial: Partial<InvoiceLineDraft> & { description: string; amountCents: number }): InvoiceLineDraft {
  const qty = partial.qty ?? 1
  return {
    description: partial.description,
    detail: partial.detail ?? null,
    qty,
    unit: partial.unit ?? null,
    unitPriceCents: partial.unitPriceCents ?? (qty === 1 ? partial.amountCents : Math.round(partial.amountCents / qty)),
    amountCents: partial.amountCents,
    source: partial.source ?? 'manual',
    sourceRef: partial.sourceRef ?? null,
  }
}

const clampPercent = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0))

/** 40 → "40", 33.33 → "33.33". Percentages should not read as "40.00%". */
export const trimNumber = (n: number): string =>
  n.toLocaleString('en-ZA', { maximumFractionDigits: 2 })

export const linesTotalCents = (lines: InvoiceLineDraft[]): number =>
  lines.reduce((sum, l) => sum + Math.round(l.amountCents), 0)

/**
 * Why this draft can't be issued yet, or null when it can.
 *
 * An invoice for nothing is the one that gets emailed by accident, so a zero
 * total is refused outright rather than warned about.
 */
export function issueBlocker(lines: InvoiceLineDraft[], billTo: { name: string }): string | null {
  if (!billTo.name.trim()) return 'This invoice has nobody to bill — set a customer on the job first.'
  if (lines.length === 0) return 'Add at least one line before issuing.'
  if (lines.some((l) => !l.description.trim())) return 'Every line needs a description the customer can read.'
  const total = linesTotalCents(lines)
  if (total <= 0) return 'The invoice totals nothing — check the amounts.'
  return null
}

/**
 * The warning worth showing before issuing, or null.
 *
 * Deliberately advisory, not a block. Billing over the contract is a normal
 * thing to do when the customer asked for extra work mid-job; billing over it
 * BY ACCIDENT is what this catches.
 */
export function overBillWarning(billing: JobBilling, addingCents: number): string | null {
  if (billing.contractCents == null) return null
  const after = billing.invoicedCents + billing.depositCollectedCents + addingCents
  if (after <= billing.contractCents) return null
  return `This takes the job to ${formatCents(after)} against a contract of ${formatCents(
    billing.contractCents,
  )} — ${formatCents(after - billing.contractCents)} over. Fine if extra work was agreed; check it if not.`
}

/** Due-date arithmetic in one place. 0 days = due on receipt, which is issue date. */
export function dueDateFrom(issueDate: string, dueDays: number): string {
  const d = new Date(`${issueDate}T00:00:00`)
  d.setDate(d.getDate() + Math.max(0, dueDays))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Overdue = issued, unpaid, and past its due date. Drafts and paid never are. */
export function isOverdue(invoice: InvoiceSummaryRow, today = new Date()): boolean {
  if (invoice.status !== 'sent') return false
  if (!invoice.due_date) return false
  return new Date(`${invoice.due_date}T23:59:59`) < today
}

export const KIND_LABEL: Record<InvoiceKind, string> = {
  deposit: 'Deposit',
  progress: 'Progress',
  final: 'Final',
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Issued',
  paid: 'Paid',
  void: 'Void',
}
