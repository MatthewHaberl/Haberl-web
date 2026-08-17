import type { PostgrestError } from '@supabase/supabase-js'

// PostgREST (Supabase) caps a single select at ~1000 rows. Any query expected to
// return more than that silently drops the overflow. Page through with `.range()`
// until a short page comes back, so the full result set is returned regardless of size.
const PAGE_SIZE = 1000

/**
 * Page through a Supabase select to bypass the ~1000-row response cap.
 *
 * Pass a factory that builds the query and applies `.range(from, to)` — all other
 * filters/orders are yours to set. Works with both the browser and server clients.
 *
 * @example
 *   const { data, error } = await fetchAllRows<EquipmentCatalogItem>((from, to) =>
 *     supabase.from('equipment_catalog').select('*').eq('active', true).order('brand').range(from, to)
 *   )
 */
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1)
    if (error) return { data: rows, error }
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }
  return { data: rows, error: null }
}

/**
 * Same contract as `fetchAllRows`, but fetches pages in concurrent batches instead
 * of one at a time. For a table the size of the equipment catalog (~15k rows = 15
 * pages) sequential paging costs 15 serial round-trips; this collapses that to two.
 *
 * Pages are still concatenated in order. A batch stops the walk as soon as any page
 * in it comes back short, so at most `CONCURRENCY - 1` empty requests are wasted.
 */
const CONCURRENCY = 8

export async function fetchAllRowsParallel<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const rows: T[] = []
  for (let page = 0; ; page += CONCURRENCY) {
    const batch = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => {
        const from = (page + i) * PAGE_SIZE
        return makeQuery(from, from + PAGE_SIZE - 1)
      }),
    )
    for (const { data, error } of batch) {
      if (error) return { data: rows, error }
      rows.push(...(data ?? []))
    }
    // A short page means we've read past the end — everything after it is empty too.
    if (batch.some(({ data }) => !data || data.length < PAGE_SIZE)) break
  }
  return { data: rows, error: null }
}
