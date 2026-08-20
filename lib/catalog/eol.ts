// ─────────────────────────────────────────────────────────────────────────────
// End-of-life items.
//
// Suppliers (Key Electric in particular) flag a discontinued line by prefixing
// its description: "[EOL] CHINT 16A 2P CIRCUIT BREAKER…". That is a *status*,
// not part of the product name — but because it lived in the description it
// travelled everywhere the description did, including onto customer quote
// documents and the web store.
//
// So: the marker is parsed out of the text into `equipment_catalog.end_of_life`
// (migration 128) and stripped from the description. Staff still see an "EOL"
// badge off the flag; customers see neither the item nor the marker.
//
// Everything that reads or writes the marker goes through here so the importer,
// the migration, the admin UI and the document renderer cannot drift apart.
// Pure module — safe on server and client.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A bracketed EOL marker plus whatever separator trails it. Every bracket
 * variant the price lists actually use is covered — `[EOL]`, `(EOL)`, and the
 * mismatched `{EOL]` / unclosed `[EOL` that the source spreadsheets contain.
 */
const EOL_MARKER = /[[({]\s*EOL\s*[\])}]?\s*[-–—:]?\s*/gi

/** True when the text carries a supplier EOL marker. */
export function hasEolMarker(text: string | null | undefined): boolean {
  if (!text) return false
  EOL_MARKER.lastIndex = 0
  return EOL_MARKER.test(text)
}

/**
 * The text with any EOL marker removed and the spacing tidied. Used on import
 * (so the stored description is clean) and again when serving a document
 * rendered before the flag existed.
 */
export function stripEolMarker<T extends string | null | undefined>(text: T): T {
  if (!text) return text
  return text.replace(EOL_MARKER, '').replace(/\s{2,}/g, ' ').trim() as T
}

/**
 * Split a supplier description into its clean text and the EOL status it was
 * carrying. `endOfLife` is only ever set true here — an item already flagged in
 * the catalog stays flagged even if a later price list drops the marker, which
 * is the safe direction: un-flagging is a deliberate admin action.
 */
export function parseEolDescription(text: string | null | undefined): {
  description: string | null
  endOfLife: boolean
} {
  return {
    description: stripEolMarker(text) ?? null,
    endOfLife: hasEolMarker(text),
  }
}
