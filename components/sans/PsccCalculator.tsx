'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/ui/form-field'
import { CONDUCTOR_IMPEDANCE } from '@/lib/sans/tables/conductor-impedance'
import { pscc } from '@/lib/sans/pscc'
import { VerdictList } from './VerdictList'

/** §8.4 PSCC from transformer + supply cable, with Amdt 3 source summation and a switchgear-rating check. */
export function PsccCalculator() {
  const [voltage, setVoltage] = useState('400')
  const [kva, setKva] = useState('500')
  const [zPct, setZPct] = useState('4.5')
  const [useCable, setUseCable] = useState(true)
  const [size, setSize] = useState('95')
  const [length, setLength] = useState('50')
  const [material, setMaterial] = useState<'cu' | 'al'>('cu')
  const [sources, setSources] = useState('0')
  const [switchgear, setSwitchgear] = useState('10')

  const result = useMemo(() => {
    return pscc({
      voltage: parseFloat(voltage) || 0,
      transformerKva: parseFloat(kva) || 0,
      transformerZPercent: parseFloat(zPct) || 0,
      cable: useCable
        ? { sizeMm2: parseFloat(size), lengthM: parseFloat(length) || 0, material }
        : null,
      parallelSourcesKa: parseFloat(sources) || 0,
      switchgearKa: parseFloat(switchgear) || 0,
    })
  }, [voltage, kva, zPct, useCable, size, length, material, sources, switchgear])

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Voltage (φ-φ)" htmlFor="ps-v">
            <Input id="ps-v" type="number" min="100" trailingText="V" value={voltage} onChange={(e) => setVoltage(e.target.value)} />
          </FormField>
          <FormField label="Transformer" htmlFor="ps-kva">
            <Input id="ps-kva" type="number" min="10" trailingText="kVA" value={kva} onChange={(e) => setKva(e.target.value)} />
          </FormField>
          <FormField label="Impedance" htmlFor="ps-z" hint="From the transformer nameplate.">
            <Input id="ps-z" type="number" min="1" max="15" step="0.1" trailingText="Z%" value={zPct} onChange={(e) => setZPct(e.target.value)} />
          </FormField>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input type="checkbox" checked={useCable} onChange={(e) => setUseCable(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Include the supply cable (8.4.5, table D.1)
        </label>
        {useCable && (
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Conductor" htmlFor="ps-size">
              <Select id="ps-size" value={size} onChange={(e) => setSize(e.target.value)}>
                {CONDUCTOR_IMPEDANCE.filter((r) => (material === 'cu' ? r.rAcCu : r.rAcAl) != null).map((r) => (
                  <option key={r.size} value={String(r.size)}>{r.size} mm²</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Material" htmlFor="ps-mat">
              <Select id="ps-mat" value={material} onChange={(e) => setMaterial(e.target.value as 'cu' | 'al')}>
                <option value="cu">Copper</option>
                <option value="al">Aluminium</option>
              </Select>
            </FormField>
            <FormField label="Length" htmlFor="ps-len">
              <Input id="ps-len" type="number" min="0" trailingText="m" value={length} onChange={(e) => setLength(e.target.value)} />
            </FormField>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Paralleled sources" htmlFor="ps-src" hint="Amdt 3: PV/battery/generator PSCC contributions, summed.">
            <Input id="ps-src" type="number" min="0" step="0.1" trailingText="kA" value={sources} onChange={(e) => setSources(e.target.value)} />
          </FormField>
          <FormField label="Switchgear rating" htmlFor="ps-sw" hint="Board/device short-circuit rating.">
            <Input id="ps-sw" type="number" min="0" step="0.5" trailingText="kA" value={switchgear} onChange={(e) => setSwitchgear(e.target.value)} />
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
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PSCC (3φ)</p>
                <p className="mt-1 text-3xl font-bold text-primary">{(result.pscc3phA / 1000).toFixed(1)} kA</p>
                <p className="text-sm text-muted-foreground">1φ ≈ {(result.pscc1phA / 1000).toFixed(1)} kA</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Z total</p>
                <p className="mt-1 text-3xl font-bold text-primary">{result.zTotal.toFixed(4)} Ω</p>
                <p className="text-sm text-muted-foreground">{result.zTransformer.toFixed(4)} tx + {result.zConductor.toFixed(4)} cable</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Incl. paralleled sources</p>
                <p className="mt-1 text-3xl font-bold text-primary">{(result.totalWithSourcesA / 1000).toFixed(1)} kA</p>
                <p className="text-sm text-muted-foreground">what the switchgear must withstand</p>
              </div>
            </div>
            <VerdictList verdicts={result.verdicts} />
            <p className="text-xs text-muted-foreground">
              Calculation per 8.4.3–8.4.5 with table D.1 conductor impedance — conservative by design.
              On site, a fault-current meter at the point of control is the definitive measurement (8.4.2);
              don&apos;t connect it above its rating.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
