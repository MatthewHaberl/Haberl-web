'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/ui/form-field'
import { CC_CABLE_TYPES } from '@/lib/sans/tables/current-capacity'
import { GROUPING_SCENARIOS } from '@/lib/sans/tables/correction-factors'
import { cableCapacity } from '@/lib/sans/calculators'
import { VerdictList } from './VerdictList'

/** Corrected current-carrying capacity: base table × ambient (6.10) × grouping (6.14), checked against load + breaker. */
export function CableCapacityCalculator() {
  const [cableTypeId, setCableTypeId] = useState(CC_CABLE_TYPES[1].id)
  const [arrangementId, setArrangementId] = useState(CC_CABLE_TYPES[1].arrangements[4].id)
  const [size, setSize] = useState('2.5')
  const [ambient, setAmbient] = useState('30')
  const [scenarioId, setScenarioId] = useState('')
  const [circuits, setCircuits] = useState('1')
  const [designCurrent, setDesignCurrent] = useState('20')
  const [breaker, setBreaker] = useState('20')

  const cable = CC_CABLE_TYPES.find((c) => c.id === cableTypeId) ?? CC_CABLE_TYPES[0]
  const arrangement = cable.arrangements.find((a) => a.id === arrangementId) ?? cable.arrangements[0]

  function onCableType(id: string) {
    setCableTypeId(id)
    const next = CC_CABLE_TYPES.find((c) => c.id === id)!
    if (!next.arrangements.some((a) => a.id === arrangementId)) setArrangementId(next.arrangements[0].id)
    if (!next.rows.some((r) => r.size === parseFloat(size))) setSize(String(next.rows[0].size))
  }

  const result = useMemo(() => {
    const n = Math.max(1, parseInt(circuits) || 1)
    const inputs = {
      cableTypeId,
      arrangementId: arrangement.id,
      sizeMm2: parseFloat(size),
      ambientC: parseFloat(ambient) || 30,
      groupingScenarioId: n > 1 && scenarioId ? scenarioId : null,
      circuits: n,
      designCurrent: parseFloat(designCurrent) || 0,
      breakerRating: parseFloat(breaker) || 0,
    }
    if (!inputs.sizeMm2) return null
    return cableCapacity(inputs)
  }, [cableTypeId, arrangement.id, size, ambient, scenarioId, circuits, designCurrent, breaker])

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <FormField label="Cable type" htmlFor="cc-cable">
          <Select id="cc-cable" value={cableTypeId} onChange={(e) => onCableType(e.target.value)}>
            {CC_CABLE_TYPES.filter((c) => !c.buried).map((c) => (
              <option key={c.id} value={c.id}>{c.label} — table {c.table}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Installation & cores" htmlFor="cc-arr">
          <Select id="cc-arr" value={arrangement.id} onChange={(e) => setArrangementId(e.target.value)}>
            {cable.arrangements.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Conductor size" htmlFor="cc-size">
          <Select id="cc-size" value={size} onChange={(e) => setSize(e.target.value)}>
            {cable.rows.map((r) => (
              <option key={r.size} value={String(r.size)} disabled={r.values[arrangement.id] == null}>
                {r.size} mm²{r.values[arrangement.id] == null ? ' — n/a' : ''}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Ambient temp" htmlFor="cc-ambient" hint="Ratings assume 30 °C — hot roof spaces derate hard.">
            <Input id="cc-ambient" type="number" min="10" max="65" trailingText="°C" value={ambient} onChange={(e) => setAmbient(e.target.value)} />
          </FormField>
          <FormField label="Circuits grouped" htmlFor="cc-n">
            <Input id="cc-n" type="number" min="1" max="20" value={circuits} onChange={(e) => setCircuits(e.target.value)} />
          </FormField>
        </div>
        {parseInt(circuits) > 1 && (
          <FormField label="Grouping arrangement (table 6.14)" htmlFor="cc-group">
            <Select id="cc-group" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
              <option value="">— choose the arrangement —</option>
              {GROUPING_SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </FormField>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Design current" htmlFor="cc-load">
            <Input id="cc-load" type="number" min="0" trailingText="A" value={designCurrent} onChange={(e) => setDesignCurrent(e.target.value)} />
          </FormField>
          <FormField label="Breaker rating" htmlFor="cc-breaker">
            <Input id="cc-breaker" type="number" min="0" trailingText="A" value={breaker} onChange={(e) => setBreaker(e.target.value)} />
          </FormField>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {result && 'error' in result && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-muted-foreground">{result.error}</div>
        )}
        {result && !('error' in result) && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base rating</p>
                <p className="mt-1 text-3xl font-bold text-primary">{result.baseCapacity} A</p>
                <p className="text-sm text-muted-foreground">table {result.tableRef} @ 30 °C</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correction</p>
                <p className="mt-1 text-3xl font-bold text-primary">× {(result.ambientCf * result.groupingCf).toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">{result.ambientCf} ambient · {result.groupingCf} grouping</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Corrected capacity</p>
                <p className="mt-1 text-3xl font-bold text-primary">{result.deratedCapacity.toFixed(1)} A</p>
                <p className="text-sm text-muted-foreground">what the cable may carry here</p>
              </div>
            </div>
            <VerdictList verdicts={result.verdicts} />
          </>
        )}
      </div>
    </div>
  )
}
