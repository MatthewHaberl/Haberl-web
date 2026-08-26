// ─────────────────────────────────────────────────────────────────────────────
// Turning a quote into an invoice — the whole document, not a one-line summary.
//
// An invoice raised off a job used to say "Balance of works — QUO-2026-014"
// and nothing else. Correct to the cent, and useless to the customer: they
// agreed to a page of sections and got back a single number with no way to see
// what it bought. This module reads the quote the customer was actually sent
// (`generated_quote` — the frozen document, never a re-price) and gives back
// invoice lines that read the same way it did.
//
// Two engines produce that document and both are handled here:
//
//   scope  section views carrying their own subtotalRands — clean numbers
//   solar  a flat bag of formatted strings, one per BOM section, exactly as
//          the "Quote Summary" table prints them
//
// Where a numeric field exists it is used; a formatted string is only parsed
// when there is no number behind it. Nothing here re-prices anything: every
// figure comes off the saved document, so an invoice can never quietly bill a
// supplier increase the customer never saw.
//
// The invariant: the lines add up to what the document says is payable. When
// they do not — an older document, a section the renderer folded, a package
// priced standalone — the difference becomes its own visible line rather than
// a silent misbill. A draft is editable, so an operator can always correct it.
// ─────────────────────────────────────────────────────────────────────────────

import { packageIdFromTier } from '@/lib/quotes/public'
import type { InvoiceLineDraft } from './invoice'

export interface QuoteConversion {
  /** Which document shape these came out of. */
  engine: 'scope' | 'solar'
  /** The quote, line for line — ready to become invoice_lines. */
  lines: InvoiceLineDraft[]
  /** What the lines add up to. Equal to documentTotalCents by construction. */
  totalCents: number
  /** What the document itself says the customer owes, net of credits. */
  documentTotalCents: number | null
  /** The scope-of-works paragraph, for the note above the terms. */
  summary: string | null
  /** Anything the operator should read before issuing. Null when it is clean. */
  note: string | null
}

interface ConversionOpts {
  acceptedTier?: string | null
  quoteNumber?: string | null
}

/**
 * The quote document, as invoice lines.
 *
 * `acceptedTier` decides WHICH document: a multi-option solar quote has one per
 * tier, and a combined scope quote can be accepted a single work package at a
 * time. Getting that wrong bills a customer for the option they turned down.
 *
 * Returns null when there is nothing to convert — no saved document, or one in
 * a shape this cannot read. The caller falls back to the old single-line bases.
 */
export function quoteConversion(
  generatedQuote: unknown,
  opts: ConversionOpts = {},
): QuoteConversion | null {
  const data = asRecord(generatedQuote)
  if (!data) return null

  if (data.type === 'multi-option') {
    const live = arrayOf(data.options)
    if (live.length === 0) return null
    const chosen =
      live.find((o) => String(o.tier ?? '') === String(opts.acceptedTier ?? '')) ??
      live.find((o) => o.recommended === true) ??
      live[0]
    const converted = solarConversion(chosen, opts)
    if (!converted) return null
    const tierLabel = String(chosen.tierLabel ?? chosen.tier ?? '').trim()
    // Which option this is matters more than usual here: nothing else on the
    // invoice says the customer was shown three prices.
    const accepted = String(opts.acceptedTier ?? '') === String(chosen.tier ?? '')
    return withNote(
      converted,
      accepted
        ? tierLabel
          ? `Converted the ${tierLabel} option — the one that was accepted.`
          : null
        : `This quote offered several options and none is marked accepted. Converted ${
            tierLabel || 'the first option'
          } — check it before issuing.`,
    )
  }

  if (data.type === 'scope') return scopeConversion(data, opts)
  return solarConversion(data, opts)
}

// ── Scope quotes ─────────────────────────────────────────────────────────────

