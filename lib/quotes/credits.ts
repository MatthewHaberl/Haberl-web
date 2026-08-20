// ─────────────────────────────────────────────────────────────────────────────
// Quote credits — money that comes OFF what the customer pays for this job,
// for a reason that has nothing to do with what the job costs.
//
// Several different things live here, and they are genuinely different:
//   credit        we already owe them (a part back under warranty, a callout
//                 billed that shouldn't have been)
//   deposit_paid  they have already paid a deposit against this work
//   payment       they have already paid something else against this work
//   refund        we are paying them back for something they bought themselves
//   goodwill      we are simply taking something off this job
//
// What they share is the shape: a reason, an amount, and a subtraction at the
// bottom of the document. What separates them is WHICH figure they come off —
// a deposit already banked reduces the deposit still due, while a credit
// reduces the balance on completion. Getting that backwards either asks a
// customer to pay a deposit twice or leaves the business buying materials out
// of its own pocket. See applyCredits.
//
// All of it lives OUTSIDE the bill of materials, in its own column: the
// sections still add up to the price of the work, and the credit comes off the
// bottom where anyone can see it, with its reason printed next to it.
//
// That separation is what lets one implementation serve both engines. Neither
// scopeToBom nor designToBom needs to know credits exist — and neither of them
// gets to be talked into a negative price, which is the guard every one of
// their parsers deliberately holds (a stray minus in a rate field must never
// credit a customer; a credit is typed on purpose, here, with a reason).
//
// Pure module — no Supabase, no React; safe on server and client.
// ─────────────────────────────────────────────────────────────────────────────

export type QuoteCreditKind =
  | 'credit'
  | 'deposit_paid'
  | 'payment'
  | 'refund'
  | 'goodwill'
  | 'other'

export interface QuoteCreditKindSpec {
  key: QuoteCreditKind
  /** What gets picked in the panel. */
  label: string
  /** Default customer-facing wording, used when no reason of your own is typed. */
  defaultLabel: string
  /**
   * Which figure it comes off FIRST.
   *
   * 'deposit' — money already banked against this job. It reduces the deposit
   *   still due; only what is left over touches the balance. A deposit already
   *   paid that came off the balance instead would have the customer asked for
   *   the full deposit a second time before anyone lifts a tool.
   * 'balance' — everything else. It reduces the balance on completion, and only
   *   eats into the deposit once the balance is gone. The deposit buys the
   *   materials; crediting it first would have the business ordering stock out
   *   of its own pocket to settle a debt that isn't due until the job is done.
   */
  appliesTo: 'deposit' | 'balance'
  /** One line in the panel, so the choice is made on what it does. */
  hint: string
}

export const CREDIT_KINDS: QuoteCreditKindSpec[] = [
  {
    key: 'credit', label: 'Credit', defaultLabel: 'Credit',
    appliesTo: 'balance',
    hint: 'Money we already owe them — a part back under warranty, a callout billed that should not have been. Comes off the balance.',
  },
  {
    key: 'deposit_paid', label: 'Deposit already paid', defaultLabel: 'Deposit already paid',
    appliesTo: 'deposit',
    hint: 'They have already paid a deposit towards this work. Comes off the deposit still due, not the balance.',
  },
  {
    key: 'payment', label: 'Payment received', defaultLabel: 'Payment already received',
    appliesTo: 'deposit',
    hint: 'Any other money already banked for this job. Comes off the deposit first, then the balance.',
  },
  {
    key: 'refund', label: 'Reimbursement', defaultLabel: 'Reimbursement',
    appliesTo: 'balance',
    hint: 'Paying them back for something they bought themselves — materials, a hire, someone else’s callout. Comes off the balance.',
  },
  {
    key: 'goodwill', label: 'Goodwill discount', defaultLabel: 'Goodwill discount',
    appliesTo: 'balance',
    hint: 'Taking something off this job as a gesture. Comes off the balance, and prints as a discount.',
  },
  {
    key: 'other', label: 'Other adjustment', defaultLabel: 'Adjustment',
    appliesTo: 'balance',
    hint: 'Anything else that reduces what they pay. Type the reason — it prints on the quote.',
  },
]

