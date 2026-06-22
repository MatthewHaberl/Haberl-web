/**
 * Daily briefing — the "wake up and see your day" engine.
 *
 * Two halves, mirroring the question every morning: what is going out WITHOUT me,
 * and what NEEDS me?
 *   - customerSends     → reminder emails the cron sends to customers on its own
 *   - everything else   → action items for the operator (quotes to send, deposits
 *                         to confirm, leads to call, overdue POs, quotes to chase)
 *
 * `planFollowup` is the single source of truth for what the daily quote-followups
 * cron does — the cron executes it, the briefing previews it, so they never drift.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { emailButton, emailLayout, sendEmail } from '@/lib/email/send'

// ── Follow-up planner (shared with /api/cron/quote-followups) ──────────────────

export type FollowupAction =
  | 'customer_nudge_1'
  | 'customer_nudge_2'
  | 'admin_no_response'
  | 'admin_expired'

export interface PlannableQuote {
  sent_at: string | null
  expiry_date: string | null
  reminder_count: number
}

/** What the daily cron will do for one sent quote today (null = nothing yet). */
export function planFollowup(quote: PlannableQuote, now: number): FollowupAction | null {
  if (!quote.sent_at || quote.reminder_count >= 3) return null
  const daysSinceSent = (now - new Date(quote.sent_at).getTime()) / 86_400_000
  const expired = quote.expiry_date
    ? now > new Date(`${quote.expiry_date}T23:59:59`).getTime()
    : false
  if (expired) return 'admin_expired'
  if (daysSinceSent >= 10 && quote.reminder_count === 2) return 'admin_no_response'
  if (daysSinceSent >= 7 && quote.reminder_count === 1) return 'customer_nudge_2'
  if (daysSinceSent >= 3 && quote.reminder_count === 0) return 'customer_nudge_1'
  return null
}

/** Customer actions email the customer; admin actions only flag for a human. */
export function isCustomerAction(action: FollowupAction): boolean {
  return action === 'customer_nudge_1' || action === 'customer_nudge_2'
}

/** reminder_count value to stamp after an action runs (state machine 0→1→2→3). */
export function nextReminderCount(action: FollowupAction): number {
  switch (action) {
    case 'customer_nudge_1': return 1
    case 'customer_nudge_2': return 2
    case 'admin_no_response': return 3
    case 'admin_expired': return 3
  }
}

function describeAction(action: FollowupAction): string {
  switch (action) {
    case 'customer_nudge_1': return '1st reminder (sent 3 days ago)'
    case 'customer_nudge_2': return '2nd reminder (sent 7 days ago)'
    case 'admin_no_response': return 'No response after 2 reminders — time for a call'
    case 'admin_expired': return 'Quote expired — consider a fresh follow-up'
  }
}

// ── Briefing shape ─────────────────────────────────────────────────────────────

export interface BriefingQuoteRef {
  id: string
  quoteNumber: string | null
  customerName: string
  detail: string
  href: string
  // How many whole days this has been waiting, and whether that crossed the
  // "taking too long" threshold. Optional — the email/Today views ignore them;
  // the dashboard command center uses them for the red/amber aging chips.
  ageDays?: number
  urgent?: boolean
}

export interface BriefingItem {
  id: string
  label: string
  sub?: string
  href: string
  phone?: string
  ageDays?: number
  urgent?: boolean
}

export interface DailyBriefing {
  dateLabel: string
  customerSends: BriefingQuoteRef[]
  personalFollowups: BriefingQuoteRef[]
  drafts: BriefingItem[]
  awaitingResponse: BriefingItem[]
  depositsToConfirm: BriefingItem[]
  newLeads: BriefingItem[]
  followupLeads: BriefingItem[]
  overduePOs: BriefingItem[]
  totalAuto: number
  totalAttention: number
}

function rands(cents: number | null | undefined): string {
  if (cents == null) return ''
  return `R${(cents / 100).toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`
}

function shortDate(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
}

/** Whole days between `value` and now (never negative). undefined if no date. */
function daysSince(value: string | null | undefined, now: number): number | undefined {
  if (!value) return undefined
  return Math.max(0, Math.floor((now - new Date(value).getTime()) / 86_400_000))
}

