// ─────────────────────────────────────────────────────────────────────────────
// Scope pre-flight — what has to be true before a scope quote can become a
// document, and what is merely worth knowing first.
//
// The scope builder autosaves, so there is no submit to validate on. The gate
// is Generate, and this module is what it gates on. One validator, three
// callers:
//
//   ScopeWorkspace         live panel + red fields in the builder
//   priceQuoteRequest      the hard refusal (generate route AND /q/preview)
//
// BLOCKERS are things that would silently produce a wrong document — a line
// billed with no description, or a line the renderer drops on the floor.
// WARNINGS are things that are legal but usually a mistake, and stay visible
// without stopping anyone: the person quoting knows their own job.
//
// Pure module — no Supabase, no React; safe on server and client.
// ─────────────────────────────────────────────────────────────────────────────

import {
  bundleSavingR, duplicatesAcrossPackages, labourAmountR, packageLines, packageTotals,
  scopeTotals, separateTotalR, type QuoteScope, type ScopeLine,
} from './scope'

export type ScopeIssueLevel = 'blocker' | 'warning'

export interface ScopeIssue {
  /** Stable, unique — React key and nothing else. */
  id: string
  level: ScopeIssueLevel
  /** Full sentence. Read by a person in the builder and by the API caller. */
  message: string
  /** Value of the data-issue-anchor attribute this issue scrolls to. */
  anchor: string
  /** Set on line-level issues so the row can ring the offending field. */
  lineId?: string
  field?: 'description' | 'qty'
}

/** Where a line sits, said the way a person would say it. */
function lineLabel(line: ScopeLine, indexInSection: number): string {
  const where = line.section ? ` in “${line.section}”` : ''
  const named = line.description.trim() || line.sku.trim()
  return named ? `“${named}”${where}` : `Line ${indexInSection + 1}${where}`
}

/**
 * Every problem with a scope, blockers first. Order is the order the builder
 * lists them in, and the first one is what Generate scrolls to.
 */