function scopeConversion(
  data: Record<string, unknown>,
  opts: ConversionOpts,
): QuoteConversion | null {
  const packages = arrayOf(data.packages)
  const acceptedPackageId = packageIdFromTier(opts.acceptedTier)
  const accepted = acceptedPackageId
    ? packages.find((p) => String(p.id ?? '') === acceptedPackageId)
    : undefined

  let sections: Record<string, unknown>[]
  let documentTotalR: number | null
  let note: string | null = null
  let takeCredits = true

  if (accepted) {
    // One work package on a combined quote. It is billed at its STANDALONE
    // price — its own visit, its own certificate — which is higher than its
    // sections add up to, and higher than the same work inside the bundle.
    // Credits are priced against the whole job and stay off it (see
    // parsePackageChoice), so this branch never spends one.
    sections = arrayOf(accepted.sections)
    documentTotalR = numberOf(accepted.ownTotalRands)
    takeCredits = false
    note = `Converted the "${String(accepted.name ?? 'package')}" package — the part of this quote the customer accepted, at its standalone price.`
  } else {
    // Everything. `sections` at the top level already holds the packaged and
    // the shared sections both, so this is the whole document either way.
    sections = arrayOf(data.sections)
    if (sections.length === 0) {
      sections = [...packages.flatMap((p) => arrayOf(p.sections)), ...arrayOf(data.sharedSections)]
    }
    documentTotalR = numberOf(data.payableTotalRands) ?? numberOf(data.quoteTotalRands)
    if (packages.length > 1 && acceptedPackageId) {
      note = 'The accepted work package is not in the saved document — converted the whole quote instead.'
    }
  }

  if (sections.length === 0) return null

  const lines: InvoiceLineDraft[] = []
  let unpriced = 0

  for (const section of sections) {
    const name = String(section.name ?? '').trim() || 'Work'
    const detail = String(section.detail ?? '').trim() || null
    const itemised = arrayOf(section.lines)

    if (itemised.length > 0) {
      // A DETAILED quote (migration 124) itemised every part and task for the
      // customer. Bill it back the same way — the section name becomes the
      // small print, so the invoice still reads in groups.
      for (const item of itemised) {
        const built = itemisedLine(item, name)
        if (!built) {
          unpriced += 1
          continue
        }
        lines.push(built)
      }
    } else {
      const subtotal = cents(numberOf(section.subtotalRands) ?? 0)
      lines.push({
        description: name,
        detail,
        qty: 1,
        unit: null,
        unitPriceCents: subtotal,
        amountCents: subtotal,
        source: 'quote_section',
        sourceRef: opts.quoteNumber ?? null,
      })
      unpriced += numberOf(section.toQuote) ?? 0
    }
  }

  if (takeCredits) lines.push(...creditLines(data.credits))

  return finish({
    engine: 'scope',
    lines,
    documentTotalCents: documentTotalR == null ? null : cents(documentTotalR),
    summary: textOf(data.summary),
    note,
    unpriced,
    standalone: !!accepted,
  })
}

// ── Solar quotes ─────────────────────────────────────────────────────────────

/** The "Quote Summary" table, in the order the customer read it. */
const SOLAR_SECTIONS: Array<{ name: string; field: string }> = [
  { name: 'Panels & Mounting', field: 'panelMountingSubtotal' },
  { name: 'Cables & Connectors', field: 'cablesSubtotal' },
  { name: 'DC Protection', field: 'dcProtectionSubtotal' },
  { name: 'Inverter & Battery System', field: 'inverterBatterySubtotal' },
  { name: 'AC & DB Protection', field: 'acDbSubtotal' },
  { name: 'Earthing System', field: 'earthingSubtotal' },
  { name: 'Consumables & Compliance', field: 'consumablesSubtotal' },
  { name: 'Installation Labour', field: 'labourSubtotal' },
]

function solarConversion(
  data: Record<string, unknown>,
  opts: ConversionOpts,
): QuoteConversion | null {
  const lines: InvoiceLineDraft[] = []
  let unpriced = 0

  const detailed = arrayOf(data.detailedSections)
  if (detailed.length > 0) {
    for (const section of detailed) {
      const name = String(section.name ?? '').trim() || 'Work'
      for (const item of arrayOf(section.lines)) {
        const built = itemisedLine(item, name)
        if (!built) {
          unpriced += 1
          continue
        }
        lines.push(built)
      }
    }
  } else {
    for (const { name, field } of SOLAR_SECTIONS) {
      const amount = randsFromText(data[field])
      // A section priced at nothing was not on the customer's summary table
      // either — a single-phase job has no three-phase DB, and printing an
      // R0,00 line invites a question with no answer.
      if (amount == null || amount === 0) continue
      lines.push({
        description: name,
        detail: solarDetail(name, data),
        qty: 1,
        unit: null,
        unitPriceCents: cents(amount),
        amountCents: cents(amount),
        source: 'quote_section',
        sourceRef: opts.quoteNumber ?? null,
      })
    }
    const evAmount = randsFromText(data.evChargerCost ?? data.evChargerSubtotal)
    if (evAmount) {
      lines.push({
        description: `EV Charger${data.evChargerKw ? ` (${String(data.evChargerKw)})` : ''}`,
        detail: 'Type 2 wallbox, dedicated circuit, cabling and installation.',
        qty: 1,
        unit: null,
        unitPriceCents: cents(evAmount),
        amountCents: cents(evAmount),
        source: 'quote_section',
        sourceRef: opts.quoteNumber ?? null,
      })
    }
  }

  if (lines.length === 0) return null
  lines.push(...creditLines(data.credits))

  const documentTotalR =
    numberOf(data.payableTotalRands) ??
    numberOf(data.quoteTotalRands) ??
    randsFromText(data.payableTotal) ??
    randsFromText(data.quoteTotal)

  return finish({
    engine: 'solar',
    lines,
    documentTotalCents: documentTotalR == null ? null : cents(documentTotalR),
    summary: solarSummary(data),
    note: null,
    unpriced,
    standalone: false,
  })
}