/** Gather everything the operator should see this morning. */
export async function buildDailyBriefing(
  supabase: SupabaseClient,
  now: number = Date.now(),
): Promise<DailyBriefing> {
  const today = new Date(now).toISOString().slice(0, 10)
  const dateLabel = new Date(now).toLocaleDateString('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const [sentRes, draftRes, viewedRes, depositRes, leadRes, contactedLeadRes, poRes] = await Promise.all([
    supabase
      .from('quote_requests')
      .select('id, customer_name, quote_number, expiry_date, sent_at, reminder_count')
      .eq('status', 'sent').not('sent_at', 'is', null).lt('reminder_count', 3),
    supabase
      .from('quote_requests')
      .select('id, customer_name, quote_number, total_amount, created_at')
      .eq('status', 'generated').order('created_at', { ascending: true }),
    supabase
      .from('quote_requests')
      .select('id, customer_name, quote_number, viewed_at, sent_at')
      .eq('status', 'sent').not('viewed_at', 'is', null).order('viewed_at', { ascending: true }),
    supabase
      .from('jobs')
      .select('id, title, deposit_proof_uploaded_at')
      .not('deposit_proof_uploaded_at', 'is', null).is('deposit_confirmed_at', null)
      .order('deposit_proof_uploaded_at', { ascending: true }),
    supabase
      .from('leads')
      .select('id, name, phone, suburb, created_at')
      .eq('status', 'new').order('created_at', { ascending: true }),
    supabase
      .from('leads')
      .select('id, name, phone, suburb, created_at, contacted_at')
      .eq('status', 'contacted').order('contacted_at', { ascending: true }),
    supabase
      .from('purchase_orders')
      .select('id, po_number, expected_date, supplier:suppliers(name)')
      .in('status', ['sent', 'partial']).not('expected_date', 'is', null)
      .lt('expected_date', today).order('expected_date', { ascending: true }),
  ])

  const sentQuotes = (sentRes.data ?? []) as Array<PlannableQuote & { id: string; customer_name: string; quote_number: string | null }>
  const customerSends: BriefingQuoteRef[] = []
  const personalFollowups: BriefingQuoteRef[] = []
  for (const q of sentQuotes) {
    const action = planFollowup(q, now)
    if (!action) continue
    const ref: BriefingQuoteRef = {
      id: q.id, quoteNumber: q.quote_number, customerName: q.customer_name,
      detail: describeAction(action), href: `/portal/employee/quotes/${q.id}`,
      ageDays: daysSince(q.sent_at, now),
      // Personal follow-ups are the escalations (no reply after 2 nudges, or expired)
      // — they always need attention.
      urgent: !isCustomerAction(action),
    }
    if (isCustomerAction(action)) customerSends.push(ref)
    else personalFollowups.push(ref)
  }

  const drafts: BriefingItem[] = ((draftRes.data ?? []) as Array<{ id: string; customer_name: string; quote_number: string | null; total_amount: number | null; created_at: string | null }>)
    .map((q) => {
      const ageDays = daysSince(q.created_at, now)
      return {
        id: q.id,
        label: `${q.customer_name}${q.quote_number ? ` · ${q.quote_number}` : ''}`,
        sub: rands(q.total_amount) || undefined,
        href: `/portal/employee/quotes/${q.id}`,
        ageDays,
        urgent: ageDays != null && ageDays >= 3,
      }
    })

  const awaitingResponse: BriefingItem[] = ((viewedRes.data ?? []) as Array<{ id: string; customer_name: string; quote_number: string | null; viewed_at: string | null; sent_at: string | null }>)
    .map((q) => {
      const ageDays = daysSince(q.sent_at ?? q.viewed_at, now)
      return {
        id: q.id,
        label: `${q.customer_name}${q.quote_number ? ` · ${q.quote_number}` : ''}`,
        sub: q.viewed_at ? `opened ${shortDate(q.viewed_at)}` : undefined,
        href: `/portal/employee/quotes/${q.id}`,
        ageDays,
        urgent: ageDays != null && ageDays >= 7,
      }
    })

  const depositsToConfirm: BriefingItem[] = ((depositRes.data ?? []) as Array<{ id: string; title: string; deposit_proof_uploaded_at: string | null }>)
    .map((j) => {
      const ageDays = daysSince(j.deposit_proof_uploaded_at, now)
      return {
        id: j.id,
        label: j.title,
        sub: j.deposit_proof_uploaded_at ? `proof uploaded ${shortDate(j.deposit_proof_uploaded_at)}` : 'proof uploaded',
        href: `/portal/employee/jobs/${j.id}`,
        ageDays,
        urgent: ageDays != null && ageDays >= 2,
      }
    })

  const newLeads: BriefingItem[] = ((leadRes.data ?? []) as Array<{ id: string; name: string; phone: string; suburb: string | null; created_at: string | null }>)
    .map((l) => {
      const ageDays = daysSince(l.created_at, now)
      return {
        id: l.id,
        label: l.name,
        sub: l.suburb ?? undefined,
        href: '/portal/employee/leads',
        phone: l.phone,
        ageDays,
        // A lead not called within a day is already too slow.
        urgent: ageDays != null && ageDays >= 1,
      }
    })

  // Leads you've called but not yet turned into a quote. Shown every single day
  // until converted or discarded — no waiting period — so nothing dies after one
  // call (it takes ~8 touches to close). Oldest-contacted first.
  const followupLeads: BriefingItem[] = ((contactedLeadRes.data ?? []) as Array<{ id: string; name: string; phone: string; suburb: string | null; created_at: string | null; contacted_at: string | null }>)
    .map((l) => {
      const ageDays = daysSince(l.contacted_at ?? l.created_at, now)
      return {
        id: l.id,
        label: l.name,
        sub: [l.suburb, ageDays != null ? `called ${ageDays === 0 ? 'today' : `${ageDays}d ago`}` : null]
          .filter(Boolean).join(' · ') || undefined,
        href: '/portal/employee/leads',
        phone: l.phone,
        ageDays,
        // Called 3+ days ago and still not quoted — chase it now.
        urgent: ageDays != null && ageDays >= 3,
      }
    })

  const overduePOs: BriefingItem[] = ((poRes.data ?? []) as Array<{ id: string; po_number: string; expected_date: string | null; supplier: { name: string } | { name: string }[] | null }>)
    .map((po) => {
      const supplier = Array.isArray(po.supplier) ? po.supplier[0] : po.supplier
      // expected_date is in the past (query filters `< today`), so this is days overdue.
      const overdue = daysSince(po.expected_date, now)
      return {
        id: po.id,
        label: po.po_number,
        sub: `${supplier?.name ?? 'supplier'} · due ${shortDate(po.expected_date)}`,
        href: `/portal/employee/procurement/${po.id}`,
        ageDays: overdue,
        urgent: true,
      }
    })

  const totalAttention =
    personalFollowups.length + drafts.length + awaitingResponse.length +
    depositsToConfirm.length + newLeads.length + followupLeads.length + overduePOs.length

  return {
    dateLabel,
    customerSends,
    personalFollowups,
    drafts,
    awaitingResponse,
    depositsToConfirm,
    newLeads,
    followupLeads,
    overduePOs,
    totalAuto: customerSends.length,
    totalAttention,
  }
}

