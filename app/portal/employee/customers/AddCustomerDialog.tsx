'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { normalizePhone } from '@/lib/customers/phone'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserPlus, Loader2, X, AlertTriangle } from 'lucide-react'

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
  // Set when the typed number already belongs to someone. Staff can open that
  // customer or override with "Add anyway" (e.g. spouses sharing a number).
  const [dupe, setDupe] = useState<{ id: string; full_name: string } | null>(null)

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [isBusiness, setIsBusiness] = useState(false)
  const [contactName, setContactName] = useState('')
  const [notes, setNotes] = useState('')

  function reset() {
    setFullName(''); setEmail(''); setPhone(''); setAddress('')
    setIsBusiness(false); setContactName(''); setNotes(''); setError(null); setDupe(null)
  }

  /** The actual insert — used by the normal path and by "Add anyway". */
  async function insertCustomer() {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDupe(null)
    if (fullName.trim().length < 2) { setError('Please enter a name.'); return }

    // Don't create a second record for a number we already have on file.
    const phoneNorm = normalizePhone(phone)
    if (phoneNorm) {
      setBusy(true)
      const supabase = createClient()
      const { data: match } = await supabase
        .from('customers')
        .select('id, full_name')
        .eq('phone_normalized', phoneNorm)
        .limit(1)
        .maybeSingle()
      setBusy(false)
      if (match) { setDupe(match as { id: string; full_name: string }); return }
    }

    await insertCustomer()
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

          {dupe && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                This number is already on file
              </p>
              <p className="text-muted-foreground mt-1">
                <span className="font-medium text-foreground">{dupe.full_name}</span> already has this phone number.
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <Button type="button" variant="accent" size="sm"
                  onClick={() => router.push(`/portal/employee/customers/${dupe.id}`)}>
                  Open {dupe.full_name}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={insertCustomer} disabled={busy}>
                  Add anyway
                </Button>
              </div>
            </div>
          )}

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
