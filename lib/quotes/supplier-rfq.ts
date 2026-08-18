// ─────────────────────────────────────────────────────────────────────────────
// Supplier RFQs (W99) — the outbound half of the supplier-quote loop.
//
// 109/W98 covered the reply: upload the supplier's quote, parse it, pull the
// lines in at the quoted price. This module covers the ask that comes first —
// turn the quote's own BOM into a list of items to price and send it out.
//
// Two things the list has to get right:
//   1. An item with no part number ("M8 stainless nuts and bolts") can't be
//      ordered, only described. Those lines carry needsCode and print under
//      their own heading asking the supplier to advise the code.
//   2. A catalog cost stamped months ago (price_updated_at, migration 030) may
//      have moved since the import. It still goes on the list — flagged stale —
//      so the price is confirmed before the customer quote is finalised.
//
// No money crosses this module by design: an RFQ asks, a purchase order tells.
//
// Pure module — no Supabase, no React; safe on server and client.
// ─────────────────────────────────────────────────────────────────────────────

import type { BomLine, DesignBom } from '@/lib/solar/design-bom'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'

/** Heading the code-less items print under. */
export const NO_CODE_HEADING = "Items we don't have a code for — please advise part number"

/** A catalog cost older than this is worth re-confirming (Settings → Catalog's rule). */
export const STALE_PRICE_DAYS = 60

/** Sections that are our own work, not something a supplier stocks. */
const NON_MATERIAL_SECTIONS = new Set(['Labour', 'Compliance'])

export type RfqStatus = 'draft' | 'sent' | 'quoted' | 'cancelled'
export type RfqChannel = 'email' | 'copy' | 'whatsapp'

export interface SupplierRfqRow {
  id: string
  quote_request_id: string
  supplier_id: string | null
  supplier_name: string
  rfq_number: string
  status: RfqStatus
  message: string | null
  sent_at: string | null
  sent_to: string[]
  sent_via: RfqChannel | null
  created_by: string | null
  created_at: string
}

export interface SupplierRfqLineRow {
  id: string
  rfq_id: string
  line_no: number
  section: string
  sku: string
  description: string
  qty: number
  unit: string
  catalog_id: string | null
  needs_code: boolean
  note: string | null
  created_at: string
}

/** A proposed line, before it is saved — what the picker dialog opens with. */
export interface RfqCandidate {
  section: string
  sku: string
  description: string
  qty: number
  unit: string
  catalogId: string | null
  needsCode: boolean
  /** No price at all on the quote — the reason this feature exists. */
  unpriced: boolean
  /** Priced, but off a catalog cost older than STALE_PRICE_DAYS. */
  stale: boolean
  /** Age of the catalog cost in days, when we know it. */
  priceAgeDays: number | null
}

// ── Line derivation ──────────────────────────────────────────────────────────

/** A synthetic BOM id (cable:/consumable:/labour:/scope:) has no catalog row behind it. */
function realCatalogId(catalogId: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(catalogId)
    ? catalogId
    : null
}

/** A SKU the BOM prints as a placeholder is no SKU at all. */
function cleanSku(sku: string): string {
  const s = (sku ?? '').trim()
  return s === '—' || s === '-' || s === '?' ? '' : s
}

/** Cable is bought by the metre; everything else by the each. */
function unitFor(section: string): string {
  return section === 'Cabling' ? 'm' : 'ea'
}

