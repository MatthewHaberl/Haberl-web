'use client'

import { Printer } from 'lucide-react'

/** Opens the quote in a print window — every browser's print dialog offers
 *  "Save as PDF", so this is the zero-dependency PDF download. */
export function PrintQuoteButton({ html }: { html: string }) {
  function handlePrint() {
    const win = window.open('', '_blank')
    if (!win) return
    // Write the quote HTML as-is and inject NO script into the child document, so
    // nothing in quote_html can execute even if a value ever slipped past the
    // escaping in render-quote. The opener drives the print dialog once the
    // document has rendered.
    win.document.open()
    win.document.write(html)
    win.document.close()

    let printed = false
    const doPrint = () => {
      if (printed) return
      printed = true
      try { win.focus(); win.print() } catch { /* window was closed */ }
    }
    win.addEventListener('load', doPrint, { once: true })
    // document.write can complete synchronously (load may have already fired), so
    // nudge once more after a short delay; the `printed` guard keeps it to one dialog.
    setTimeout(doPrint, 600)
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:border-accent transition-colors"
    >
      <Printer className="h-4 w-4" /> Download PDF / Print
    </button>
  )
}
