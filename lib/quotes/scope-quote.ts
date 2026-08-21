// ─────────────────────────────────────────────────────────────────────────────
// scope-quote — the bridge from a QuoteScope to a sendable quote (W97).
//
// The scope sibling of lib/solar/design-quote.ts:
//
//   QuoteScope + DesignBom ──▶ ScopeQuoteData ──▶ renderScopeQuote() HTML
//                           ├─▶ SupplierBomItem[]  (bom_snapshot → job materials)
//                           └─▶ DepositItem[]      (deposit by line items, not %)
//
// Pure module — no Supabase, no React; safe on server and client.
// ─────────────────────────────────────────────────────────────────────────────

import { bomToSupplierBom } from '@/lib/solar/design-quote'
import type { BomLine, DesignBom } from '@/lib/solar/design-bom'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import type { EquipmentPhoto } from '@/lib/solar/render-quote'
import {
  bundleSavingR, packageDisplayLabels, packageTotals, qualifiedSectionName, separateTotalR,
  type QuoteScope,
} from './scope'
import { bomForPackage, computeScopeDeposit, stripOptionalLines } from './scope-bom'
import { applyCredits, creditViews, type QuoteCredit } from './credits'
import {
  bomSellExVatR, lineSellExVatR, lineSupplierExVat, sectionSellExVatR,
  type PricingDisclosure,
} from './quote-cost'
import type {
  ScopeQuoteData, ScopeQuoteLineView, ScopeQuotePackageView, ScopeQuoteSectionView,
  ScopeOptionalExtraView,
} from './render-scope-quote'

const round2 = (n: number) => Math.round(n * 100) / 100

