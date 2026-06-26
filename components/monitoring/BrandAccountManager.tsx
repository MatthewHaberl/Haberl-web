'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { BRAND_CONNECT, BRAND_ORDER, type BrandField } from '@/lib/monitoring/brand-fields'
import type { MonitoringBrand } from '@/lib/monitoring/types'
import { KeyRound, Loader2, Plus, Save, Trash2, Pencil, X } from 'lucide-react'

export interface BrandAccount {
  id: string
  brand: MonitoringBrand
  name: string
  usage: number
}

const selectClass =
  'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

/** Brands that actually have a cloud API to store a key for. */
const CONNECTABLE = BRAND_ORDER.filter((b) => !BRAND_CONNECT[b].cloudless)

/** Only the account-level secret fields — locators (plant_id/device_sn) are per-site. */
function credFields(brand: MonitoringBrand): BrandField[] {
  return BRAND_CONNECT[brand].fields.filter((f) => f.target === 'credential')
}

export function BrandAccountManager({ accounts }: { accounts: BrandAccount[] }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function remove(account: BrandAccount) {
    if (account.usage > 0) {
      setError(`"${account.name}" is used by ${account.usage} system${account.usage === 1 ? '' : 's'}. Switch them to another connection first.`)
      return
    }
    const ok = await confirm({
      title: `Delete "${account.name}"?`,
      body: 'This removes the saved credentials. Any site you connect with it in future will need a key again.',
      confirmText: 'Delete connection',
      destructive: true,
    })
    if (!ok) return
    setError('')
    const res = await fetch(`/api/monitoring/accounts?id=${encodeURIComponent(account.id)}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? `Delete failed (${res.status})`)
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {accounts.length === 0 && !adding && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground/40" />
            <div>
              <p className="font-semibold">No brand connections yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Save a brand&apos;s API key once here, then reuse it across every site of that brand —
                you&apos;ll only need each site&apos;s Plant/Station ID or serial.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {accounts.map((a) =>
        editingId === a.id ? (
          <AccountForm key={a.id} existing={a} onClose={() => setEditingId(null)} />
        ) : (
          <Card key={a.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="flex items-center gap-3">
                <Badge variant="outline">{BRAND_CONNECT[a.brand].label}</Badge>
                <div>
                  <p className="font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.usage > 0 ? `Used by ${a.usage} system${a.usage === 1 ? '' : 's'}` : 'Not yet linked to a site'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setError(''); setEditingId(a.id) }}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => remove(a)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ),
      )}

      {adding ? (
        <AccountForm onClose={() => setAdding(false)} />
      ) : (
        <div>
          <Button variant="accent" onClick={() => { setError(''); setAdding(true) }}>
            <Plus className="h-4 w-4" /> Add connection
          </Button>
        </div>
      )}
    </div>
  )
}

/** Create (no `existing`) or edit (with `existing`) a single brand connection. */
function AccountForm({ existing, onClose }: { existing?: BrandAccount; onClose: () => void }) {
  const router = useRouter()
  const editMode = !!existing

  const [brand, setBrand] = useState<MonitoringBrand>(existing?.brand ?? CONNECTABLE[0])
  const [name, setName] = useState(existing?.name ?? '')
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fields = credFields(brand)

  function setField(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  function validate(): string | null {
    if (!name.trim()) return 'Give this connection a name.'
    if (!editMode) {
      for (const f of fields) {
        if (f.required && !(values[f.key] ?? '').trim()) return `${f.label} is required.`
      }
      if (brand === 'growatt') {
        const hasToken = !!(values.api_token ?? '').trim()
        const hasLogin = !!(values.username ?? '').trim() && !!(values.password ?? '').trim()
        if (!hasToken && !hasLogin) return 'Provide an API token, or a username and password.'
      }
    }
    return null
  }

  async function save() {
    const v = validate()
    if (v) { setError(v); return }
    setError('')
    setSaving(true)
    try {
      const credentials: Record<string, string> = {}
      for (const f of fields) {
        const val = (values[f.key] ?? '').trim()
        if (val) credentials[f.key] = val
      }
      const res = await fetch('/api/monitoring/accounts', {
        method: editMode ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editMode ? { id: existing!.id, name: name.trim(), credentials } : { brand, name: name.trim(), credentials },
        ),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Save failed (${res.status})`)
        setSaving(false)
        return
      }
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const schema = BRAND_CONNECT[brand]

  return (
    <Card className="border-accent/40">
      <CardContent className="flex flex-col gap-4 pt-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{editMode ? 'Edit connection' : 'New brand connection'}</p>
          <Button variant="outline" size="sm" onClick={onClose}><X className="h-4 w-4" /> Cancel</Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Brand *</span>
            <select
              className={selectClass}
              value={brand}
              disabled={editMode}
              onChange={(e) => { setBrand(e.target.value as MonitoringBrand); setValues({}); setError('') }}
            >
              {CONNECTABLE.map((b) => (
                <option key={b} value={b}>{BRAND_CONNECT[b].label}</option>
              ))}
            </select>
            {editMode && <span className="text-xs text-muted-foreground/80">Brand can&apos;t be changed — create a new connection instead.</span>}
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Connection name *</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Haberl VRM account" />
          </label>
        </div>

        <p className="text-xs text-muted-foreground">{schema.accessHelp}</p>

        {editMode && (
          <p className="text-xs text-muted-foreground">Leave a field blank to keep its saved value.</p>
        )}

        {fields.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {f.label}{f.required && !editMode ? ' *' : ''}
            </span>
            <Input
              type={f.type === 'password' ? 'password' : 'text'}
              autoComplete="off"
              value={values[f.key] ?? ''}
              placeholder={editMode ? 'Saved — leave blank to keep' : f.placeholder}
              onChange={(e) => setField(f.key, e.target.value)}
            />
            <span className="text-xs text-muted-foreground/80">{f.help}</span>
          </label>
        ))}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-2">
          <Button variant="accent" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editMode ? 'Save changes' : 'Save connection'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          These credentials are verified when you connect a site with them — that&apos;s where the Plant/Station ID is entered.
        </p>
      </CardContent>
    </Card>
  )
}
