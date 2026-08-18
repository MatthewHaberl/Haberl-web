'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'
import { CheckCircle2, Loader2, Phone } from 'lucide-react'

/**
 * Prefilled from the old quote so the customer confirms rather than retypes.
 * Submitting lands a lead on the staff to-do list — same path as a website
 * enquiry, just tagged back to the quote it came from.
 */
export function RenewRequestForm({
  token,
  defaultName,
  defaultPhone,
  defaultEmail,
  defaultAddress,
}: {
  token: string
  defaultName: string
  defaultPhone: string
  defaultEmail: string
  defaultAddress: string
}) {
  const [name, setName] = useState(defaultName)
  const [phone, setPhone] = useState(defaultPhone)
  const [email, setEmail] = useState(defaultEmail)
  const [address, setAddress] = useState(defaultAddress)
  const [note, setNote] = useState('')
  const [website, setWebsite] = useState('') // honeypot — humans never see it
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch(`/api/public/quote/${token}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email, address, note, website }),
      })
      if (!res.ok) {
        setError((await res.text()) || 'Something went wrong — please call us instead.')
        return
      }
      setDone(true)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center flex flex-col items-center gap-3">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <h2 className="text-lg font-bold text-primary">Thanks, {name.trim().split(' ')[0]}!</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          We&apos;ve got your request and will be in touch within one business day with an updated
          quote.
        </p>
        <a href="tel:+27615193016" className="text-sm text-accent underline inline-flex items-center gap-1">
          <Phone className="h-3.5 w-3.5" /> In a hurry? Call us now
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-card p-6 flex flex-col gap-4">
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
        <span className="text-sm font-medium">Email</span>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Installation address</span>
        <AddressAutocomplete value={address} onChange={setAddress} placeholder="Where the system goes" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Anything changed since last time?</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="e.g. added a pool pump, want more battery than last time"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
        {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : 'Request updated pricing'}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-muted-foreground text-center">
        No obligation — we&apos;ll confirm what you need, then send a fresh written quote.
      </p>
    </form>
  )
}