export function validateScope(scope: QuoteScope): ScopeIssue[] {
  const blockers: ScopeIssue[] = []
  const warnings: ScopeIssue[] = []

  const totals = scopeTotals(scope)

  // Nothing to sell and nothing to price. Note a call-out-only job is a real
  // quote (labour prices it), so this fires on genuinely empty scopes only.
  if (totals.sellR <= 0 && totals.needsPricing === 0) {
    blockers.push({
      id: 'nothing-billable',
      level: 'blocker',
      anchor: 'sections',
      message: 'Nothing on this quote yet — add line items, or price the labour.',
    })
  }

  // Per-line. Counted within the section so "Line 2" means what it looks like.
  const seenInSection = new Map<string, number>()
  for (const line of scope.lines) {
    const n = seenInSection.get(line.section) ?? 0
    seenInSection.set(line.section, n + 1)
    const label = lineLabel(line, n)

    // A catalog line without a description is fine — scopeToBom fills it from
    // the catalog at generate. A free-text one is billed as a blank row.
    if (!line.catalogId && !line.description.trim()) {
      blockers.push({
        id: `line:${line.id}:description`,
        level: 'blocker',
        anchor: `line:${line.id}`,
        lineId: line.id,
        field: 'description',
        message: `${label} has no description — the customer would be billed for a blank row.`,
      })
    }

    // scopeToBom skips qty <= 0 outright, so this line would not appear on the
    // quote at all and the total would quietly be short by its value.
    if (line.qty <= 0) {
      blockers.push({
        id: `line:${line.id}:qty`,
        level: 'blocker',
        anchor: `line:${line.id}`,
        lineId: line.id,
        field: 'qty',
        message: `${label} has no quantity — it would be dropped from the quote entirely.`,
      })
    }
  }

  // Sections carrying no lines never reach the document. Not worth saying on a
  // quote nobody has started — every scope quote opens with its work type's
  // sections seeded and empty, and five warnings on first open is just noise.
  const withLines = new Set(scope.lines.map((l) => l.section))
  for (const name of scope.lines.length === 0 ? [] : scope.sections) {
    if (withLines.has(name)) continue
    warnings.push({
      id: `section:${name}`,
      level: 'warning',
      anchor: `section:${name}`,
      message: `“${name}” has no lines — it won’t appear on the customer’s quote.`,
    })
  }

  // Unpriced lines are a supported shape ("to be priced separately"), not an
  // error — but they add nothing to the total, so say so once.
  const unpriced = scope.lines.filter(
    (l) => !l.optional && l.qty > 0 && l.unitSellR <= 0,
  ).length
  if (unpriced > 0) {
    warnings.push({
      id: 'unpriced-lines',
      level: 'warning',
      anchor: 'sections',
      message: unpriced === 1
        ? 'One line has no price — it reads “Quote” on the document and adds nothing to the total.'
        : `${unpriced} lines have no price — they read “Quote” on the document and add nothing to the total.`,
    })
  }

  if (labourAmountR(scope.labour) <= 0) {
    const mode = scope.labour.mode
    warnings.push({
      id: 'labour-zero',
      level: 'warning',
      anchor: 'labour',
      message:
        mode === 'daily' ? 'Day rate is selected but no days are set — the quote carries no labour.'
        : mode === 'fixed' ? 'Fixed-price labour is R0 — the quote carries no labour.'
        : mode === 'crew' ? 'Crew pricing is selected but nobody on it bills anything — the quote carries no labour.'
        : 'Labour is R0 — no call-out and no hours. Materials only?',
    })
  }

  if (scope.labour.mode === 'crew') {
    const noHours = scope.labour.crew.filter((c) => c.qty <= 0).length
    if (noHours > 0) {
      warnings.push({
        id: 'crew-no-qty',
        level: 'warning',
        anchor: 'labour',
        message: noHours === 1
          ? 'One crew member has no hours on them — they bill R0.'
          : `${noHours} crew members have no hours on them — they bill R0.`,
      })
    }
  }

  // A combined quote describes itself package by package, so the quote-level
  // paragraph is an optional intro there rather than the only description —
  // worth asking for only when a package is silent too.
  const packagesDescribeThemselves =
    scope.packages.length > 0 && scope.packages.every((p) => p.summary.trim())
  if (!scope.summary.trim() && !packagesDescribeThemselves) {
    warnings.push({
      id: 'no-summary',
      level: 'warning',
      anchor: 'summary',
      message: scope.packages.length > 0
        ? 'No description of the work — give the quote an opening line, or describe each package.'
        : 'No scope of works — the customer gets prices with no description of the job.',
    })
  }

  // ── Work packages ──────────────────────────────────────────────────────────
  // Only on quotes that have them; a single-package quote is silent here.
  if (scope.packages.length > 0) {
    // A package with no name reads as "Package 2" on the customer's document.
    for (const [i, pkg] of scope.packages.entries()) {
      if (pkg.label.trim()) continue
      warnings.push({
        id: `package:${pkg.id}:label`,
        level: 'warning',
        anchor: `package:${pkg.id}`,
        message: `Package ${i + 1} has no name — the customer would see it called “Package ${i + 1}”.`,
      })
    }

    // An empty package prices at its own call-out and nothing else: the
    // customer is quoted money for a job with no work on it.
    for (const pkg of scope.packages) {
      if (packageLines(scope, pkg.id).length > 0) continue
      warnings.push({
        id: `package:${pkg.id}:empty`,
        level: 'warning',
        anchor: `package:${pkg.id}`,
        message: `“${pkg.label.trim() || 'Untitled package'}” has no line items — it would be priced with nothing in it.`,
      })
    }

    // Lines belonging to no package are billed by the bundle but appear under
    // no heading a customer can buy, so the separate prices don't add up to it.
    const loose = packageLines(scope, null).filter((l) => l.qty > 0)
    if (loose.length > 0) {
      warnings.push({
        id: 'lines-outside-packages',
        level: 'warning',
        anchor: 'sections',
        message: loose.length === 1
          ? 'One line sits outside every package — it is in the combined price but in none of the individual ones.'
          : `${loose.length} lines sit outside every package — they are in the combined price but in none of the individual ones.`,
      })
    }

    // The same item under two packages. Never merged (two packages can each
    // genuinely need one) but always worth a second look before it is sent.
    for (const dupe of duplicatesAcrossPackages(scope)) {
      const where = dupe.perPackage.map((p) => `${p.label} (${p.qty})`).join(', ')
      warnings.push({
        id: `duplicate:${dupe.key}`,
        level: 'warning',
        anchor: 'sections',
        message: `“${dupe.description}” is on more than one package — ${where}. Correct if each job needs its own; otherwise drop one.`,
      })
    }

    // A package priced at nothing at all can't be sold on its own.
    for (const pkg of scope.packages) {
      const totals = packageTotals(scope, pkg)
      if (totals.sellR > 0 || totals.needsPricing > 0 || packageLines(scope, pkg.id).length === 0) continue
      warnings.push({
        id: `package:${pkg.id}:free`,
        level: 'warning',
        anchor: `package:${pkg.id}`,
        message: `“${pkg.label.trim() || 'Untitled package'}” prices at R0 on its own — it has lines but nothing billable.`,
      })
    }

    // The whole point of the combined quote is that taking everything is
    // cheaper. If it isn't, the document has nothing to offer and says so.
    if (scope.packages.length > 1 && separateTotalR(scope) > 0 && bundleSavingR(scope) <= 0) {
      warnings.push({
        id: 'no-bundle-saving',
        level: 'warning',
        anchor: 'labour',
        message:
          'Taking everything together costs the same or more than buying each package separately — there is no saving to show. Reduce the combined labour to the visit you would actually do.',
      })
    }
  }

  return [...blockers, ...warnings]
}

export function scopeBlockers(scope: QuoteScope): ScopeIssue[] {
  return validateScope(scope).filter((i) => i.level === 'blocker')
}

/**
 * One sentence a route (or a status bar) can hand straight to a person. Null
 * when the scope is generatable.
 */
export function scopeBlockerMessage(scope: QuoteScope): string | null {
  const blockers = scopeBlockers(scope)
  if (blockers.length === 0) return null
  if (blockers.length === 1) return blockers[0].message
  const shown = blockers.slice(0, 3).map((b) => b.message).join(' ')
  const rest = blockers.length - 3
  return `This quote can’t be generated yet. ${shown}${rest > 0 ? ` And ${rest} more.` : ''}`
}
