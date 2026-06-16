'use client'

import { useState } from 'react'
import { Send, CheckCircle2 } from 'lucide-react'

export function ContactForm() {
  const [sent, setSent] = useState(false)

  if (sent) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
        <CheckCircle2 className="h-6 w-6 shrink-0" />
        <p className="text-sm">Thanks for your message! This is a sandbox demo, so nothing was actually sent — but on the live site this would reach the Key Electric team.</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); setSent(true) }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" id="name" />
        <Field label="Email" id="email" type="email" />
      </div>
      <Field label="Subject" id="subject" />
      <div>
        <label htmlFor="message" className="mb-1 block text-sm font-medium text-[var(--ke-slate)]">Message</label>
        <textarea id="message" required rows={5} className="w-full rounded-md border border-[var(--ke-line)] px-3 py-2 text-sm outline-none focus:border-[var(--ke-yellow)]" />
      </div>
      <button type="submit" className="flex items-center gap-2 rounded-md bg-[var(--ke-yellow)] px-6 py-3 font-bold text-[var(--ke-slate)] hover:bg-[var(--ke-yellow-dark)]">
        <Send className="h-4 w-4" /> Send Message
      </button>
    </form>
  )
}

function Field({ label, id, type = 'text' }: { label: string; id: string; type?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-[var(--ke-slate)]">{label}</label>
      <input id={id} type={type} required className="w-full rounded-md border border-[var(--ke-line)] px-3 py-2 text-sm outline-none focus:border-[var(--ke-yellow)]" />
    </div>
  )
}
