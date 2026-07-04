'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/ui/form-field'
import { STANDARD_SIZES, minProtectiveConductor } from '@/lib/sans/tables/earthing'

/** Table 6.25 — minimum protective (earth) conductor size from the phase conductor size. */
export function EarthingCalculator() {
  const [phase, setPhase] = useState('16')

  const result = useMemo(() => minProtectiveConductor(parseFloat(phase)), [phase])

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="rounded-xl border border-border bg-card p-4">
        <FormField label="Phase conductor size" htmlFor="ec-phase">
          <Select id="ec-phase" value={phase} onChange={(e) => setPhase(e.target.value)}>
            {STANDARD_SIZES.map((s) => (
              <option key={s} value={String(s)}>{s} mm²</option>
            ))}
          </Select>
        </FormField>
      </div>
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Minimum earth conductor</p>
            <p className="mt-1 text-3xl font-bold text-primary">{result.exact} mm²</p>
            <p className="text-sm text-muted-foreground">{result.rule}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next standard size</p>
            <p className="mt-1 text-3xl font-bold text-primary">{result.standard ?? '—'} mm²</p>
            <p className="text-sm text-muted-foreground">round up to what you can buy</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Table 6.25 (
          <Link href="/portal/employee/sans/clause/6.12.1" className="font-medium text-accent hover:underline">SANS 6.12.1</Link>
          ). This is the general sizing rule — check the clause for conditions where a calculated
          (adiabatic) size or mechanical-protection minimums apply, and remember bonding conductors
          have their own rules under{' '}
          <Link href="/portal/employee/sans/clause/6.13" className="font-medium text-accent hover:underline">6.13</Link>.
        </p>
      </div>
    </div>
  )
}