// ── Email rendering ────────────────────────────────────────────────────────────

function emailList(
  title: string,
  items: Array<{ label: string; sub?: string; href: string }>,
  baseUrl: string,
): string {
  if (!items.length) return ''
  const rows = items.map((i) =>
    `<li style="margin:5px 0;font-size:14px;line-height:1.5;">
       <a href="${baseUrl}${i.href}" style="color:#1e3a5f;text-decoration:none;font-weight:bold;">${i.label}</a>${i.sub ? ` <span style="color:#6b7280;font-weight:normal;">— ${i.sub}</span>` : ''}
     </li>`).join('')
  return `<p style="margin:16px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;">${title}</p>
    <ul style="margin:0;padding-left:18px;">${rows}</ul>`
}

/** Leads get a tap-to-call number so you can phone straight from the email. */
function emailLeadsList(title: string, items: BriefingItem[], baseUrl: string): string {
  if (!items.length) return ''
  const rows = items.map((i) => {
    const tel = i.phone ? i.phone.replace(/[^\d+]/g, '') : ''
    const call = i.phone
      ? ` — <a href="tel:${tel}" style="color:#1e3a5f;text-decoration:none;font-weight:bold;">📞 ${i.phone}</a>`
      : ''
    return `<li style="margin:5px 0;font-size:14px;line-height:1.5;">
       <a href="${baseUrl}${i.href}" style="color:#1e3a5f;text-decoration:none;font-weight:bold;">${i.label}</a>${i.sub ? ` <span style="color:#6b7280;font-weight:normal;">(${i.sub})</span>` : ''}${call}
     </li>`
  }).join('')
  return `<p style="margin:16px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;">${title}</p>
    <ul style="margin:0;padding-left:18px;">${rows}</ul>`
}

