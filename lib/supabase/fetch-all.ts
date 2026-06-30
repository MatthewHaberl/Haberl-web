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
