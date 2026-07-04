'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/ui/form-field'
import { VD_CABLE_TYPES } from '@/lib/sans/tables/voltage-drop'
import { voltageDrop } from '@/lib/sans/calculators'
import { VerdictList } from './VerdictList'

/** Interactive §6.2.7 voltage-drop check — table values, all cases, clause-cited verdicts. */
export function VoltageDropCalculator() {
  const [cableTypeId, setCableTypeId] = useState(VD_CABLE_TYPES[0].id)
  const [arrangementId, setArrangementId] = useState(VD_CABLE_TYPES[0].arrangements[1].id)
  const [size, setSize] = useState('2.5')
  const [current, setCurrent] = useState('20')
  const [length, setLength] = useState('25')
  const [pf, setPf] = useState('1')
  const [voltage, setVoltage] = useState('230')
  const [limit, setLimit] = useState('5')

  const cable = VD_CABLE_TYPES.find((c) => c.id === cableTypeId) ?? VD_CABLE_TYPES[0]
  const arrangement = cable.arrangements.find((a) => a.id === arrangementId) ?? cable.arrangements[0]

  function onCableType(id: string) {
    setCableTypeId(id)
    const next = VD_CABLE_TYPES.find((c) => c.id === id)!
    if (!next.arrangements.some((a) => a.id === arrangementId)) setArrangementId(next.arrangements[0].id)
  }

  function onArrangement(id: string) {
    setArrangementId(id)
    const arr = cable.arrangements.find((a) => a.id === id)
    if (arr?.phases === 3 && voltage === '230') setVoltage('400')
    if (arr?.phases === 1 && voltage === '400') setVoltage('230')
  }

  const result = useMemo(() => {
    const inputs = {
      cableTypeId,
      arrangementId: arrangement.id,
      sizeMm2: parseFloat(size),
      current: parseFloat(current),
      lengthM: parseFloat(length),
      powerFactor: Math.min(1, Math.max(0.1, parseFloat(pf) || 1)),
      nominalVoltage: parseFloat(voltage),
      limitPercent: parseFloat(limit) || 5,
    }
    if (!inputs.sizeMm2 || !inputs.current || !inputs.lengthM || !inputs.nominalVoltage) return null
    return voltageDrop(inputs)
  }, [cableTypeId, arrangement.id, size, current, length, pf, voltage, limit])

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <FormField label="Cable type" htmlFor="vd-cable">
          <Select id="vd-cable" value={cableTypeId} onChange={(e) => onCableType(e.target.value)}>
            {VD_CABLE_TYPES.map((c) => (
              <option key={c.id} value={c.id}>{c.label} — table {c.table}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Circuit & installation" htmlFor="vd-arr">
          <Select id="vd-arr" value={arrangement.id} onChange={(e) => onArrangement(e.target.value)}>
            {cable.arrangements.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Conductor size" htmlFor="vd-size">
          <Select id="vd-size" value={size} onChange={(e) => setSize(e.target.value)}>
            {cable.rows.map((r) => (
              <option key={r.size} value={String(r.size)} disabled={r.values[arrangement.id] == null}>
                {r.size} mm²{r.values[arrangement.id] == null ? ' — n/a' : ''}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Load current" htmlFor="vd-current">
            <Input id="vd-current" type="number" min="0" step="0.1" trailingText="A" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </FormField>
          <FormField label="Route length" htmlFor="vd-length" hint="One-way; return path is in the table values.">
            <Input id="vd-length" type="number" min="0" step="0.5" trailingText="m" value={length} onChange={(e) => setLength(e.target.value)} />
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Voltage" htmlFor="vd-voltage">
            <Input id="vd-voltage" type="number" min="12" trailingText="V" value={voltage} onChange={(e) => setVoltage(e.target.value)} />
          </FormField>
          {arrangement.phases !== 0 && (
            <FormField label="Power factor" htmlFor="vd-pf" hint="1 = worst-case r; else r·cosφ + x·sinφ.">
              <Input id="vd-pf" type="number" min="0.1" max="1" step="0.05" value={pf} onChange={(e) => setPf(e.target.value)} />
            </FormField>
          )}
          <FormField label="Limit" htmlFor="vd-limit" hint="5 % default; tighten for PV DC budgets.">
            <Input id="vd-limit" type="number" min="0.5" max="10" step="0.5" trailingText="%" value={limit} onChange={(e) => setLimit(e.target.value)} />
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
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Voltage drop</p>
                <p className={`mt-1 text-3xl font-bold ${result.dropPercent > result.limitPercent ? 'text-destructive' : 'text-primary'}`}>
                  {result.dropVolts.toFixed(2)} V
                </p>
                <p className="text-sm text-muted-foreground">{result.dropPercent.toFixed(2)} % of nominal</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Table value</p>
                <p className="mt-1 text-3xl font-bold text-primary">{result.mvPerAm.toFixed(2)}</p>
                <p className="text-sm text-muted-foreground">mV/A/m — table {result.tableRef}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Max run at this load</p>
                <p className="mt-1 text-3xl font-bold text-primary">{result.maxLengthAtLimit.toFixed(0)} m</p>
                <p className="text-sm text-muted-foreground">at the {result.limitPercent} % limit</p>
              </div>
            </div>
            <VerdictList verdicts={result.verdicts} />
            <p className="text-xs text-muted-foreground">
              Vd = mV/A/m × I × L ÷ 1000. Values assume conductors at 70 °C operating temperature.
              Single-phase table values already include the return conductor.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
