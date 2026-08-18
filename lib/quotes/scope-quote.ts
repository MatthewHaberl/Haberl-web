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
import type { DesignBom } from '@/lib/solar/design-bom'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import type { EquipmentPhoto } from '@/lib/solar/render-quote'
import {
  bundleSavingR, packageDisplayLabels, packageTotals, qualifiedSectionName, separateTotalR,
  type QuoteScope,
} from './scope'
import { bomForPackage, computeScopeDeposit, stripOptionalLines } from './scope-bom'
import type {
  ScopeQuoteData, ScopeQuotePackageView, ScopeQuoteSectionView, ScopeOptionalExtraView,
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
}

export function buildScopeQuoteData(args: ScopeQuoteArgs): ScopeQuoteData {
  const { scope, bom, req } = args

  // Line-level deposit: material lines only — labour/fees on completion, even
  // when they share a section with materials.
  const deposit = computeScopeDeposit(bom)
  const depositSections = deposit.items.map((i) => i.name)
  const totalR = bom.totalSellR
  const balanceR = round2(totalR - deposit.totalR)

  const sections: ScopeQuoteSectionView[] = bom.sections
    .filter((s) => s.lines.some((l) => !l.optional))
    .map((s) => ({
      name: s.name,
      detail: sectionDetail(s.lines.filter((l) => !l.optional).map((l) => l.description)),
      subtotal: rand(s.sellR),
      subtotalRands: s.sellR,
      toQuote: s.needsPricing,
      deposit: depositSections.includes(s.name),
    }))

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
    optionalExtras,
    exclusions: scope.exclusions.map((e) => e.trim()).filter(Boolean),
    cocIncluded: scope.coc.included,
    quoteTotal: rand(totalR),
    quoteTotalRands: totalR,
    depositTotal: rand(deposit.totalR),
    depositTotalRands: deposit.totalR,
    balanceTotal: rand(balanceR),
    depositItems: deposit.items,
    // Optional extras never reach procurement/job materials.
    supplierBom: bomToSupplierBom(stripOptionalLines(bom)),
    equipmentPhotos: args.showEquipmentPhotos === false
      ? [] : equipmentPhotosFromScope(args.scope, args.catalog),
    needsPricing: bom.needsPricing,
  }
}
