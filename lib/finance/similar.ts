// Near-duplicate detection for financial documents — catches the case where a
// pro forma and the final invoice (for the same purchase, maybe a line or two
// changed) both get billed to a customer, which would double-charge them.
//
// Two documents are "similar" when they share a customer OR a supplier, sit
// within a few days of each other, and have totals within a tolerance. Used by
// both the document-page warning and the Possible duplicates review list.

export interface DocLike {
  id: string
  doc_type: string
  supplier_name: string | null
  customer_id: string | null
  doc_date: string | null
  total_cents: number | null
  file_name?: string | null
}

export const SIMILAR_DATE_DAYS = 14
// totals must be within ~15% of each other (the smaller ≥ 85% of the larger)
export const SIMILAR_TOTAL_RATIO = 0.85

function dayGap(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
}

/** True when two documents look like the same underlying purchase. */
export function isSimilarPair(a: DocLike, b: DocLike): boolean {
  if (a.id === b.id) return false
  // Statements aren't bills, so never compare them.
  if (a.doc_type === 'bank_statement' || b.doc_type === 'bank_statement') return false

  const sameCustomer = !!a.customer_id && a.customer_id === b.customer_id
  const sameSupplier = !!a.supplier_name && !!b.supplier_name
    && a.supplier_name.trim().toLowerCase() === b.supplier_name.trim().toLowerCase()
  if (!sameCustomer && !sameSupplier) return false

  if (!a.doc_date || !b.doc_date) return false
  if (dayGap(a.doc_date, b.doc_date) > SIMILAR_DATE_DAYS) return false

  if (!a.total_cents || !b.total_cents) return false
  const ratio = Math.min(a.total_cents, b.total_cents) / Math.max(a.total_cents, b.total_cents)
  return ratio >= SIMILAR_TOTAL_RATIO
}

/** All other documents that look like the same purchase as `target`. */
export function findSimilarTo<T extends DocLike>(target: DocLike, pool: T[]): T[] {
  return pool.filter((d) => isSimilarPair(target, d))
}

/** Unordered unique pairs of similar documents across a pool (for the review list). */
export function findSimilarPairs<T extends DocLike>(pool: T[]): [T, T][] {
  const pairs: [T, T][] = []
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      if (isSimilarPair(pool[i], pool[j])) pairs.push([pool[i], pool[j]])
    }
  }
  return pairs
}
