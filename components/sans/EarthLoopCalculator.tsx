'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/ui/form-field'
import { TRIP_CURVES, earthLoop } from '@/lib/sans/earth-loop'
import { VerdictList } from './VerdictList'

/** §8.6.5 earth/neutral loop impedance check at the main switch. */
export function EarthLoopCalculator() {
  const [u0, setU0] = useState('230')
  const [rated, setRated] = useState('60')
  const [curveId, setCurveId] = useState(TRIP_CURVES[0].id)
  const [zs, setZs] = useState('0.3')
  const [zn, setZn] = useState('')

  const result = useMemo(() => {
    return earthLoop({
      u0: parseFloat(u0) || 0,
      ratedA: parseFloat(rated) || 0,
      curveId,
      measuredZs: parseFloat(zs) || 0,
      measuredZn: zn.trim() === '' ? null : parseFloat(zn) || 0,
    })
  }, [u0, rated, curveId, zs, zn])

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Voltage to earth" htmlFor="el-u0">
            <Input id="el-u0" type="number" min="50" trailingText="V" value={u0} onChange={(e) => setU0(e.target.value)} />
          </FormField>
          <FormField label="Main device rating" htmlFor="el-in">
            <Input id="el-in" type="number" min="1" trailingText="A" value={rated} onChange={(e) => setRated(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Tripping curve" htmlFor="el-curve" hint="From manufacturer data; the upper band value is used so the trip is guaranteed.">
          <Select id="el-curve" value={curveId} onChange={(e) => setCurveId(e.target.value)}>
            {TRIP_CURVES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Measured earth loop" htmlFor="el-zs">
            <Input id="el-zs" type="number" min="0" step="0.01" trailingText="Ω" value={zs} onChange={(e) => setZs(e.target.value)} />
          </FormField>
          <FormField label="Neutral loop (optional)" htmlFor="el-zn" hint="8.6.5.2 — must not exceed the earth loop.">
            <Input id="el-zn" type="number" min="0" step="0.01" trailingText="Ω" value={zn} onChange={(e) => setZn(e.target.value)} placeholder="—" />
          </FormField>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {'error' in result ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-muted-foreground">{result.error}</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instantaneous trip</p>
                <p className="mt-1 text-3xl font-bold text-primary">{result.tripCurrent.toFixed(0)} A</p>
                <p className="text-sm text-muted-foreground">what the fault must drive</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Max earth loop</p>
                <p className="mt-1 text-3xl font-bold text-primary">{result.maxZs.toFixed(3)} Ω</p>
                <p className="text-sm text-muted-foreground">U₀ ÷ trip current</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fault current at reading</p>
                <p className="mt-1 text-3xl font-bold text-primary">{result.faultCurrentAtZs.toFixed(0)} A</p>
                <p className="text-sm text-muted-foreground">{result.marginPct.toFixed(0)} % of the Zs limit used</p>
              </div>
            </div>
            <VerdictList verdicts={result.verdicts} />
            <p className="text-xs text-muted-foreground">
              Amendment 3 extends 8.6.5 with a main-switch loop-impedance formula, 5-second
              disconnection for devices above 63 A, and a mandatory neutral-loop test — see What&apos;s Changing.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
