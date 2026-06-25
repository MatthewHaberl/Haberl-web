'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MapPinPlus, Loader2, X } from 'lucide-react'

/**
 * Create a site for a customer by hand — for existing/installed systems that
 * never came through the quote→accept flow (e.g. setting one up so it can be
 * attached to monitoring). A site needs a customer (customer_id is NOT NULL),
 * so this lives on the customer's page where that link is implicit.
 */
export function AddSiteDialog({
  customerId,
  defaultAddress,
}: {
  customerId: string
  defaultAddress?: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [address, setAddress] = useState(defaultAddress ?? '')
  const [systemType, setSystemType] = useState('Solar PV')
  const [sizeKw, setSizeKw] = useState('')

  function reset() {
    setName(''); setAddress(defaultAddress ?? ''); setSystemType('Solar PV')
    setSizeKw(''); setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (name.trim().length < 2) { setError('Give the site a name (e.g. "Home" or "Main roof").'); return }

    setBusy(true)
    const supabase = createClient()
    const { data, error: insertError } = await supabase
      .from('sites')
      .insert({
        customer_id: customerId,
        name: name.trim(),
        address: address.trim(),
        system_type: systemType.trim(),
        system_size_kw: sizeKw ? Number(sizeKw) : null,
        status: 'active',
      })
      .select('id')
      .single()
    setBusy(false)

    if (insertError) { setError(insertError.message); return }
    reset()
    setOpen(false)
    router.refresh()
    return data
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MapPinPlus className="h-4 w-4" /> Add site
      </Button>
    )
  }

  return (
    <Card className="border-accent/40 w-full mb-3">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-sm">Add a site</p>
          <button type="button" onClick={() => { reset(); setOpen(false) }}
            className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Site name *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Home / Main roof / Warehouse" autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Address</label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, suburb" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">System type</label>
              <Input value={systemType} onChange={(e) => setSystemType(e.target.value)} placeholder="Solar PV" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">System size (kWp)</label>
              <Input value={sizeKw} onChange={(e) => setSizeKw(e.target.value)} inputMode="decimal" placeholder="e.g. 8" />
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center gap-2">
            <Button type="submit" variant="accent" size="sm" disabled={busy}>
              {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><MapPinPlus className="h-3.5 w-3.5" /> Add site</>}
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