/** What a solar section actually contains, where the document knows. */
function solarDetail(name: string, data: Record<string, unknown>): string | null {
  const text = (key: string) => String(data[key] ?? '').trim()
  switch (name) {
    case 'Panels & Mounting': {
      const parts = [
        text('panelCount') && text('panelModel') && `${text('panelCount')} × ${text('panelModel')}`,
        text('totalKwp') && `${text('totalKwp')}kWp`,
      ].filter(Boolean)
      return parts.length ? `${parts.join(' — ')}. Rails, clamps, hooks and sealing.` : null
    }
    case 'Inverter & Battery System': {
      const inverter = text('inverterModel')
        ? `${text('inverterQty') || '1'} × ${text('inverterModel')}${text('inverterKw') ? ` ${text('inverterKw')}kW` : ''}`
        : ''
      const battery = text('batteryModel')
        ? `${text('batteryQty') || '1'} × ${text('batteryModel')}${text('batteryKwh') ? ` ${text('batteryKwh')}kWh` : ''}`
        : ''
      const parts = [inverter, battery].filter(Boolean)
      return parts.length ? parts.join(', ') : null
    }
    case 'Consumables & Compliance':
      return 'Glands, ferrules, labels, sealant and the Certificate of Compliance.'
    case 'Installation Labour':
      return 'Installation, commissioning and system testing.'
    default:
      return null
  }
}

function solarSummary(data: Record<string, unknown>): string | null {
  const text = (key: string) => String(data[key] ?? '').trim()
  const parts = [
    text('systemType'),
    text('totalKwp') && `${text('totalKwp')}kWp of solar`,
    text('inverterModel') && `${text('inverterModel')} inverter`,
    text('batteryKwh') && `${text('batteryKwh')}kWh of storage`,
  ].filter(Boolean)
  return parts.length >= 2 ? `${parts.join(', ')}.` : null
}

// ── Shared ───────────────────────────────────────────────────────────────────

/** One itemised line off a detailed quote — scope and solar print the same shape. */
function itemisedLine(item: Record<string, unknown>, sectionName: string): InvoiceLineDraft | null {
  const description = String(item.description ?? '').trim()
  const amount = randsFromText(item.amount)
  // 'Quote' in the amount column means the supplier price never came back.
  // There is nothing to bill, and inventing a figure is worse than saying so.
  if (!description || amount == null) return null
  const rawQty = numberOf(item.qty) ?? 1
  const qty = rawQty > 0 ? rawQty : 1
  const unitPrice = randsFromText(item.unit)
  return {
    description,
    detail: sectionName,
    qty,
    unit: null,
    unitPriceCents: unitPrice != null ? cents(unitPrice) : Math.round(cents(amount) / qty),
    amountCents: cents(amount),
    source: 'quote_line',
    sourceRef: null,
  }
}

/** Credits on the quote (migration 126), as the negative lines they are. */
function creditLines(raw: unknown): InvoiceLineDraft[] {
  return arrayOf(raw)
    .map((c): InvoiceLineDraft | null => {
      const amount = randsFromText(c.amount)
      if (amount == null || amount === 0) return null
      const value = cents(-Math.abs(amount))
      return {
        description: String(c.label ?? 'Credit').trim() || 'Credit',
        detail: null,
        qty: 1,
        unit: null,
        unitPriceCents: value,
        amountCents: value,
        source: 'credit' as const,
        sourceRef: null,
      }
    })
    .filter((l): l is InvoiceLineDraft => l !== null)
}

