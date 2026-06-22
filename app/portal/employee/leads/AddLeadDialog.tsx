'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserPlus, Loader2, X } from 'lucide-react'

/** Channels a lead can come in on. Stored in leads.source (free text). */
const SOURCES = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Phone call' },
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'website', label: 'Website' },
  { value: 'other', label: 'Other' },
]

const fieldClass =
  'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ' +
  'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Log a lead that came in off-platform (a WhatsApp message, a phone call, a
 * referral) so it joins the same pipeline as website enquiries — appears on
 * this tab, in the daily email, and can be converted to a survey. Catch-all
 * until the Meta/WhatsApp integration captures those automatically.
 */
export function AddLeadDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [suburb, setSuburb] = useState('')
  const [source, setSource] = useState('whatsapp')
  const [note, setNote] = useState('')

  function reset() {
    setName(''); setPhone(''); setSuburb(''); setSource('whatsapp'); setNote(''); setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const cleanName = name.trim()
    const cleanPhone = phone.trim()
    if (cleanName.length < 2) { setError('Please enter a name.'); return }
    if (cleanPhone.replace(/\D/g, '').length < 9) { setError('Please enter a valid phone number.'); return }

    setBusy(true)
    const supabase = createClient()
    const { error: insertError } = await supabase.from('leads').insert({
      name: cleanName,
      phone: cleanPhone,
      suburb: suburb.trim() || null,
      note: note.trim() || null,
      source,
      status: 'new',
    })
    setBusy(false)

    if (insertError) { setError(insertError.message); return }
    reset()
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <Button variant="accent" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Add lead
      </Button>
    )
  }

  return (
    <Card className="border-accent/40 w-full">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-sm">Add a lead</p>
          <button
            type="button"
            onClick={() => { reset(); setOpen(false) }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone *</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 123 4567" inputMode="tel" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Suburb</label>
              <Input value={suburb} onChange={(e) => setSuburb(e.target.value)} placeholder="e.g. Fourways" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Came in via</label>
              <select value={source} onChange={(e) => setSource(e.target.value)} className={fieldClass}>
                {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What do they need? Anything they mentioned…"
              rows={2}
              className={`${fieldClass} h-auto`}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center gap-2">
            <Button type="submit" variant="accent" size="sm" disabled={busy}>
              {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><UserPlus className="h-3.5 w-3.5" /> Add lead</>}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { reset(); setOpen(false) }} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
