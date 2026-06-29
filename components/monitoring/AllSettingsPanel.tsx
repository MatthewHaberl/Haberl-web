'use client'

import { useEffect, useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import { ChevronDown, ChevronRight, Search, TrendingUp, History, Loader2, ListFilter } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  getSettingsCatalog, knownKeys, decodeValue, rawNumber, isNumericField,
  type CatalogField,
} from '@/lib/monitoring/settings/sunsynk-catalog'

interface Snapshot {
  id: string
  captured_at: string
  source: string
  raw_payload: Record<string, unknown> | null
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-ZA', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
}

export function AllSettingsPanel({ systemId, brand, brandLabel }: { systemId: string; brand: string; brandLabel: string }) {
  const [history, setHistory] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    fetch(`/api/monitoring/systems/${systemId}/settings/history`)
      .then((r) => r.json())
      .then((d: Snapshot[]) => setHistory(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [systemId])

  const latest = history.length ? history[history.length - 1] : null
  const raw = useMemo(() => (latest?.raw_payload ?? {}) as Record<string, unknown>, [latest])
  const catalog = useMemo(() => getSettingsCatalog(brand), [brand])
  const known = useMemo(() => knownKeys(brand), [brand])

  const otherKeys = useMemo(
    () => Object.keys(raw).filter((k) => !known.has(k)).sort(),
    [raw, known],
  )

  const q = search.trim().toLowerCase()
  const matches = (label: string, key: string) =>
    !q || label.toLowerCase().includes(q) || key.toLowerCase().includes(q)

  // Numeric series for a key across all snapshots (for plotting).
  function series(key: string) {
    return history
      .map((s) => ({ t: s.captured_at, v: rawNumber((s.raw_payload ?? {})[key]) }))
      .filter((p): p is { t: string; v: number } => p.v !== null)
  }

  // Distinct value steps over time (for the change-log). First entry = initial.
  function changeLog(field: CatalogField) {
    const out: { t: string; v: string }[] = []
    let prev: string | undefined
    for (const s of history) {
      const v = decodeValue(field, (s.raw_payload ?? {})[field.key])
      if (v !== prev) { out.push({ t: s.captured_at, v }); prev = v }
    }
    return out
  }

  function toggleGroup(g: string) {
    setCollapsed((c) => { const n = new Set(c); if (n.has(g)) n.delete(g); else n.add(g); return n })
  }

  function FieldRow({ field }: { field: CatalogField }) {
    const value = decodeValue(field, raw[field.key])
    const log = changeLog(field)
    const numeric = isNumericField(field)
    const expandable = numeric ? series(field.key).length > 1 : log.length > 1
    const open = openKey === field.key
    return (
      <div className="border-b border-border last:border-0">
        <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
          <span className="text-muted-foreground">{field.label}</span>
          <div className="flex items-center gap-2">
            {log.length > 1 && (
              <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning" title={`Last changed ${fmtDateTime(log[log.length - 1].t)}`}>
                changed
              </span>
            )}
            <span className="font-mono tabular-nums">{value}</span>
            {expandable && (
              <button
                type="button" aria-label="History"
                onClick={() => setOpenKey(open ? null : field.key)}
                className="rounded border border-border p-1 hover:bg-muted"
              >
                {numeric ? <TrendingUp className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
        {open && (
          <div className="pb-3">
            {numeric ? (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={series(field.key)} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="t" tickFormatter={fmtDate} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} width={48} unit={field.unit ? ` ${field.unit}` : ''} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    labelFormatter={(t) => fmtDateTime(String(t))}
                    formatter={(v) => [`${Number(v).toLocaleString('en-ZA')}${field.unit ? ` ${field.unit}` : ''}`, field.label]}
                  />
                  <Line type="stepAfter" dataKey="v" stroke="#06b6d4" strokeWidth={1.5} dot />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ul className="space-y-1 rounded-md border border-border bg-muted/30 p-2 text-xs">
                {log.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{fmtDateTime(c.t)}</span>
                    <span className="font-mono">{c.v}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ListFilter className="h-4 w-4" /> All settings</CardTitle>
        <CardDescription>
          Every parameter read from the {brandLabel} cloud. Captured automatically once a day —
          open a value to plot or see when it changed.
          {latest && (
            <> {' '}Latest capture {fmtDateTime(latest.captured_at)} · {latest.source} · {history.length} snapshot{history.length === 1 ? '' : 's'}.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading settings…
          </div>
        ) : !latest ? (
          <p className="text-sm text-muted-foreground">
            No settings captured yet. They’re read automatically once a day, or use “Refresh from cloud” above.
          </p>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search settings…"
                className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm"
              />
            </div>
            {history.length === 1 && (
              <p className="text-xs text-muted-foreground">
                Only one capture so far — trend plots fill in as daily snapshots accrue.
              </p>
            )}

            {catalog.map((groupDef) => {
              const fields = groupDef.fields.filter((f) => matches(f.label, f.key) && f.key in raw)
              if (!fields.length) return null
              const isCollapsed = collapsed.has(groupDef.group)
              return (
                <section key={groupDef.group} className="rounded-lg border border-border">
                  <button
                    type="button" onClick={() => toggleGroup(groupDef.group)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-muted/50"
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {groupDef.group}
                    <span className="ml-auto text-xs font-normal text-muted-foreground">{fields.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="px-3 pb-1">
                      {fields.map((f) => <FieldRow key={f.key} field={f} />)}
                    </div>
                  )}
                </section>
              )
            })}

            {/* Anything the catalog doesn't label — still shown, nothing hidden. */}
            {(() => {
              const keys = otherKeys.filter((k) => matches(k, k))
              if (!keys.length) return null
              const isCollapsed = collapsed.has('__other')
              return (
                <section className="rounded-lg border border-border">
                  <button
                    type="button" onClick={() => toggleGroup('__other')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-muted/50"
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    Other (raw)
                    <span className="ml-auto text-xs font-normal text-muted-foreground">{keys.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div className="px-3 pb-1">
                      {keys.map((k) => (
                        <div key={k} className="flex items-center justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
                          <span className="font-mono text-xs text-muted-foreground">{k}</span>
                          <span className="font-mono tabular-nums">{String(raw[k])}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )
            })()}
          </>
        )}
      </CardContent>
    </Card>
  )
}
