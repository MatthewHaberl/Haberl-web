import { notFound } from 'next/navigation'
import { getTestimonialByToken } from '@/lib/testimonials/server'
import { TestimonialForm } from './TestimonialForm'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Leave a review — Haberl Electrical & Solar' }

/**
 * Public testimonial capture (S7). No login — the token in the URL is the key,
 * exactly like the quote share link. Reached from the email the job page sends.
 */
export default async function TestimonialPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ctx = await getTestimonialByToken(token)
  if (!ctx) notFound()

  const alreadyDone = ctx.testimonial.status === 'submitted'
    || ctx.testimonial.status === 'approved'
    || ctx.testimonial.status === 'declined'

  const firstName = ctx.customerName?.split(' ')[0] ?? null

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Haberl Electrical &amp; Solar
        </p>
        <h1 className="text-2xl font-bold text-foreground">
          {alreadyDone ? 'Thank you' : firstName ? `${firstName}, how has it been?` : 'How has it been?'}
        </h1>
        {ctx.siteName && (
          <p className="text-sm text-muted-foreground">Your installation at {ctx.siteName}</p>
        )}
      </header>

      {alreadyDone ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-foreground">
            We&apos;ve got your review — thank you for taking the time. It genuinely helps a small
            business like ours.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            If you&apos;d like to change anything, just reply to the email and we&apos;ll sort it out.
          </p>
        </div>
      ) : (
        <TestimonialForm token={token} defaultName={ctx.customerName ?? ''} />
      )}
    </main>
  )
}