function ageInDays(updatedAt: string | null | undefined, now: number): number | null {
  if (!updatedAt) return null
  const ms = now - new Date(updatedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.floor(ms / 86_400_000)
}

/** Material lines only — our own labour and compliance fees aren't the supplier's to price. */
export function isMaterialLine(line: BomLine, sectionName: string): boolean {
  if (line.kind === 'labour' || line.kind === 'fee') return false
  if (NON_MATERIAL_SECTIONS.has(sectionName)) return false
  return true
}

/**
 * Turn a priced BOM into the RFQ's opening line list.
 *
 * Every material line comes through — an imported price can be as wrong as a
 * missing one, and the whole point is to have the supplier confirm the list.
 * The flags (unpriced / stale) drive how each row is shown, not whether it's on.
 * Identical items merge across sections so the supplier is asked once.
 */
export function bomToRfqCandidates(
  bom: DesignBom,
  catalog: Map<string, EquipmentCatalogItem>,
  opts: { now?: number } = {},
): RfqCandidate[] {
  const now = opts.now ?? Date.now()
  const order: string[] = []
  const merged = new Map<string, RfqCandidate>()

  for (const section of bom.sections) {
    for (const line of section.lines) {
      if (!isMaterialLine(line, section.name)) continue
      if (line.qty <= 0) continue

      const sku = cleanSku(line.sku)
      const catalogId = realCatalogId(line.catalogId)
      const item = catalogId ? catalog.get(catalogId) : undefined
      const priceAgeDays = ageInDays(item?.price_updated_at, now)

      const candidate: RfqCandidate = {
        section: section.name,
        sku,
        description: line.description.trim() || sku || 'Item',
        qty: line.qty,
        unit: unitFor(section.name),
        catalogId,
        // No code to order against: nothing in the SKU column, or the design
        // never had a product attached in the first place.
        needsCode: !sku || line.status === 'no-product',
        unpriced: !line.priced,
        stale: line.priced && priceAgeDays !== null && priceAgeDays > STALE_PRICE_DAYS,
        priceAgeDays,
      }

      // Merge on identity, not on where it sits — two earth lugs in two sections
      // are one thing to ask about. Code-less lines merge on their wording.
      const identity = catalogId
        ?? (sku ? `sku:${sku.toLowerCase()}` : `desc:${candidate.description.toLowerCase()}`)
      const key = `${identity}|${candidate.unit}`
      const existing = merged.get(key)
      if (existing) {
        existing.qty += candidate.qty
        existing.unpriced = existing.unpriced || candidate.unpriced
        existing.stale = existing.stale || candidate.stale
        existing.needsCode = existing.needsCode || candidate.needsCode
      } else {
        order.push(key)
        merged.set(key, candidate)
      }
    }
  }

  return order.map((k) => merged.get(k)!)
}

// ── Grouping for display and printing ────────────────────────────────────────

export interface RfqGroup {
  heading: string
  /** True for the code-less group — it asks for a part number, not just a price. */
  needsCode: boolean
  lines: SupplierRfqLineRow[]
}

/**
 * Group saved lines the way they print: the items we can name by code first,
 * under their BOM section, then everything we can only describe, together at
 * the bottom under one heading the supplier can't miss.
 */
export function groupRfqLines(lines: SupplierRfqLineRow[]): RfqGroup[] {
  const groups: RfqGroup[] = []
  const byHeading = new Map<string, RfqGroup>()
  const noCode: SupplierRfqLineRow[] = []

  for (const line of [...lines].sort((a, b) => a.line_no - b.line_no)) {
    if (line.needs_code || !line.sku.trim()) { noCode.push(line); continue }
    const heading = line.section.trim() || 'Items'
    let group = byHeading.get(heading)
    if (!group) {
      group = { heading, needsCode: false, lines: [] }
      byHeading.set(heading, group)
      groups.push(group)
    }
    group.lines.push(line)
  }

  if (noCode.length) groups.push({ heading: NO_CODE_HEADING, needsCode: true, lines: noCode })
  return groups
}

// ── Rendering ────────────────────────────────────────────────────────────────

export interface RfqRenderContext {
  rfqNumber: string
  supplierName: string
  /** Contact person at the supplier, for the greeting. */
  contactPerson?: string | null
  /** Our reference for the job — customer name and/or site, never a price. */
  jobRef?: string | null
  /** The free-text note typed above the table. */
  message?: string | null
  /** Who to reply to. */
  fromName?: string | null
  fromEmail?: string | null
  fromPhone?: string | null
}

const qtyText = (qty: number, unit: string) => {
  const n = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100)
  return unit && unit !== 'ea' ? `${n} ${unit}` : n
}

/**
 * Plain-text RFQ — the body behind both the Copy button and the WhatsApp link,
 * and the text/plain part of the email. Kept narrow enough to survive a phone.
 */
