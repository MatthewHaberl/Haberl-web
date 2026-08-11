// ─────────────────────────────────────────────────────────────────────────────
// scopeToBom — the scope engine's counterpart to designToBom (W97).
//
// Turns a QuoteScope into the SAME DesignBom shape the solar canvas emits.
// That single constraint is what keeps everything downstream of the BOM
// (computeDeposit → bom_snapshot → quote_html → send → accept → job materials
// → PO → finance) shared between the two engines.
//
// Pricing rules:
//   - a line with a catalogId prices from the catalog at cost × markup;
//     a manual unitSellR wins when sellOverridden
//   - a free-text line with no price → priced:false / status:'no-product' —
//     it renders as a "Quote" line exactly like the solar path. Never invent
//     prices.
//   - labour and CoC become generated lines (sell-only, cost == sell — same
//     convention as the solar Labour section)
//   - optional:true lines are carried in the BOM but excluded from section and
//     grand totals; strip them (stripOptionalLines) before bom_snapshot so job
//     materials never seed from extras the customer didn't buy.
//
// Pure module — no Supabase, no React.
// ─────────────────────────────────────────────────────────────────────────────

import type { BomLine, BomSection, DesignBom } from '@/lib/solar/design-bom'
import type { EquipmentCatalogItem, PricingSettings } from '@/lib/solar/quote-calculator'
import { labourAmountR, type QuoteScope, type ScopeLine } from './scope'

const round2 = (n: number) => Math.round(n * 100) / 100

const LABOUR_SECTION = 'Labour'
const COMPLIANCE_SECTION = 'Compliance'

function unpricedLine(
  line: Pick<BomLine, 'section' | 'catalogId' | 'sku' | 'description' | 'qty' | 'optional' | 'kind'>,
  status: BomLine['status'],
): BomLine {
  return {
    ...line,
    unitCostR: 0,
    unitSellR: 0,
    lineCostR: 0,
    lineSellR: 0,
    priced: false,
    status,
  }
}

interface PricedResult {
  line: BomLine
  missing: boolean
}

function priceScopeLine(
  line: ScopeLine,
  catalog: Map<string, EquipmentCatalogItem>,
  markup: number,
): PricedResult {
  const optional = line.optional ? true : undefined
  const base = {
    section: line.section,
    catalogId: line.catalogId ?? `scope:${line.id}`,
    sku: line.sku,
    description: line.description,
    qty: line.qty,
    optional,
    kind: line.kind,
  }

  // Labour/fee lines are sell-only: cost == sell, no markup (the solar Labour
  // section uses the same convention, so costing views stay consistent).
  if (line.kind !== 'material') {
    const amt = round2(line.unitSellR)
    if (amt <= 0) return { line: unpricedLine(base, 'no-product'), missing: false }
    return {
      line: {
        ...base,
        unitCostR: amt,
        unitSellR: amt,
        lineCostR: round2(amt * line.qty),
        lineSellR: round2(amt * line.qty),
        priced: true,
        status: 'ok',
      },
      missing: false,
    }
  }

  if (line.catalogId) {
    const item = catalog.get(line.catalogId)
    if (!item) {
      // Product vanished from the catalog — force a re-pick rather than trusting
      // a stale price. Same policy as the solar path.
      return {
        line: unpricedLine({ ...base, description: line.description ? `${line.description} (product not in catalog)` : '(product not in catalog)' }, 'product-missing'),
        missing: true,
      }
    }
    const unitCost = item.cost_rands > 0 ? round2(item.cost_rands) : 0
    const unitSell = line.sellOverridden && line.unitSellR > 0
      ? round2(line.unitSellR)
      : round2(unitCost * markup)
    if (unitSell <= 0) {
      return {
        line: unpricedLine({ ...base, sku: line.sku || item.sku, description: line.description || item.description }, 'no-cost'),
        missing: false,
      }
    }
    return {
      line: {
        ...base,
        sku: line.sku || item.sku,
        description: line.description || item.description,
        unitCostR: unitCost,
        unitSellR: unitSell,
        lineCostR: round2(unitCost * line.qty),
        lineSellR: round2(unitSell * line.qty),
        priced: true,
        status: 'ok',
      },
      missing: false,
    }
  }

  // Free-text material line: a typed price stands; no price → "Quote" line.
  if (line.unitSellR > 0) {
    const unitCost = round2(Math.max(line.unitCostR, 0))
    const unitSell = round2(line.unitSellR)
    return {
      line: {
        ...base,
        unitCostR: unitCost,
        unitSellR: unitSell,
        lineCostR: round2(unitCost * line.qty),
        lineSellR: round2(unitSell * line.qty),
        priced: true,
        status: 'ok',
      },
      missing: false,
    }
  }
  return { line: unpricedLine(base, 'no-product'), missing: false }
}

function labourDescription(scope: QuoteScope): string {
  const typed = scope.labour.description.trim()
  if (typed) return typed
  if (scope.labour.mode === 'fixed') return 'Labour — fixed price'
  const parts: string[] = []
  if (scope.labour.calloutR > 0) parts.push('call-out')
  if (scope.labour.hours > 0) parts.push(`${scope.labour.hours} hr @ R${scope.labour.rateR}/hr`)
  return parts.length ? `Labour — ${parts.join(' + ')}` : 'Labour'
}

/**
 * Signature mirrors designToBom(design, catalog, markup, opts).
 */