function rand(n: number): string {
  return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dateZA(d: Date): string {
  return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** One-line customer-facing summary of a section — item names, never prices. */
function sectionDetail(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean)
  if (clean.length === 0) return ''
  const shown = clean.slice(0, 3)
  const more = clean.length - shown.length
  const detail = shown.join(' · ') + (more > 0 ? ` · +${more} more` : '')
  return detail.length > 160 ? `${detail.slice(0, 157)}…` : detail
}

/**
 * Product photos for the "What You're Getting" panel — catalog-backed material
 * lines that have an image. Scope equivalent of equipmentPhotosFromDesign.
 */
export function equipmentPhotosFromScope(
  scope: QuoteScope,
  catalog: Map<string, EquipmentCatalogItem>,
): EquipmentPhoto[] {
  const photos: EquipmentPhoto[] = []
  const seen = new Set<string>()
  for (const line of scope.lines) {
    if (line.optional || line.qty <= 0 || !line.catalogId) continue
    const item = catalog.get(line.catalogId)
    if (!item) continue
    const url = (item.primary_image_url ?? '').trim() ||
      (item.gallery_image_urls ?? []).find((u) => u && u.trim())?.trim() || ''
    if (!url || seen.has(url)) continue
    seen.add(url)
    photos.push({
      label: line.section || 'Materials',
      model: line.description.trim() || item.description || item.sku,
      imageUrl: url,
    })
    if (photos.length >= 6) break
  }
  return photos
}

/**
 * A section's line items for a DETAILED quote — what the customer is actually
 * paying for, one row at a time.
 *
 * Sell prices only. The unit price is what it costs them per item, never our
 * cost or the markup that produced it, and an unpriced line says "Quote" rather
 * than a zero — the same word the section subtotal uses for it.
 */
function lineViews(lines: BomLine[], disclosure: PricingDisclosure): ScopeQuoteLineView[] {
  return lines
    .filter((l) => !l.optional)
    .map((l) => {
      // Open book: the supplier's own ex-VAT price for one, and what we add on
      // top. Only ever built when the quote was set to show it.
      const supplier = disclosure === 'open_book' ? lineSupplierExVat(l) : null
      return {
        description: l.description.trim() || l.sku || 'Item',
        qty: l.qty,
        // A single item's unit price is its line total — printing both says the
        // same number twice.
        unit: l.priced && l.qty !== 1 ? rand(l.unitSellR) : '',
        amount: l.priced ? rand(l.lineSellR) : 'Quote',
        ...(disclosure && l.priced ? { amountExVat: rand(lineSellExVatR(l)) } : {}),
        ...(supplier
          ? {
              supplier: `Supplier ${rand(supplier.unitExVatR)} excl. VAT each`
                + ` · we add ${supplier.markupPct.toFixed(1)}%`,
            }
          : {}),
      }
    })
}

export interface ScopeQuoteArgs {
  scope: QuoteScope
  /** From scopeToBom — optional lines still present. */
  bom: DesignBom
  catalog: Map<string, EquipmentCatalogItem>
  req: {
    customer_name?: string | null
    customer_phone?: string | null
    customer_email?: string | null
    address?: string | null
    municipality?: string | null
  }
  quoteNumber: string
  expiryDays: number
  workType: string
  workTypeLabel: string
  /** Print the "What You're Getting" photo panel. Default on. */
  showEquipmentPhotos?: boolean
  /**
   * Detailed quote: print every line item with its quantity and price under
   * its section. Default off — Matthew's rule is simplified unless asked.
   */
  showLineItems?: boolean
  /**
   * May the customer accept one work package on its own? Default true; false
   * takes the standalone prices and the options table off the document.
   */
  allowPartial?: boolean
  /**
   * Money already owed to this customer, taken off the bottom of the quote
   * (migration 126). Never touches a section subtotal or the BOM — the
   * sections still add up to the price of the work.
   */
  credits?: QuoteCredit[]
  /**
   * How much of the pricing the customer is shown (migration 131). Default
   * null — prices only, which is every quote sent before this existed and
   * still the document almost every customer should get.
   */
  pricingDisclosure?: PricingDisclosure
}

export function buildScopeQuoteData(args: ScopeQuoteArgs): ScopeQuoteData {
  const { scope, bom, req } = args

  // Line-level deposit: material lines only — labour/fees on completion, even
  // when they share a section with materials.
  const deposit = computeScopeDeposit(bom)
  const depositSections = deposit.items.map((i) => i.name)
  const totalR = bom.totalSellR
  // Credits come off AFTER the BOM, which is what keeps every section subtotal
  // honest about the price of the work. With none, `money` returns the same
  // deposit and balance this function has always produced.
  const credits = args.credits ?? []
  const money = applyCredits(totalR, deposit.totalR, credits)
  const balanceR = money.balanceR
  // Ex-VAT twins of the same three figures (migration 131). Only the deposit
  // can shed the full 15%, because computeScopeDeposit bills material lines
  // and nothing else. A credit is money owed back rather than a price, so it
  // comes off both columns unchanged — which is what makes deposit + balance
  // still add up to the payable total in the ex-VAT column too.
  const totalExVatR = bomSellExVatR(bom)
  const creditsOffDepositR = round2(deposit.totalR - money.depositR)
  const depositExVatR = round2(deposit.totalExVatR - creditsOffDepositR)
  const payableExVatR = round2(totalExVatR - money.appliedR)

  // Absent (not zero) unless the quote states ex-VAT figures, so a quote sent
  // without the setting renders exactly the document it always has — which is
  // what the golden file pins and what every already-sent quote must keep.
  const disclosure = args.pricingDisclosure ?? null

  const sections: ScopeQuoteSectionView[] = bom.sections
    .filter((s) => s.lines.some((l) => !l.optional))
    .map((s) => {
      const exVatR2 = disclosure ? sectionSellExVatR(s) : 0
      return {
        name: s.name,
        detail: sectionDetail(s.lines.filter((l) => !l.optional).map((l) => l.description)),
        subtotal: rand(s.sellR),
        subtotalRands: s.sellR,
        toQuote: s.needsPricing,
        deposit: depositSections.includes(s.name),
        ...(args.showLineItems ? { lines: lineViews(s.lines, disclosure) } : {}),
        ...(disclosure ? { subtotalExVat: rand(exVatR2), subtotalExVatRands: exVatR2 } : {}),
      }
    })

  // Work packages: each one's sections, and its own price bought alone. The
  // BOM already carries the package a section belongs to, so this is a regroup
  // rather than a second walk of the scope.
  // Keyed by section NAME, not by index: `sections` above drops any section
  // holding nothing but optional extras, so the two arrays do not line up.
  // Names are unique across the BOM precisely because the package qualifies
  // them (see qualifiedSectionName), which is what makes this lookup safe.
  const packageOfSection = new Map(bom.sections.map((s) => [s.name, s.package]))
  const byPackage = new Map<string, ScopeQuoteSectionView[]>()
  const sharedSections: ScopeQuoteSectionView[] = []
  for (const view of sections) {
    const label = packageOfSection.get(view.name)
    if (!label) { sharedSections.push(view); continue }
    const list = byPackage.get(label) ?? []
    list.push(view)
    byPackage.set(label, list)
  }

  const labels = packageDisplayLabels(scope)
  const packages: ScopeQuotePackageView[] = scope.packages.map((pkg) => {
    const name = labels.get(pkg.id) ?? 'Package'
    const own = packageTotals(scope, pkg).sellR
    // This package's own slice of the BOM — what a single-package acceptance
    // buys, deposits on, and seeds job materials from.
    const ownBom = bomForPackage(bom, name)
    const ownDeposit = computeScopeDeposit(ownBom)
    return {
      id: pkg.id,
      name,
      summary: pkg.summary.trim(),
      sections: byPackage.get(name) ?? [],
      ownTotal: rand(own),
      ownTotalRands: own,
      // The standalone price with no VAT in it. `own` is priced from the scope
      // (its own visit, its own certificate), so the VAT is taken out by
      // subtracting what sits inside ITS materials — never by dividing a total
      // that is mostly labour.
      ...(disclosure
        ? { ownTotalExVat: rand(round2(own - (ownBom.totalSellR - bomSellExVatR(ownBom)))) }
        : {}),
      depositItems: ownDeposit.items,
      depositTotalRands: ownDeposit.totalR,
      supplierBom: bomToSupplierBom(stripOptionalLines(ownBom)),
    }
  })
  const separateR = scope.packages.length > 0 ? separateTotalR(scope) : 0
  const savingR = scope.packages.length > 0 ? bundleSavingR(scope) : 0

  // Sections the customer could actually ask us to leave out: the ones they
  // wrote. Labour and Compliance are appended by the BOM and follow whatever
  // work survives — they were never a choice, so a quote whose only "second
  // section" is Labour has nothing to choose between and says nothing.
  const authoredNames = new Set<string>([
    ...scope.sections,
    ...scope.packages.flatMap((pkg) =>
      pkg.sections.map((n) => qualifiedSectionName(labels.get(pkg.id) ?? '', n))),
  ])
  const chooseableSections = sections.filter((s) => authoredNames.has(s.name)).length

  const optionalExtras: ScopeOptionalExtraView[] = bom.sections
    .flatMap((s) => s.lines)
    .filter((l) => l.optional)
    .map((l) => ({
      description: l.description || l.sku || 'Optional item',
      qty: l.qty,
      amount: l.priced ? rand(l.lineSellR) : 'Quote',
    }))

  const issued = new Date()
  const expires = new Date(issued.getTime() + args.expiryDays * 86_400_000)

  return {
    type: 'scope',
    workType: args.workType,
    workTypeLabel: args.workTypeLabel,
    quoteNumber: args.quoteNumber,
    dateIssued: dateZA(issued),
    dateExpires: dateZA(expires),
    customerName: req.customer_name ?? '',
    municipality: req.municipality ?? '',
    customerPhone: req.customer_phone ?? '—',
    customerEmail: req.customer_email ?? '—',
    siteAddress: req.address ?? '—',
    summary: scope.summary,
    sections,
    chooseableSections,
    packages,
    sharedSections,
    separateTotal: rand(separateR),
    separateTotalRands: separateR,
    bundleSaving: rand(savingR),
    bundleSavingRands: savingR,
    allowPartial: args.allowPartial !== false,
    optionalExtras,
    exclusions: scope.exclusions.map((e) => e.trim()).filter(Boolean),
    cocIncluded: scope.coc.included,
    quoteTotal: rand(totalR),
    quoteTotalRands: totalR,
    // Every headline figure restated with no VAT in it. The deposit is
    // material lines only (see computeScopeDeposit), so it sheds the full 15%;
    // the balance is what is left of the ex-VAT total after it, which is where
    // the labour that never carried VAT ends up. Credits are money owed back,
    // not a price, so they come off both columns unchanged.
    ...(disclosure
      ? {
          pricingDisclosure: disclosure,
          quoteTotalExVat: rand(totalExVatR),
          depositTotalExVat: rand(depositExVatR),
          balanceTotalExVat: rand(round2(payableExVatR - depositExVatR)),
          ...(credits.length > 0 ? { payableTotalExVat: rand(payableExVatR) } : {}),
        }
      : {}),
    // Absent (not empty) with no credits, so the document, the golden file and
    // every quote generated before this existed are byte-identical.
    ...(credits.length > 0
      ? {
          credits: creditViews(credits, money.appliedR),
          payableTotal: rand(money.payableR),
          payableTotalRands: money.payableR,
        }
      : {}),
    depositTotal: rand(money.depositR),
    depositTotalRands: money.depositR,
    balanceTotal: rand(balanceR),
    depositItems: deposit.items,
    // Optional extras never reach procurement/job materials.
    supplierBom: bomToSupplierBom(stripOptionalLines(bom)),
    equipmentPhotos: args.showEquipmentPhotos === false
      ? [] : equipmentPhotosFromScope(args.scope, args.catalog),
    needsPricing: bom.needsPricing,
  }
}
