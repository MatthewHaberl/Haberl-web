'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { conduitFill, C_VALUES } from '@/lib/sans/tables/conduit-fill'

const SIZES = Object.keys(C_VALUES).map(Number).sort((a, b) => a - b)

/** Mixed-size conduit sizing per 6.5.6.2.2 (ΣC ≤ K), Annex F method. */
export function ConduitFillCalculator() {
  const [lines, setLines] = useState([
    { size: '4', count: '2' },
    { size: '2.5', count: '4' },
  ])

  const result = useMemo(() => {
    const parsed = lines
      .map((l) => ({ size: parseFloat(l.size), count: parseInt(l.count) || 0 }))
      .filter((l) => l.size && l.count > 0)
    if (!parsed.length) return null
    return conduitFill(parsed)
  }, [lines])

  function update(i: number, key: 'size' | 'count', value: string) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [key]: value } : l)))
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium text-foreground">Conductors in the conduit</p>
        <p className="text-xs text-muted-foreground">
          Count every single-core cable and bare earth conductor separately — a 2-core circuit with
          earth is 3 conductors.
        </p>
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select value={l.size} onChange={(e) => update(i, 'size', e.target.value)} aria-label="Conductor size">
              {SIZES.map((s) => (
                <option key={s} value={String(s)}>{s} mm² (C = {C_VALUES[s]})</option>
              ))}
            </Select>
            <Input
              type="number" min="1" max="40" value={l.count} aria-label="Count"
              onChange={(e) => update(i, 'count', e.target.value)}
              className="w-24 shrink-0" trailingText="×"
            />
            <button
              type="button"
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
              aria-label="Remove line"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((ls) => [...ls, { size: '2.5', count: '1' }])}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-accent"
        >
          <Plus className="h-4 w-4" /> Add conductor size
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {result && 'error' in result && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-muted-foreground">{result.error}</div>
        )}
        {result && !('error' in result) && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Σ C (table 6.23)</p>
                <p className="mt-1 text-3xl font-bold text-primary">{result.totalC}</p>
                <p className="text-sm text-muted-foreground">must not exceed the conduit&apos;s K</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conduit required</p>
                <p className={`mt-1 text-3xl font-bold ${result.recommended ? 'text-primary' : 'text-destructive'}`}>
                  {result.recommended ? `${result.recommended} mm` : 'Too full'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {result.recommended ? `K = ${result.utilization.find((u) => u.diameter === result.recommended)?.k}` : 'split across more than one conduit'}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fill per conduit size (table 6.24)</p>
              <div className="flex flex-col gap-1.5">
                {result.utilization.map((u) => (
                  <div key={u.diameter} className="flex items-center gap-3 text-sm">
                    <span className="w-14 font-mono font-semibold text-foreground">{u.diameter} mm</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${u.fits ? 'bg-emerald-500' : 'bg-destructive'}`}
                        style={{ width: `${Math.min(100, u.pct)}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-muted-foreground">{u.pct.toFixed(0)} %</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Method of{' '}
              <Link href="/portal/employee/sans/clause/6.5.6.2.2" className="font-medium text-accent hover:underline">SANS 6.5.6.2.2</Link>{' '}
              (worked examples in{' '}
              <Link href="/portal/employee/sans/clause/F" className="font-medium text-accent hover:underline">Annex F</Link>
              ): every conductor contributes its C value; the conduit&apos;s K must cover the total. The cap
              exists so cables can be drawn in and out without damage —{' '}
              <Link href="/portal/employee/sans/clause/6.5.6.1" className="font-medium text-accent hover:underline">6.5.6.1</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
