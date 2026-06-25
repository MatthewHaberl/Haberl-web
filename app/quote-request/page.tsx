import type { Metadata } from 'next'
import Link from 'next/link'
import { LeadForm } from './LeadForm'

export const metadata: Metadata = {
  title: 'Get a Solar Quote',
  description:
    'Request a callback from Haberl Electrical & Solar — leave your name and number and we’ll call you back to plan your solar installation.',
}

export default function QuoteRequestPage() {
  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold">
            Haberl <span className="text-accent">Solar</span>
          </Link>
          <Link href="/" className="text-sm opacity-90 hover:opacity-100">← Back to site</Link>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-10 flex flex-col gap-5">
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-primary">Get your solar quote</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Leave your details and we&apos;ll call you back — one quick conversation, then a written
            quote with exact pricing. No site visit needed to get started.
          </p>
        </div>
        <LeadForm />
      </main>
    </div>
  )
}
