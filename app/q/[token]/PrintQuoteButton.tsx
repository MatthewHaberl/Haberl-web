'use client'

import { Printer } from 'lucide-react'

/** Opens the quote in a print window — every browser's print dialog offers
 *  "Save as PDF", so this is the zero-dependency PDF download. */
export function PrintQuoteButton({ html }: { html: string }) {
  function handlePrint() {
    const win = window.open('', '_blank')
    if (!win) return
    const trigger = '<script>window.onload = function () { window.print() }</script>'
    const doc = html.includes('</body>')
      ? html.replace('</body>', `${trigger}</body>`)
      : html + trigger
    win.document.write(doc)
    win.document.close()
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium hover:border-accent transition-colors"
    >
      <Printer className="h-4 w-4" /> Download PDF / Print
    </button>
  )
}
