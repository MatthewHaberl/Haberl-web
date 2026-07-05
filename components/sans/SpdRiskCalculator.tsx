'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { FormField } from '@/components/ui/form-field'
import { LIGHTNING_TOWNS } from '@/lib/sans/tables/spd-risk'
import { spdRisk, townNg } from '@/lib/sans/spd-risk-calc'
import { VerdictList } from './VerdictList'

/** Annex Q — does this site need surge protection, and what class/rating? */
export function SpdRiskCalculator() {
  const [structure, setStructure] = useState<'residential' | 'commercial'>('residential')
  const [town, setTown] = useState('Johannesburg')
  const [manualNg, setManualNg] = useState('')
  const [environment, setEnvironment] = useState<'rural' | 'suburban' | 'urban'>('suburban')
  const [serviceLine, setServiceLine] = useState('30')
  const [lps, setLps] = useState(false)

  const ngFromTown = useMemo(() => townNg(town), [town])
  const ng = manualNg.trim() !== '' ? parseFloat(manualNg) : ngFromTown ?? NaN

  const result = useMemo(() => {
    return spdRisk({
      structure,
      ng,
      environment,
      serviceLineM: parseFloat(serviceLine) || 0,
      externalLps: lps,
    })
  }, [structure, ng, environment, serviceLine, lps])

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <FormField label="Structure type" htmlFor="spd-structure">
          <Select id="spd-structure" value={structure} onChange={(e) => setStructure(e.target.value as 'residential' | 'commercial')}>
            <option value="residential">Residential (table Q.1.1)</option>
            <option value="commercial">Commercial / industrial (table Q.1.2)</option>
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Town" htmlFor="spd-town"
            hint={ngFromTown != null ? `Ng ${ngFromTown} flashes/km²/yr (table Q.1.3)` : 'Not in table Q.1.3 — enter Ng manually.'}
          >
            <Input id="spd-town" list="spd-towns" value={town} onChange={(e) => setTown(e.target.value)} placeholder="Start typing…" />
            <datalist id="spd-towns">
              {LIGHTNING_TOWNS.map((t) => (
                <option key={t.town} value={t.town}>{`Ng ${t.ng}`}</option>
              ))}
            </datalist>
          </FormField>
          <FormField label="Ng override" htmlFor="spd-ng" hint="From SANS 10313 if you have it.">
            <Input id="spd-ng" type="number" min="0" step="0.1" value={manualNg} onChange={(e) => setManualNg(e.target.value)} placeholder="—" />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Environment" htmlFor="spd-env">
            <Select id="spd-env" value={environment} onChange={(e) => setEnvironment(e.target.value as 'rural' | 'suburban' | 'urban')}>
              <option value="rural">Rural (exposed)</option>
              <option value="suburban">Suburban</option>
              <option value="urban">Urban (shielded)</option>
            </Select>
          </FormField>
          <FormField label="Service line" htmlFor="spd-line" hint="Kiosk to point of entry.">
            <Input id="spd-line" type="number" min="0" trailingText="m" value={serviceLine} onChange={(e) => setServiceLine(e.target.value)} />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input type="checkbox" checked={lps} onChange={(e) => setLps(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          External lightning-protection system fitted
        </label>
      </div>

      <div className="flex flex-col gap-4">
        {'error' in result ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-muted-foreground">{result.error}</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verdict</p>
                <p className={`mt-1 text-3xl font-bold ${result.required ? 'text-amber-600' : 'text-primary'}`}>
                  {result.required ? 'SPD needed' : 'Not required'}
                </p>
                <p className="text-sm text-muted-foreground">simplified Annex Q assessment</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Critical length</p>
                <p className="mt-1 text-3xl font-bold text-primary">{result.criticalLengthM ?? '—'} m</p>
                <p className="text-sm text-muted-foreground">service line beyond this ⇒ SPD</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prescription</p>
                <p className="mt-1 text-3xl font-bold text-primary">{result.spdType ?? '—'} ≥ {result.ratingKa ?? '—'} kA</p>
                <p className="text-sm text-muted-foreground">class II in the main DB{lps ? ' + class I' : ''}</p>
              </div>
            </div>
            <VerdictList verdicts={result.verdicts} />
            <p className="text-xs text-muted-foreground">
              Ng values from table Q.1.3 (SANS 10313). SPD installation details — connection types,
              lead lengths, coordination — live in Annex I. Atypical structures need the full
              SANS 62305-2 assessment.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
