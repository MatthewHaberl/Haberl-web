// ─────────────────────────────────────────────────────────────────────────────
// Positional PDF text extraction (W99) — server only.
//
// Thin wrapper over pdf.js that returns every text run with its page position,
// which is what supplier-quote-table.ts needs to rebuild the quote's table:
// x tells us which column a number sits in, y tells us which row.
//
// The legacy build is the Node-targeted one (no DOM, no worker). We import it
// dynamically so the module graph stays loadable everywhere; pdfjs-dist is
// listed in next.config.ts serverExternalPackages so Next leaves it alone.
// ─────────────────────────────────────────────────────────────────────────────

export interface PdfTextItem {
  str: string
  /** Left edge, PDF points from the page's left. */
  x: number
  /** Baseline, PDF points from the page's bottom (higher = further up). */
  y: number
  width: number
  height: number
}

export interface PdfTextPage {
  page: number
  width: number
  height: number
  items: PdfTextItem[]
}

/** True when the buffer starts with a PDF magic header. */
export function looksLikePdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString('latin1') === '%PDF-'
}

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

/**
 * pdf.js 4.x calls Promise.withResolvers in ~30 places, which only exists from
 * Node 22. Runtimes still on Node 20 (Vercel's older default) would throw on
 * the very first page otherwise, so fill it in before the module loads.
 */
function ensurePromiseWithResolvers(): void {
  const P = Promise as unknown as { withResolvers?: unknown }
  if (typeof P.withResolvers === 'function') return
  P.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }
}

/**
 * Point pdf.js at its worker explicitly. Everything pdf.js does happens in the
 * worker — in Node it runs one in-process, loaded from pdf.worker.mjs sitting
 * next to pdf.mjs. That reference is `new URL(…, import.meta.url)` inside the
 * library, which a bundler's tracer can't see, so on a deployment the worker
 * can go missing while the main build is present. Resolving it ourselves makes
 * the dependency explicit (and next.config.ts traces the folder in).
 */
async function pinWorker(pdfjs: Pdfjs): Promise<void> {
  try {
    const [{ createRequire }, { pathToFileURL }, path] = await Promise.all([
      import('node:module'),
      import('node:url'),
      import('node:path'),
    ])
    const resolver = createRequire(path.join(process.cwd(), 'package.json'))
    const worker = resolver.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(worker).href
  } catch {
    // Leave pdf.js to find its own worker — the normal path when it's there.
  }
}

async function loadPdfjs(): Promise<Pdfjs> {
  ensurePromiseWithResolvers()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  await pinWorker(pdfjs)
  return pdfjs
}

/** Extract positioned text runs from every page. Throws when the PDF can't be read. */
export async function extractPdfTextPages(bytes: Buffer): Promise<PdfTextPage[]> {
  const pdfjs = await loadPdfjs()
  // A copy: pdf.js transfers/detaches the buffer it is handed.
  const data = new Uint8Array(bytes)
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: false,
    // Text extraction only — never fetch fonts/cmaps over the network.
    disableFontFace: true,
  }).promise

  const pages: PdfTextPage[] = []
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const [, , right, top] = page.view as number[]
      const content = await page.getTextContent()
      const items: PdfTextItem[] = []
      for (const raw of content.items) {
        if (!('str' in raw)) continue
        const str = raw.str
        if (!str || !str.trim()) continue
        items.push({
          str,
          x: raw.transform[4],
          y: raw.transform[5],
          width: raw.width || 0,
          height: raw.height || 0,
        })
      }
      pages.push({ page: p, width: right, height: top, items })
      page.cleanup()
    }
  } finally {
    await doc.destroy()
  }
  return pages
}
