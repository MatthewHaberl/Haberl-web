'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mail, Phone, MapPin, Pencil, Send, Loader2, Check, Link2 } from 'lucide-react'
import type { Customer, CustomerAccountStatus } from '@/types/database'

const fieldClass =
  'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ' +
  'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export function CustomerPanel({
  customer,
  accountStatus,
}: {
  customer: Customer
  accountStatus: CustomerAccountStatus
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit fields
  const [fullName, setFullName] = useState(customer.full_name)
  const [email, setEmail] = useState(customer.email ?? '')
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [address, setAddress] = useState(customer.address ?? '')
  const [contactName, setContactName] = useState(customer.contact_name ?? '')
  const [notes, setNotes] = useState(customer.notes ?? '')

  // Invite state
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (fullName.trim().length < 2) { setError('Please enter a name.'); return }
    setBusy(true)
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('customers')
      .update({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        contact_name: customer.is_business ? (contactName.trim() || null) : null,
        notes: notes.trim() || null,
      })
      .eq('id', customer.id)
    setBusy(false)
    if (updateError) { setError(updateError.message); return }
    setEditing(false)
    router.refresh()
  }

  async function sendInvite() {
    setInviteBusy(true)
    setInviteMsg(null)
    setInviteLink(null)
    try {
      const res = await fetch(`/api/customers/${customer.id}/invite`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setInviteMsg(data.error ?? 'Could not send the invite.')
        return
      }
      if (data.status === 'existing') {
        setInviteMsg('This customer has already registered.')
      } else if (data.sent) {
        setInviteMsg(`Invite emailed to ${customer.email}.`)
      } else if (data.actionUrl) {
        setInviteMsg(data.warning ? `Email not sent (${data.warning}). Share this link instead:` : 'Email is off — share this invite link:')
        setInviteLink(data.actionUrl)
      } else {
        setInviteMsg('Invite created.')
      }
      router.refresh()
    } finally {
      setInviteBusy(false)
    }
  }

  const inviteLabel = accountStatus === 'invited' ? 'Resend invite' : 'Send invite'

  return (
    <Card>
      <CardContent className="pt-5 pb-5 flex flex-col gap-4">
        {!editing ? (
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                {customer.email
                  ? <a href={`mailto:${customer.email}`} className="hover:underline truncate">{customer.email}</a>
                  : <span className="text-muted-foreground italic">No email yet</span>}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                {customer.phone
                  ? <a href={`tel:${customer.phone}`} className="hover:underline">{customer.phone}</a>
                  : <span className="text-muted-foreground italic">No phone</span>}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                {customer.address || <span className="text-muted-foreground italic">No address</span>}
              </div>
              {customer.is_business && customer.contact_name && (
                <p className="text-sm text-muted-foreground">Contact: {customer.contact_name}</p>
              )}
              {customer.notes && <p className="text-sm text-muted-foreground mt-1">{customer.notes}</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          </div>
        ) : (
          <form onSubmit={saveDetails} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" inputMode="email" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Address</label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              {customer.is_business && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Contact person</label>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Note</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${fieldClass} h-auto`} />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex items-center gap-2">
              <Button type="submit" variant="accent" size="sm" disabled={busy}>
                {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : 'Save'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
            </div>
          </form>
        )}

        {/* Portal access */}
        <div className="border-t border-border pt-4">
          {accountStatus === 'registered' ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <Check className="h-4 w-4" /> Registered — has portal access.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  variant="accent"
                  size="sm"
                  onClick={sendInvite}
                  disabled={inviteBusy || !customer.email}
                  title={!customer.email ? 'Add an email address first' : undefined}
                >
                  {inviteBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {inviteLabel}
                </Button>
                {!customer.email && (
                  <span className="text-xs text-muted-foreground">Add an email above before inviting.</span>
                )}
                {accountStatus === 'invited' && customer.invited_at && (
                  <span className="text-xs text-muted-foreground">Invited — awaiting registration.</span>
                )}
              </div>
              {inviteMsg && <p className="text-sm text-muted-foreground">{inviteMsg}</p>}
              {inviteLink && (
                <div className="flex items-center gap-2 text-xs">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-accent" />
                  <input
                    readOnly
                    value={inviteLink}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