/**
 * Reconcile the lines against the document, then hand them over.
 *
 * The lines have to add up to what the quote says is payable. When they do
 * not, the gap gets its own line rather than being spread, hidden, or left to
 * make the totals disagree — on a standalone package that gap IS the price of
 * taking the work alone, and it is named as such.
 */
function finish(input: {
  engine: 'scope' | 'solar'
  lines: InvoiceLineDraft[]
  documentTotalCents: number | null
  summary: string | null
  note: string | null
  unpriced: number
  standalone: boolean
}): QuoteConversion | null {
  const lines = [...input.lines]
  if (lines.length === 0) return null

  let total = lines.reduce((sum, l) => sum + l.amountCents, 0)
  const notes = input.note ? [input.note] : []

  if (input.documentTotalCents != null && input.documentTotalCents !== total) {
    const gap = input.documentTotalCents - total
    lines.push({
      description: input.standalone
        ? 'Taken on its own — own site visit and certificate'
        : 'Adjustment to the quoted total',
      detail: input.standalone
        ? 'What this package costs bought separately rather than as part of the whole job.'
        : `The lines above come to ${rand(total)}; the quote states ${rand(input.documentTotalCents)}.`,
      qty: 1,
      unit: null,
      unitPriceCents: gap,
      amountCents: gap,
      source: input.standalone ? 'quote_section' : 'manual',
      sourceRef: null,
    })
    total = input.documentTotalCents
    if (!input.standalone) {
      notes.push(
        'The quote total and its lines did not agree, so the difference is on its own line — check it before issuing.',
      )
    }
  }

  if (input.unpriced > 0) {
    notes.push(
      `${input.unpriced} line${input.unpriced === 1 ? '' : 's'} on the quote had no price yet and ${
        input.unpriced === 1 ? 'is' : 'are'
      } not on this invoice.`,
    )
  }

  return {
    engine: input.engine,
    lines,
    totalCents: total,
    documentTotalCents: input.documentTotalCents,
    summary: input.summary,
    note: notes.length ? notes.join(' ') : null,
  }
}

function withNote(conversion: QuoteConversion, note: string | null): QuoteConversion {
  if (!note) return conversion
  return { ...conversion, note: conversion.note ? `${note} ${conversion.note}` : note }
}

// ── Reading a saved document ─────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  let data = value
  if (typeof data === 'string') {
    if (!data.trim()) return null
    try {
      data = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return data as Record<string, unknown>
}

function arrayOf(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v),
  )
}

const numberOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const textOf = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || null
}

const cents = (rands: number): number => Math.round(rands * 100)

const rand = (c: number): string =>
  `R${(c / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * A money field back to rands, whether it arrived as a number or as the string
 * the document printed.
 *
 * The solar document holds only formatted strings, and they are formatted for
 * this country: "R12 345,00" — space between thousands (a non-breaking one,
 * depending on the ICU build), comma before the cents. A naive parseFloat
 * reads that as 12. The minus on a credit is a typographic U+2212, not a
 * hyphen, so that is handled too. Anything with no digits in it — 'Quote', an
 * em dash, an empty cell — is null: not zero, because zero is a price and this
 * is the absence of one.
 */
export function randsFromText(value: unknown): number | null {
  const asNumber = numberOf(value)
  if (asNumber != null) return asNumber
  if (typeof value !== 'string') return null

  const raw = value.trim()
  if (!raw) return null
  const negative = /^[-−–(]/.test(raw)
  const digits = raw.replace(/[^0-9.,]/g, '')
  if (!/[0-9]/.test(digits)) return null

  // Whichever separator comes last is the decimal one — except when exactly
  // three digits follow it, which is grouping ("R1,250" is twelve hundred and
  // fifty rand, not one rand twenty-five).
  const cut = Math.max(digits.lastIndexOf(','), digits.lastIndexOf('.'))
  const normalised =
    cut === -1 || digits.length - cut - 1 === 3
      ? digits.replace(/[.,]/g, '')
      : `${digits.slice(0, cut).replace(/[.,]/g, '')}.${digits.slice(cut + 1)}`

  const parsed = Number(normalised)
  if (!Number.isFinite(parsed)) return null
  return negative ? -parsed : parsed
}
