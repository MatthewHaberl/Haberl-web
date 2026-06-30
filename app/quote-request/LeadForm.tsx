'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'
import { CheckCircle2, Loader2, Phone } from 'lucide-react'

export function LeadForm() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [suburb, setSuburb] = useState('')
  const [note, setNote] = useState('')
  const [referrer, setReferrer] = useState('') // optional staff email who sent them
  const [website, setWebsite] = useState('') // honeypot — humans never see it
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, suburb, note, referrer_email: referrer, website }),
      })
      if (!res.ok) {
        setError(await res.text() || 'Something went wrong — please call us instead.')
        return
      }
      setDone(true)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-white p-8 text-center flex flex-col items-center gap-3">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <h2 className="text-lg font-bold text-primary">Thanks, {name.trim().split(' ')[0]}!</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          We&apos;ve got your details and will call you back within one business day to talk through
          your solar options.
        </p>
        <a href="tel:+27615193016" className="text-sm text-accent underline inline-flex items-center gap-1">
          <Phone className="h-3.5 w-3.5" /> In a hurry? Call us now
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-white p-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Your name *</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Phone number *</span>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          autoComplete="tel"
          placeholder="e.g. 061 519 3016"
          required
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Suburb or address</span>
        <AddressAutocomplete value={suburb} onChange={setSuburb} placeholder="e.g. Midrand" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Anything we should know?</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="e.g. monthly bill around R3,500, interested in backup power"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Referred by</span>
        <Input
          value={referrer}
          onChange={(e) => setReferrer(e.target.value)}
          type="email"
          autoComplete="off"
          placeholder="If a Haberl team member sent you, their email"
        />
      </label>

      {/* Honeypot — bots fill it, humans never see it */}
      <input
        type="text"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <Button type="submit" variant="accent" disabled={busy || name.trim().length < 2 || phone.trim().length < 9}>
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : 'Request my callback'}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-muted-foreground text-center">
        No spam, no obligation — one call to understand your needs, then a written quote.
      </p>
    </form>
  )
}
