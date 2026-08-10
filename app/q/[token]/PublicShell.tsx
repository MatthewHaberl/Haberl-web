import type { ReactNode } from 'react'

/**
 * Brand frame for every public (no-login) quote screen — the quote itself, the
 * "no longer available" card and the request-an-updated-quote form. Shared so a
 * customer following an old link never lands somewhere that looks unfamiliar.
 */
export function PublicShell({
  quoteNumber,
  children,
}: {
  quoteNumber?: string | null
  children: ReactNode
}) {
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <span className="text-lg font-bold">
            Haberl <span className="text-accent">Solar</span>
          </span>
          {quoteNumber && <span className="text-sm font-mono opacity-90">{quoteNumber}</span>}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-5">
        {children}

        <footer className="pb-8 pt-2 text-center text-xs text-muted-foreground">
          Haberl Electrical &amp; Solar · Designed to SANS 10142-1 · info@haberl.co.za
        </footer>
      </main>
    </div>
  )
}