export function creditKindSpec(kind: QuoteCreditKind): QuoteCreditKindSpec {
  return CREDIT_KINDS.find((k) => k.key === kind) ?? CREDIT_KINDS[0]
}

export interface QuoteCredit {
  id: string
  /**
   * What kind of money this is. Decides which figure it comes off — see
   * QuoteCreditKindSpec.appliesTo. Anything unrecognised (an older row, a
   * hand-edited blob) reads as 'credit', which is the safe default: it comes
   * off the balance and leaves the materials deposit alone.
   */
  kind: QuoteCreditKind
  /**
   * Why they are being credited, in the customer's words — this PRINTS on the
   * quote. "Geyser element replaced under warranty", not "adj". Blank falls
   * back to the kind's own wording.
   */
  label: string
  /**
   * Rands, always POSITIVE. The minus is applied by the arithmetic below and
   * by the document, never typed: a credit that could be entered negative is a
   * credit that can silently become a surcharge.
   */
  amountR: number
  /** Internal note — the invoice it relates to, who approved it. Never rendered. */
  note: string | null
  /** ISO date the credit was raised, for the internal list. */
  createdAt: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function newCreditId(): string {
  const c = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined
  if (c?.randomUUID) return c.randomUUID()
  return `credit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const KINDS = new Set<string>(CREDIT_KINDS.map((k) => k.key))

/**
 * Tolerant parse of quote_requests.credits — the jsonb array or a JSON string.
 * Same contract as parseScope/parseDesign: never throws, drops anything that
 * isn't a credit, and returns [] for a quote that has none.
 *
 * A non-finite, zero or negative amount is dropped rather than clamped. A R0
 * credit on the document is a line that says "we owe you nothing", and a
 * negative one is the surcharge this feature must never become.
 */
export function parseCredits(raw: unknown): QuoteCredit[] {
  let obj = raw
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj) } catch { return [] }
  }
  if (!Array.isArray(obj)) return []
  const out: QuoteCredit[] = []
  for (const entry of obj) {
    if (!entry || typeof entry !== 'object') continue
    const r = entry as Record<string, unknown>
    const amount = typeof r.amountR === 'string' ? Number(r.amountR) : r.amountR
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) continue
    const kind = (typeof r.kind === 'string' && KINDS.has(r.kind) ? r.kind : 'credit') as QuoteCreditKind
    const label = typeof r.label === 'string' ? r.label.trim() : ''
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : newCreditId(),
      kind,
      // A credit with no reason still comes off the total — it is the
      // customer's money — but it must not print as a blank row.
      label: label || creditKindSpec(kind).defaultLabel,
      amountR: round2(amount),
      note: typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null,
      createdAt: typeof r.createdAt === 'string' && r.createdAt ? r.createdAt : null,
    })
  }
  return out
}

export function creditsTotalR(credits: QuoteCredit[]): number {
  return round2(credits.reduce((t, c) => t + c.amountR, 0))
}

export interface CreditedTotals {
  /** The price of the work — what the sections add up to. Credits never touch it. */
  grossR: number
  /** What every credit is worth in total, before anything is capped. */
  creditR: number
  /** What actually comes off THIS quote — capped at the quote total. */
  appliedR: number
  /**
   * Credit left over because it is worth more than the job. It stays owed to
   * the customer; a quote cannot pay money out. The panel says so, and the
   * customer statement is where it is carried.
   */
  unappliedR: number
  /** What the customer pays in total: gross − applied. Never below zero. */
  payableR: number
  /** Deposit still due, after any money already paid against it. */
  depositR: number
  /** payable − deposit. */
  balanceR: number
}

/**
 * Apply credits to a quote's money.
 *
 * Two passes, because the two kinds move in opposite directions:
 *   1. 'deposit' credits (a deposit already paid) reduce the deposit still due,
 *      and spill onto the balance only once the deposit is nil.
 *   2. 'balance' credits (a credit, a reimbursement, a discount) reduce the
 *      balance on completion, and eat into the deposit only once the balance
 *      is gone.
 *
 * Both floor at zero: a quote records what is owed for a job, and it can never
 * become a payment out. Anything the quote cannot absorb comes back as
 * `unappliedR` for the panel to flag.
 */
export function applyCredits(
  grossR: number,
  depositR: number,
  credits: QuoteCredit[],
): CreditedTotals {
  const gross = round2(Math.max(0, grossR))
  let deposit = round2(Math.min(Math.max(0, depositR), gross))
  let balance = round2(gross - deposit)
  let applied = 0

  const spend = (amount: number, first: 'deposit' | 'balance') => {
    let left = round2(amount)
    const order: Array<'deposit' | 'balance'> =
      first === 'deposit' ? ['deposit', 'balance'] : ['balance', 'deposit']
    for (const pot of order) {
      if (left <= 0) break
      const available = pot === 'deposit' ? deposit : balance
      const used = round2(Math.min(available, left))
      if (used <= 0) continue
      if (pot === 'deposit') deposit = round2(deposit - used)
      else balance = round2(balance - used)
      left = round2(left - used)
      applied = round2(applied + used)
    }
  }

  // Deposit-first money is spent first overall too. It is already banked, so it
  // is the most certain of them, and letting a goodwill discount consume the
  // balance ahead of it would push a real payment onto the deposit.
  for (const c of credits) if (creditKindSpec(c.kind).appliesTo === 'deposit') spend(c.amountR, 'deposit')
  for (const c of credits) if (creditKindSpec(c.kind).appliesTo !== 'deposit') spend(c.amountR, 'balance')

  const creditR = creditsTotalR(credits)
  return {
    grossR: gross,
    creditR,
    appliedR: round2(applied),
    unappliedR: round2(creditR - applied),
    payableR: round2(deposit + balance),
    depositR: deposit,
    balanceR: balance,
  }
}

/**
 * The credit as the document states it: the customer-facing label and the
 * amount already signed, so no renderer has to remember the minus.
 */
export interface CreditView {
  label: string
  /** Formatted and negative — "−R1 250.00". */
  amount: string
}

export function randZA(n: number): string {
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Credit rows for the document, trimmed to what the quote can actually absorb —
 * the customer must never see rows adding up to more than the total they are
 * subtracted from. Same order the arithmetic spends them in.
 */
export function creditViews(credits: QuoteCredit[], appliedR: number): CreditView[] {
  const ordered = [
    ...credits.filter((c) => creditKindSpec(c.kind).appliesTo === 'deposit'),
    ...credits.filter((c) => creditKindSpec(c.kind).appliesTo !== 'deposit'),
  ]
  const views: CreditView[] = []
  let left = round2(appliedR)
  for (const c of ordered) {
    if (left <= 0) break
    const amount = round2(Math.min(c.amountR, left))
    left = round2(left - amount)
    views.push({
      label: c.label || creditKindSpec(c.kind).defaultLabel,
      amount: `−${randZA(amount)}`,
    })
  }
  return views
}

/**
 * The GROSS figures behind a saved quote document — the total and deposit
 * before any credit was applied.
 *
 * Needed because total_amount / deposit_amount on the row are already net: to
 * re-apply an edited credit list you have to start from the uncredited figures
 * or the second edit credits an already-credited number. The document keeps
 * both: quoteTotalRands is deliberately never credited (the sections have to
 * add up to it), and depositItems comes straight from computeDeposit, which
 * knows nothing about credits.
 *
 * Returns null for a quote with no document yet, or a legacy multi-option one
 * whose per-tier totals aren't a single figure a credit can come off.
 */
export function grossFiguresFromDocument(
  generatedQuote: unknown,
): { grossTotalR: number; grossDepositR: number } | null {
  if (!generatedQuote) return null
  let data: unknown = generatedQuote
  if (typeof data === 'string') {
    try { data = JSON.parse(data) } catch { return null }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  if (d.type === 'multi-option') return null
  const grossTotalR = typeof d.quoteTotalRands === 'number' && Number.isFinite(d.quoteTotalRands)
    ? d.quoteTotalRands : 0
  if (grossTotalR <= 0) return null
  const items = Array.isArray(d.depositItems) ? d.depositItems : []
  const grossDepositR = round2(items.reduce((t: number, i) => {
    const amount = (i as { amountRands?: unknown })?.amountRands
    return t + (typeof amount === 'number' && Number.isFinite(amount) ? amount : 0)
  }, 0))
  return { grossTotalR: round2(grossTotalR), grossDepositR }
}