export function renderRfqText(ctx: RfqRenderContext, lines: SupplierRfqLineRow[]): string {
  const out: string[] = []
  out.push(`RFQ ${ctx.rfqNumber} — Haberl Electrical & Solar`)
  if (ctx.jobRef) out.push(`Job: ${ctx.jobRef}`)
  out.push('')
  out.push(`Hi${ctx.contactPerson ? ` ${ctx.contactPerson}` : ''},`)
  out.push('')
  out.push('Please quote me on the following. Prices ex-VAT, and let me know lead time on anything not in stock.')
  if (ctx.message?.trim()) { out.push(''); out.push(ctx.message.trim()) }

  for (const group of groupRfqLines(lines)) {
    out.push('')
    out.push(group.heading.toUpperCase())
    if (group.needsCode) out.push('(no part number on our side — please advise the code as well as the price)')
    for (const line of group.lines) {
      const code = line.sku.trim() ? `${line.sku} — ` : ''
      const note = line.note?.trim() ? ` (${line.note.trim()})` : ''
      out.push(`  ${qtyText(line.qty, line.unit)} x ${code}${line.description}${note}`)
    }
  }

  out.push('')
  out.push('Thanks,')
  if (ctx.fromName) out.push(ctx.fromName)
  const contact = [ctx.fromPhone, ctx.fromEmail].filter(Boolean).join(' · ')
  if (contact) out.push(contact)
  return out.join('\n')
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** The RFQ table as email HTML — inline styles only, same as the PO mail. */
export function renderRfqHtml(ctx: RfqRenderContext, lines: SupplierRfqLineRow[]): string {
  const cell = 'padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;'
  const head = 'padding:6px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #e5e7eb;'

  const groups = groupRfqLines(lines).map((group) => {
    const rows = group.lines.map((line) => `
      <tr>
        <td style="${cell}font-family:monospace;font-size:12px;">${esc(line.sku.trim() || '—')}</td>
        <td style="${cell}">${esc(line.description)}${line.note?.trim() ? `<br><span style="font-size:11px;color:#6b7280;">${esc(line.note.trim())}</span>` : ''}</td>
        <td style="${cell}text-align:center;white-space:nowrap;">${esc(qtyText(line.qty, line.unit))}</td>
        <td style="${cell}text-align:right;color:#9ca3af;">&nbsp;</td>
      </tr>`).join('')
    const codeNote = group.needsCode
      ? `<p style="margin:0 0 6px;font-size:12px;color:#6b7280;">We don&apos;t have part numbers for these — please advise the code as well as the price.</p>`
      : ''
    return `
      <p style="margin:18px 0 6px;font-size:13px;font-weight:bold;color:${group.needsCode ? '#b45309' : '#111827'};">${esc(group.heading)}</p>
      ${codeNote}
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:6px;">
        <tr>
          <th style="${head}">Code</th>
          <th style="${head}">Item</th>
          <th style="${head}text-align:center;">Qty</th>
          <th style="${head}text-align:right;">Your price</th>
        </tr>
        ${rows}
      </table>`
  }).join('')

  return `
    <p style="font-size:15px;line-height:1.6;">Hi${ctx.contactPerson ? ` ${esc(ctx.contactPerson)}` : ''},</p>
    <p style="font-size:15px;line-height:1.6;">Please quote me on the following${ctx.jobRef ? ` for <strong>${esc(ctx.jobRef)}</strong>` : ''}. Prices ex-VAT, and let me know lead time on anything not in stock. Our reference is <strong>${esc(ctx.rfqNumber)}</strong>.</p>
    ${ctx.message?.trim() ? `<p style="font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(ctx.message.trim())}</p>` : ''}
    ${groups}
    <p style="margin-top:18px;font-size:13px;color:#6b7280;">Reply to this email with your quote and I&apos;ll load it against the job.</p>`
}

/**
 * WhatsApp share link. With a number it opens the chat with that contact;
 * without one, WhatsApp asks who to send it to.
 */
export function whatsappLink(text: string, phone?: string | null): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(text)}`
}
