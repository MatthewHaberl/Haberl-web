'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Plus, Pencil, Trash2, Check, X, Loader2, ShieldAlert } from 'lucide-react'
import { PageShell, PageHeader } from '@/components/layout/page'

type Severity = 'block' | 'warn' | 'info'

export interface AuditRule {
  id: string
  code: string
  category: string
  severity: Severity
  title: string
  detail: string | null
  active: boolean
}

const SEVERITY_STYLE: Record<Severity, { bg: string; fg: string; label: string }> = {
  block: { bg: '#fee2e2', fg: '#b91c1c', label: 'BLOCK' },
  warn:  { bg: '#fef3c7', fg: '#b45309', label: 'WARN' },
  info:  { bg: '#e5e7eb', fg: '#374151', label: 'INFO' },
}

const CATEGORY_ORDER = ['Array & strings', 'Inverter sizing', 'Protection', 'Battery', 'Earthing', 'Environment']

function SeverityPill({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity]
  return (
    <span style={{ background: s.bg, color: s.fg }} className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide">
      {s.label}
    </span>
  )
}

export function AuditRulesManager({ initialRules }: { initialRules: AuditRule[] }) {
  const confirm = useConfirm()
  const [rules, setRules] = useState<AuditRule[]>(initialRules)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<AuditRule>>({})
  const [adding, setAdding] = useState(false)
  const [newRule, setNewRule] = useState<Partial<AuditRule>>({ severity: 'warn', category: CATEGORY_ORDER[0] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const categories = [
    ...CATEGORY_ORDER.filter((c) => rules.some((r) => r.category === c)),
    ...[...new Set(rules.map((r) => r.category))].filter((c) => !CATEGORY_ORDER.includes(c)),
  ]

  async function toggleActive(rule: AuditRule) {
    const supabase = createClient()
    const next = !rule.active
    setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, active: next } : r)))
    await supabase.from('audit_rules').update({ active: next, updated_at: new Date().toISOString() }).eq('id', rule.id)
  }

  async function saveEdit(id: string) {
    setBusy(true)
    setError('')
    try {
      const supabase = createClient()
      const patch = {
        category: draft.category,
        severity: draft.severity,
        title: draft.title,
        detail: draft.detail ?? null,
        updated_at: new Date().toISOString(),
      }
      const { error: e } = await supabase.from('audit_rules').update(patch).eq('id', id)
      if (e) { setError(e.message); return }
      setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } as AuditRule : r)))
      setEditingId(null)
    } finally {
      setBusy(false)
    }
  }

  async function deleteRule(id: string) {
    if (!(await confirm({ title: 'Delete this rule?', confirmText: 'Delete', destructive: true }))) return
    const supabase = createClient()
    setRules((rs) => rs.filter((r) => r.id !== id))
    await supabase.from('audit_rules').delete().eq('id', id)
  }

  async function addRule() {
    if (!newRule.code?.trim() || !newRule.title?.trim()) { setError('Code and title are required.'); return }
    setBusy(true)
    setError('')
    try {
      const supabase = createClient()
      const row = {
        code: newRule.code!.trim().toUpperCase(),
        category: newRule.category || CATEGORY_ORDER[0],
        severity: (newRule.severity as Severity) || 'warn',
        title: newRule.title!.trim(),
        detail: newRule.detail?.trim() || null,
      }
      const { data, error: e } = await supabase.from('audit_rules').insert(row).select().single()
      if (e) { setError(e.message.includes('duplicate') ? `Rule code ${row.code} already exists.` : e.message); return }
      if (data) setRules((rs) => [...rs, data as AuditRule])
      setNewRule({ severity: 'warn', category: CATEGORY_ORDER[0] })
      setAdding(false)
    } finally {
      setBusy(false)
    }
  }

  function startEdit(r: AuditRule) {
    setEditingId(r.id)
    setDraft({ category: r.category, severity: r.severity, title: r.title, detail: r.detail })
  }

  const sevSelect = (value: Severity | undefined, onChange: (v: Severity) => void) => (
    <select
      value={value ?? 'warn'}
      onChange={(e) => onChange(e.target.value as Severity)}
      className="h-9 rounded-md border border-border bg-background px-2 text-sm"
    >
      <option value="block">Block</option>
      <option value="warn">Warn</option>
      <option value="info">Info</option>
    </select>
  )

  return (
    <PageShell width="content">
      <PageHeader
        icon={ShieldAlert}
        title="Audit Rules"
        description="The soft rules the engine checks on existing systems. Edit, add or switch them off — changes are live, no deploy."
        actions={
          <Button variant="accent" size="sm" onClick={() => setAdding((a) => !a)}>
            <Plus className="h-4 w-4" /> Add rule
          </Button>
        }
      />

      {adding && (
        <Card>
          <CardContent className="pt-5 pb-5 flex flex-col gap-3">
            <div className="grid sm:grid-cols-4 gap-3">
              <Input placeholder="Code (e.g. ARR-08)" value={newRule.code ?? ''} onChange={(e) => setNewRule((n) => ({ ...n, code: e.target.value }))} />
              <Input placeholder="Category" value={newRule.category ?? ''} onChange={(e) => setNewRule((n) => ({ ...n, category: e.target.value }))} />
              {sevSelect(newRule.severity as Severity, (v) => setNewRule((n) => ({ ...n, severity: v })))}
              <Input placeholder="Title" value={newRule.title ?? ''} onChange={(e) => setNewRule((n) => ({ ...n, title: e.target.value }))} />
            </div>
            <Input placeholder="Detail / why" value={newRule.detail ?? ''} onChange={(e) => setNewRule((n) => ({ ...n, detail: e.target.value }))} />
            <div className="flex items-center gap-2">
              <Button variant="accent" size="sm" disabled={busy} onClick={addRule}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save rule'}</Button>
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md px-4 py-2">{error}</p>}

      {categories.map((cat) => (
        <div key={cat} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{cat}</h2>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {rules.filter((r) => r.category === cat).sort((a, b) => a.code.localeCompare(b.code)).map((r) => (
              <div key={r.id} className={`px-4 py-3 ${r.active ? '' : 'opacity-50'}`}>
                {editingId === r.id ? (
                  <div className="flex flex-col gap-2">
                    <div className="grid sm:grid-cols-3 gap-2">
                      <Input value={draft.category ?? ''} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} placeholder="Category" />
                      {sevSelect(draft.severity as Severity, (v) => setDraft((d) => ({ ...d, severity: v })))}
                      <Input value={draft.title ?? ''} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Title" />
                    </div>
                    <Input value={draft.detail ?? ''} onChange={(e) => setDraft((d) => ({ ...d, detail: e.target.value }))} placeholder="Detail" />
                    <div className="flex items-center gap-2">
                      <Button variant="accent" size="sm" disabled={busy} onClick={() => saveEdit(r.id)}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="h-3.5 w-3.5" /> Save</>}</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /> Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-muted-foreground">{r.code}</span>
                        <SeverityPill severity={r.severity} />
                        <span className="text-sm font-medium">{r.title}</span>
                      </div>
                      {r.detail && <p className="text-xs text-muted-foreground mt-1">{r.detail}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => toggleActive(r)} title={r.active ? 'Switch off' : 'Switch on'}
                        className={`text-xs px-2 py-1 rounded ${r.active ? 'text-success' : 'text-muted-foreground'} hover:bg-muted`}>
                        {r.active ? 'On' : 'Off'}
                      </button>
                      <button type="button" onClick={() => startEdit(r)} className="text-muted-foreground hover:text-foreground p-1" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => deleteRule(r.id)} className="text-muted-foreground hover:text-destructive p-1" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </PageShell>
  )
}
