'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pencil, Loader2, X, Save } from 'lucide-react'

export interface SiteCardData {
  id: string
  name: string
  address: string | null
  status: string
  system_size_kw: number | null
  system_type: string | null
}

const SITE_STATUSES = ['active', 'pending', 'maintenance', 'decommissioned'] as const

const statusBadge: Record<string, 'success' | 'warning' | 'outline'> = {
  active: 'success', pending: 'warning', maintenance: 'warning', decommissioned: 'outline',
}

const selectClass =
  'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

/**
 * A site shown on the customer page. Read-only by default; the pencil flips it
 * into an inline edit form. Sites have no other edit screen, so this is the one
 * place staff can correct a site's name / address / size / status — including
 * the ones created by hand for monitoring.
 */
export function SiteCard({ site }: { site: SiteCardData }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(site.name ?? '')
  const [address, setAddress] = useState(site.address ?? '')
  const [systemType, setSystemType] = useState(site.system_type ?? '')
  const [sizeKw, setSizeKw] = useState(site.system_size_kw != null ? String(site.system_size_kw) : '')
  const [status, setStatus] = useState(site.status ?? 'active')

  function startEdit() {
    setName(site.name ?? '')
    setAddress(site.address ?? '')
    setSystemType(site.system_type ?? '')
    setSizeKw(site.system_size_kw != null ? String(site.system_size_kw) : '')
    setStatus(site.status ?? 'active')
    setError(null)
    setEditing(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (name.trim().length < 2) { setError('Give the site a name.'); return }

    setBusy(true)
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('sites')
      .update({
        name: name.trim(),
        address: address.trim(),
        system_type: systemType.trim(),
        system_size_kw: sizeKw ? Number(sizeKw) : null,
        status,
      })
      .eq('id', site.id)
    setBusy(false)

    if (updateError) { setError(updateError.message); return }
    setEditing(false)
    router.refresh()
  }

  if (!editing) {
    return (
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium truncate">{site.name}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant={statusBadge[site.status] ?? 'warning'}>{site.status}</Badge>
              <button
                type="button"
                onClick={startEdit}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Edit site"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {site.address && <p className="text-sm text-muted-foreground mt-1 truncate">{site.address}</p>}
          {site.system_size_kw != null && (
            <p className="text-sm mt-1"><span className="font-medium">{site.system_size_kw} kW</span> {site.system_type}</p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-accent/40">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-sm">Edit site</p>
          <button type="button" onClick={() => setEditing(false)}
            className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={save} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Site name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Home / Main roof" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Address</label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, suburb" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">System type</label>
              <Input value={systemType} onChange={(e) => setSystemType(e.target.value)} placeholder="Solar PV" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Size (kWp)</label>
              <Input value={sizeKw} onChange={(e) => setSizeKw(e.target.value)} inputMode="decimal" placeholder="e.g. 8" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                {SITE_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center gap-2">
            <Button type="submit" variant="accent" size="sm" disabled={busy}>
              {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Save className="h-3.5 w-3.5" /> Save changes</>}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
