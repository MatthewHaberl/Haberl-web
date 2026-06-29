'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { MessageSquarePlus, X, Send, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

/**
 * Floating "Report an issue" widget for the portal. Anyone signed into the
 * portal can flag a teething issue, a suggestion, or a question the moment
 * they spot it — it lands in the admin Tickets tab and emails the team.
 *
 * Placement (honours "don't cover anything else that pops up there"):
 *  - z-40 so confirm dialogs and the mobile drawer (z-50) sit ABOVE it.
 *  - On /portal/customer/* the public WhatsApp FAB owns bottom-5 right-5, so
 *    we stack this above it (bottom-24); elsewhere it takes bottom-5.
 *  - Hidden on the full-screen quote design/map tools, which have their own
 *    bottom-right controls.
 */
const CATEGORIES = [
  { value: 'issue', label: 'Something broken' },
  { value: 'idea', label: 'Suggestion' },
  { value: 'question', label: 'Question' },
] as const

type Category = (typeof CATEGORIES)[number]['value']

/** Quote detail/design pages render a full-screen map with its own controls. */
const HIDE_ON = /\/quotes-v2\/[^/]+/

export function ReportIssueWidget() {
  const pathname = usePathname() ?? ''
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [category, setCategory] = useState<Category>('issue')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (HIDE_ON.test(pathname)) return null

  const onCustomer = pathname.startsWith('/portal/customer')
  const offset = onCustomer ? 'bottom-24' : 'bottom-5'

  function close() {
    setOpen(false)
    setDone(false)
    setError(null)
    setCategory('issue')
  }

  async function submit() {
    const text = message.trim()
    if (!text) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, category, page_url: pathname }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || 'Could not submit. Please try again.')
      }
      setDone(true)
      setMessage('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={cn('fixed right-5 z-40 flex flex-col items-end print:hidden', offset)}>
      {open && (
        <div className="mb-3 w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Report an issue</p>
            <button
              onClick={close}
              aria-label="Close"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {done ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <p className="text-sm font-medium text-foreground">Thanks — we&apos;ve got it.</p>
              <p className="text-xs text-muted-foreground">
                Your report has been sent to the team.
              </p>
              <Button variant="outline" size="sm" className="mt-2" onClick={close}>
                Done
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-4">
              <div className="flex gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={cn(
                      'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                      category === c.value
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ticket-message" className="text-xs">
                  What happened?
                </Label>
                <Textarea
                  id="ticket-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe what needs fixing, where you saw it, and what you expected…"
                  rows={4}
                  autoFocus
                />
              </div>

              <p className="text-[11px] text-muted-foreground">
                We&apos;ll include the page you&apos;re on so we can find it quickly.
              </p>
              {error && <p className="text-xs text-destructive">{error}</p>}

              <Button onClick={submit} disabled={submitting || !message.trim()} className="w-full">
                <Send className="h-4 w-4" />
                {submitting ? 'Sending…' : 'Send report'}
              </Button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={open ? 'Close report form' : 'Report an issue'}
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 rounded-full px-4 py-3 shadow-lg transition-transform hover:scale-105',
          'bg-primary text-primary-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        )}
      >
        {open ? <X className="h-5 w-5" /> : <MessageSquarePlus className="h-5 w-5" />}
        {!open && <span className="hidden text-sm font-semibold sm:inline">Report an issue</span>}
      </button>
    </div>
  )
}