export function renderBriefingHtml(b: DailyBriefing, baseUrl: string): string {
  const autoBlock = b.customerSends.length
    ? `<ul style="margin:0;padding-left:18px;">${b.customerSends.map((q) =>
        `<li style="margin:5px 0;font-size:14px;line-height:1.5;">${q.customerName}${q.quoteNumber ? ` <span style="color:#6b7280;">(${q.quoteNumber})</span>` : ''} — ${q.detail}</li>`).join('')}</ul>`
    : `<p style="font-size:14px;color:#6b7280;margin:4px 0;">Nothing emails customers automatically today.</p>`

  const attention = [
    emailList('✍️ Quotes ready to send', b.drafts, baseUrl),
    b.personalFollowups.length
      ? `<p style="margin:16px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;">📞 Personal follow-up (call them)</p>
         <ul style="margin:0;padding-left:18px;">${b.personalFollowups.map((q) =>
           `<li style="margin:5px 0;font-size:14px;line-height:1.5;"><a href="${baseUrl}${q.href}" style="color:#1e3a5f;text-decoration:none;font-weight:bold;">${q.customerName}${q.quoteNumber ? ` (${q.quoteNumber})` : ''}</a> <span style="color:#6b7280;">— ${q.detail}</span></li>`).join('')}</ul>`
      : '',
    emailList('👀 Viewed — waiting on their reply', b.awaitingResponse, baseUrl),
    emailList('💰 Deposits to confirm', b.depositsToConfirm, baseUrl),
    emailLeadsList('🌱 New leads to call', b.newLeads, baseUrl),
    emailLeadsList('📞 Follow up — called, not yet quoted', b.followupLeads, baseUrl),
    emailList('📦 Overdue purchase orders', b.overduePOs, baseUrl),
  ].join('')

  const body = `
    <p style="font-size:15px;line-height:1.6;">Good morning. Here's your day at a glance for <strong>${b.dateLabel}</strong>.</p>

    <h2 style="font-size:16px;color:#1e3a5f;margin:22px 0 2px;">📤 Going out automatically today (${b.totalAuto})</h2>
    <p style="font-size:13px;color:#6b7280;margin:0 0 8px;">These send on their own — no action needed from you.</p>
    ${autoBlock}

    <h2 style="font-size:16px;color:#1e3a5f;margin:24px 0 2px;">✅ Needs you today (${b.totalAttention})</h2>
    ${b.totalAttention ? attention : `<p style="font-size:14px;color:#16a34a;margin:6px 0;">All clear — nothing needs you right now.</p>`}

    ${emailButton(`${baseUrl}/portal/employee/briefing`, 'Open full briefing')}
  `
  return emailLayout(`Daily briefing — ${b.dateLabel}`, body)
}

export function renderBriefingText(b: DailyBriefing, baseUrl: string): string {
  const lines: string[] = [`Haberl daily briefing — ${b.dateLabel}`, '']
  lines.push(`GOING OUT AUTOMATICALLY (${b.totalAuto}):`)
  if (b.customerSends.length) {
    for (const q of b.customerSends) lines.push(`  - ${q.customerName}${q.quoteNumber ? ` (${q.quoteNumber})` : ''} — ${q.detail}`)
  } else lines.push('  - Nothing today')
  lines.push('', `NEEDS YOU (${b.totalAttention}):`)
  const push = (label: string, items: Array<{ label: string; sub?: string }>) => {
    for (const i of items) lines.push(`  - [${label}] ${i.label}${i.sub ? ` — ${i.sub}` : ''}`)
  }
  push('send', b.drafts)
  for (const q of b.personalFollowups) lines.push(`  - [call] ${q.customerName}${q.quoteNumber ? ` (${q.quoteNumber})` : ''} — ${q.detail}`)
  push('chase', b.awaitingResponse)
  push('deposit', b.depositsToConfirm)
  for (const l of b.newLeads) {
    lines.push(`  - [lead] ${l.label}${l.sub ? ` (${l.sub})` : ''}${l.phone ? ` — call ${l.phone}` : ''}`)
  }
  for (const l of b.followupLeads) {
    lines.push(`  - [follow up] ${l.label}${l.sub ? ` (${l.sub})` : ''}${l.phone ? ` — call ${l.phone}` : ''}`)
  }
  push('PO overdue', b.overduePOs)
  if (!b.totalAttention) lines.push('  - All clear')
  lines.push('', `Full briefing: ${baseUrl}/portal/employee/briefing`)
  return lines.join('\n')
}

/**
 * Parse the company_settings briefing recipient list (comma / space / semicolon
 * separated). Falls back to contact_email when unset, so the briefing always has
 * somewhere to land. Recipients live in settings, not code, so they change
 * without a deploy.
 */
export function parseBriefingRecipients(
  briefingEmails: string | null | undefined,
  contactEmail: string | null | undefined,
): string[] {
  const list = (briefingEmails ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
  if (list.length) return Array.from(new Set(list))
  return contactEmail ? [contactEmail] : []
}

/** Build + email the briefing in one call (used by the daily cron). */
export async function emailDailyBriefing(opts: {
  supabase: SupabaseClient
  baseUrl: string
  to: string[]
  now?: number
}): Promise<{ briefing: DailyBriefing; sent: boolean }> {
  const now = opts.now ?? Date.now()
  const briefing = await buildDailyBriefing(opts.supabase, now)
  const result = await sendEmail({
    to: opts.to,
    subject: `Haberl daily briefing — ${briefing.totalAttention} need you, ${briefing.totalAuto} auto-sending`,
    html: renderBriefingHtml(briefing, opts.baseUrl),
    text: renderBriefingText(briefing, opts.baseUrl),
  })
  return { briefing, sent: result.sent }
}
