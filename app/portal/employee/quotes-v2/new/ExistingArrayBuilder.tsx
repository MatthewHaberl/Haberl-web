'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'

export interface ArrayString {
  id: string
  panels: number
  watt: number
  orientation: string
  mppt: number
}

const ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'Flat']
const OPPOSITE: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E', NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW' }

interface Flag {
  severity: 'block' | 'warn'
  code: string
  message: string
}

// Live rule checks against the entered strings (mirrors audit rules ARR-01/02).
export function checkArray(strings: ArrayString[]): Flag[] {
  const flags: Flag[] = []
  const byMppt = new Map<number, ArrayString[]>()
  for (const s of strings) {
    const arr = byMppt.get(s.mppt) ?? []
    arr.push(s)
    byMppt.set(s.mppt, arr)
  }
  for (const [mppt, group] of [...byMppt.entries()].sort((a, b) => a[0] - b[0])) {
    const orients = [...new Set(group.map((s) => s.orientation).filter(Boolean))]
    if (orients.length > 1) {
      const opposing = orients.some((o) => OPPOSITE[o] && orients.includes(OPPOSITE[o]))
      flags.push({
        severity: 'warn',
        code: 'ARR-01',
        message: `MPPT ${mppt}: ${opposing ? 'opposing' : 'mixed'} orientations (${orients.join(' + ')}) — current mismatch. Split onto separate MPPTs.`,
      })
    }
    if (group.length > 1) {
      const counts = [...new Set(group.map((s) => s.panels).filter((n) => n > 0))]
      if (counts.length > 1) {
        flags.push({
          severity: 'block',
          code: 'ARR-02',
          message: `MPPT ${mppt}: unequal parallel strings (${group.map((s) => s.panels).join(' + ')}) — equalise the panel counts.`,
        })
      }
    }
  }
  return flags
}

interface Props {
  value: ArrayString[]
  onChange: (v: ArrayString[]) => void
}

export function ExistingArrayBuilder({ value, onChange }: Props) {
  const flags = checkArray(value)

  function addString() {
    onChange([...value, { id: crypto.randomUUID(), panels: 0, watt: 550, orientation: 'N', mppt: 1 }])
  }
  function update(id: string, patch: Partial<ArrayString>) {
    onChange(value.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }
  function remove(id: string) {
    onChange(value.filter((s) => s.id !== id))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Existing PV strings</span>
        <Button type="button" variant="outline" size="sm" onClick={addString}>
          <Plus className="h-3.5 w-3.5" /> Add string
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground italic border border-dashed border-border rounded-md px-3 py-4 text-center">
          Add the existing strings to check the configuration.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_1fr_1.2fr_0.8fr_auto] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-1">
            <span>Panels</span><span>Watt</span><span>Facing</span><span>MPPT</span><span />
          </div>
          {value.map((s) => (
            <div key={s.id} className="grid grid-cols-[1fr_1fr_1.2fr_0.8fr_auto] gap-2 items-center">
              <Input type="number" min="0" value={s.panels || ''} onChange={(e) => update(s.id, { panels: parseInt(e.target.value) || 0 })} className="h-9" placeholder="e.g. 6" />
              <Input type="number" min="0" value={s.watt || ''} onChange={(e) => update(s.id, { watt: parseInt(e.target.value) || 0 })} className="h-9" placeholder="W" />
              <select value={s.orientation} onChange={(e) => update(s.id, { orientation: e.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                {ORIENTATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <Input type="number" min="1" value={s.mppt || ''} onChange={(e) => update(s.id, { mppt: parseInt(e.target.value) || 1 })} className="h-9" />
              <button type="button" onClick={() => remove(s.id)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}

      {value.length > 0 && (
        flags.length === 0 ? (
          <div className="flex items-center gap-2 text-sm rounded-md px-3 py-2" style={{ background: '#dcfce7', color: '#15803d' }}>
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Configuration looks good — no issues flagged.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {flags.map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-sm rounded-md px-3 py-2"
                style={f.severity === 'block' ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#fef3c7', color: '#b45309' }}>
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span><span className="font-mono text-xs font-bold">{f.code}</span> · {f.message}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