export function scopeToBom(
  scope: QuoteScope,
  catalog: Map<string, EquipmentCatalogItem>,
  markup: number,
  opts: { pricing?: PricingSettings } = {},
): DesignBom {
  const sectionOrder: string[] = [...scope.sections]
  const linesBySection = new Map<string, BomLine[]>()
  let missing = 0

  const push = (line: BomLine) => {
    const section = line.section || 'Scope of work'
    if (!sectionOrder.includes(section)) sectionOrder.push(section)
    const list = linesBySection.get(section) ?? []
    list.push({ ...line, section })
    linesBySection.set(section, list)
  }

  for (const line of scope.lines) {
    if (line.qty <= 0) continue
    const { line: priced, missing: isMissing } = priceScopeLine(line, catalog, markup)
    if (isMissing) missing += 1
    push(priced)
  }

  // Labour — one generated line (hourly: call-out + hours × rate; fixed: the
  // typed amount).
  const labourR = labourAmountR(scope.labour)
  if (labourR > 0) {
    push({
      section: LABOUR_SECTION,
      catalogId: `labour:${labourDescription(scope)}`,
      sku: '',
      description: labourDescription(scope),
      qty: 1,
      unitCostR: labourR,
      unitSellR: labourR,
      lineCostR: labourR,
      lineSellR: labourR,
      priced: true,
      status: 'ok',
      kind: 'labour',
    })
  }

  // Certificate of Compliance — bills exactly the scope's fee. An explicit R0
  // stays R0 (the builder preview treats it that way, and "included at no
  // charge" must not silently re-bill the company default — the default is
  // seeded into coc.feeR by emptyScope/the workspace instead).
  if (scope.coc.included && scope.coc.feeR > 0) {
    const feeR = round2(scope.coc.feeR)
    push({
      section: COMPLIANCE_SECTION,
      catalogId: 'labour:Certificate of Compliance (CoC)',
      sku: '',
      description: 'Certificate of Compliance (CoC)',
      qty: 1,
      unitCostR: feeR,
      unitSellR: feeR,
      lineCostR: feeR,
      lineSellR: feeR,
      priced: true,
      status: 'ok',
      kind: 'fee',
    })
  }

  const sections: BomSection[] = []
  const emitted = new Set<string>()
  for (const name of sectionOrder) {
    // Duplicate names in scope.sections (bad jsonb) must not emit the same
    // lines twice — that would double the total and the deposit.
    if (emitted.has(name)) continue
    emitted.add(name)
    const lines = linesBySection.get(name)
    if (!lines?.length) continue
    // Optional extras ride along in the section but contribute R0 to the sums —
    // same posture as unpriced lines on the solar path. needsPricing also skips
    // them: an unpriced optional extra is not blocking the quote.
    const counted = lines.filter((l) => !l.optional)
    sections.push({
      name,
      lines,
      costR: round2(counted.reduce((t, l) => t + l.lineCostR, 0)),
      sellR: round2(counted.reduce((t, l) => t + l.lineSellR, 0)),
      needsPricing: counted.filter((l) => !l.priced).length,
    })
  }

  return {
    sections,
    totalCostR: round2(sections.reduce((t, s) => t + s.costR, 0)),
    totalSellR: round2(sections.reduce((t, s) => t + s.sellR, 0)),
    missing,
    needsPricing: sections.reduce((t, s) => t + s.needsPricing, 0),
  }
}

/**
 * Deposit for a scope quote, at LINE granularity: material lines bill a
 * deposit; labour and fee lines (typed or generated) are payable on
 * completion, even when they share a section with materials. This is the
 * locked deposit-by-line-items rule — a section-level sum would drag the
 * generated Labour/CoC lines into the deposit whenever a material line lands
 * in the default 'Labour'/'Compliance' sections.
 */
export function computeScopeDeposit(bom: DesignBom): { items: { name: string; amountRands: number }[]; totalR: number } {
  const items: { name: string; amountRands: number }[] = []
  for (const s of bom.sections) {
    const depositR = round2(
      s.lines
        .filter((l) => l.kind === 'material' && !l.optional && l.priced)
        .reduce((t, l) => t + l.lineSellR, 0),
    )
    if (depositR > 0) items.push({ name: s.name, amountRands: depositR })
  }
  return { items, totalR: round2(items.reduce((t, i) => t + i.amountRands, 0)) }
}

/**
 * Remove optional-extra lines (and any section left empty). Used before
 * bom_snapshot/job-materials seeding so procurement never orders an extra the
 * customer didn't take. Totals are recomputed but unchanged by construction —
 * optional lines never counted toward them.
 */
export function stripOptionalLines(bom: DesignBom): DesignBom {
  const sections: BomSection[] = []
  for (const s of bom.sections) {
    const lines = s.lines.filter((l) => !l.optional)
    if (!lines.length) continue
    sections.push({
      name: s.name,
      lines,
      costR: round2(lines.reduce((t, l) => t + l.lineCostR, 0)),
      sellR: round2(lines.reduce((t, l) => t + l.lineSellR, 0)),
      needsPricing: lines.filter((l) => !l.priced).length,
    })
  }
  return {
    sections,
    totalCostR: round2(sections.reduce((t, s) => t + s.costR, 0)),
    totalSellR: round2(sections.reduce((t, s) => t + s.sellR, 0)),
    missing: bom.missing,
    needsPricing: sections.reduce((t, s) => t + s.needsPricing, 0),
  }
}
