'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserPlus, Loader2, X } from 'lucide-react'

const fieldClass =
  'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ' +
  'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Create a customer by hand (a walk-in, a referral, an existing client). No
 * account email is sent — the customer lands as a Prospect until staff press
 * "Send invite" on their page.
 */
export function AddCustomerDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [isBusiness, setIsBusiness] = useState(false)
  const [contactName, setContactName] = useState('')
  const [notes, setNotes] = useState('')

  function reset() {
    setFullName(''); setEmail(''); setPhone(''); setAddress('')
    setIsBusiness(false); setContactName(''); setNotes(''); setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (fullName.trim().length < 2) { setError('Please enter a name.'); return }

    setBusy(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: insertError } = await supabase
      .from('customers')
      .insert({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        is_business: isBusiness,
        contact_name: isBusiness ? (contactName.trim() || null) : null,
        notes: notes.trim() || null,
        source: 'manual',
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()
    setBusy(false)

    if (insertError) { setError(insertError.message); return }
    reset()
    setOpen(false)
    router.push(`/portal/employee/customers/${data!.id}`)
  }

  if (!open) {
    return (
      <Button variant="accent" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" /> Add customer
      </Button>
    )
  }

  return (
    <Card className="border-accent/40 w-full">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-sm">Add a customer</p>
          <button type="button" onClick={() => { reset(); setOpen(false) }}
            className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name *</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Customer / company name" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" inputMode="email" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Phone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 123 4567" inputMode="tel" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Address</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Suburb / street" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isBusiness} onChange={(e) => setIsBusiness(e.target.checked)} />
            This is a business
          </label>
          {isBusiness && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Contact person</label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Who to speak to" />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Note</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Anything worth remembering…" className={`${fieldClass} h-auto`} />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center gap-2">
            <Button type="submit" variant="accent" size="sm" disabled={busy}>
              {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><UserPlus className="h-3.5 w-3.5" /> Add customer</>}
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
