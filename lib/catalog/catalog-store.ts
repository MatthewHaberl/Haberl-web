'use client'

// One equipment catalog, shared by every consumer, remembered between visits.
//
// Three layers, fastest first:
//   1. Module memory — survives moving between sections and quote pages inside the
//      SPA, so a section switch costs nothing at all.
//   2. IndexedDB — survives a reload or a new tab. Painted immediately, which is what
//      lets a picker show the product you chose instead of "Loading…". (IndexedDB, not
//      localStorage: the catalog is ~3.7MB and would blow the 5MB localStorage cap.)
//   3. /api/catalog — one request, and when the cached copy is still current the
//      server answers `unchanged` with no body.
//
// Every layer is optional: private-mode browsers with IndexedDB blocked, or a deploy
// without the API route, fall back to reading the catalog straight from Supabase.

import { createClient } from '@/lib/supabase/client'
import { fetchAllRowsParallel } from '@/lib/supabase/fetch-all'
import type { EquipmentCatalogItem } from '@/lib/solar/quote-calculator'
import { decodeCatalog, type CatalogPayload } from './payload'

export interface CatalogSnapshot {
  items: EquipmentCatalogItem[]
  loading: boolean
  error: string
}

const EMPTY: EquipmentCatalogItem[] = []

/** A copy this old is refreshed in the background on the next mount. */
const REVALIDATE_AFTER_MS = 5 * 60 * 1000

let snapshot: CatalogSnapshot = { items: EMPTY, loading: true, error: '' }
let version: string | null = null
let lastCheckedAt = 0
let inFlight: Promise<void> | null = null

const listeners = new Set<() => void>()

function publish(next: Partial<CatalogSnapshot>) {
  snapshot = { ...snapshot, ...next }
  for (const listener of listeners) listener()
}

// ── IndexedDB ────────────────────────────────────────────────────────────────
// Deliberately tiny: one database, one store, one key. Any failure (private mode,
// quota, a browser that refuses to open it) resolves to null and we just refetch.

const DB_NAME = 'haberl-catalog'
const STORE_NAME = 'snapshots'
const CACHE_KEY = 'active-catalog'

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, 1)
    } catch {
      return resolve(null)
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

async function readCache(): Promise<CatalogPayload | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(CACHE_KEY)
      request.onsuccess = () => resolve((request.result as CatalogPayload) ?? null)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function writeCache(payload: CatalogPayload): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(payload, CACHE_KEY)
  } catch {
    // Out of quota or storage disabled — the in-memory copy still serves this session.
  }
}

// ── Loading ──────────────────────────────────────────────────────────────────

/** Last-resort path: read the catalog straight from PostgREST, as the canvas used to. */
async function loadFromSupabase(): Promise<void> {
  const supabase = createClient()
  const { data, error } = await fetchAllRowsParallel<EquipmentCatalogItem>((from, to) =>
    supabase
      .from('equipment_catalog')
      .select('*')
      .eq('active', true)
      .order('sort_order').order('brand').order('description')
      .range(from, to),
  )
  if (error && !data.length) {
    publish({ loading: false, error: error.message })
    return
  }
  publish({ items: data, loading: false, error: '' })
}

async function refresh(): Promise<void> {
  // Paint whatever is on disk first, so pickers render their current selection while
  // the network check runs.
  if (!snapshot.items.length) {
    const cached = await readCache()
    if (cached?.rows?.length) {
      version = cached.version
      publish({ items: decodeCatalog(cached), loading: false, error: '' })
    }
  }

  try {
    const response = await fetch('/api/catalog', {
      headers: version ? { 'x-catalog-version': version } : undefined,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`catalog request failed (${response.status})`)
    const payload = (await response.json()) as CatalogPayload & { unchanged?: boolean }

    lastCheckedAt = Date.now()
    if (payload.unchanged) {
      publish({ loading: false, error: '' })
      return
    }
    version = payload.version
    publish({ items: decodeCatalog(payload), loading: false, error: '' })
    void writeCache(payload)
  } catch (err) {
    // Cached copy on screen already? Then a failed refresh is not worth an error.
    if (snapshot.items.length) {
      publish({ loading: false, error: '' })
      return
    }
    try {
      await loadFromSupabase()
    } catch {
      publish({
        loading: false,
        error: err instanceof Error ? err.message : 'Could not load the equipment catalog',
      })
    }
  }
}

/**
 * Make sure the catalog is loaded. Safe to call from every component on every mount:
 * concurrent calls share one request, and a copy checked within the last few minutes
 * is used as-is without touching the network.
 */
export function ensureCatalog(): void {
  if (inFlight) return
  if (snapshot.items.length && Date.now() - lastCheckedAt < REVALIDATE_AFTER_MS) return
  inFlight = refresh().finally(() => { inFlight = null })
}

/** Drop the shared copy so the next `ensureCatalog()` refetches from the server. */
export function invalidateCatalog(): void {
  version = null
  lastCheckedAt = 0
  publish({ loading: !snapshot.items.length })
  ensureCatalog()
}

// Coming back to the tab is the moment a price edited elsewhere (the catalog admin
// screen, another window) should land. The check is one small request, so it is worth
// running rather than showing yesterday's cost on a quote.
let watchingVisibility = false
function watchVisibility() {
  if (watchingVisibility || typeof document === 'undefined') return
  watchingVisibility = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - lastCheckedAt < 30_000) return
    lastCheckedAt = 0
    ensureCatalog()
  })
}

export function subscribeCatalog(listener: () => void): () => void {
  listeners.add(listener)
  watchVisibility()
  return () => { listeners.delete(listener) }
}

export function getCatalogSnapshot(): CatalogSnapshot {
  return snapshot
}

/** Server render: the catalog is browser-only, so SSR always sees the loading state. */
const SERVER_SNAPSHOT: CatalogSnapshot = { items: EMPTY, loading: true, error: '' }
export function getCatalogServerSnapshot(): CatalogSnapshot {
  return SERVER_SNAPSHOT
}

// ── Category index ───────────────────────────────────────────────────────────
// `byCategory` runs in roughly 15 components on every render. Filtering 15k rows each
// time is real work, so each catalog array gets its category buckets built once.

const categoryIndex = new WeakMap<EquipmentCatalogItem[], Map<string, EquipmentCatalogItem[]>>()

export function catalogByCategory(
  items: EquipmentCatalogItem[],
  category: EquipmentCatalogItem['category'],
): EquipmentCatalogItem[] {
  let buckets = categoryIndex.get(items)
  if (!buckets) {
    buckets = new Map()
    for (const item of items) {
      const bucket = buckets.get(item.category)
      if (bucket) bucket.push(item)
      else buckets.set(item.category, [item])
    }
    categoryIndex.set(items, buckets)
  }
  return buckets.get(category) ?? EMPTY
}
