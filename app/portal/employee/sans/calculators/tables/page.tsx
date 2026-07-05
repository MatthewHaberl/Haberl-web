import Link from 'next/link'
import { ChevronLeft, Table2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/page'
import { VD_CABLE_TYPES } from '@/lib/sans/tables/voltage-drop'
import { CC_CABLE_TYPES } from '@/lib/sans/tables/current-capacity'
import { ECC_MAX_RESISTANCE } from '@/lib/sans/tables/earthing'

function fmt(v: number | { r: number; x: number; z: number } | null): string {
  if (v == null) return '—'
  if (typeof v === 'number') return String(v).replace('.', ',')
  return String(v.z).replace('.', ',')
}

/** The raw lookup tables for people who want to read the numbers, not type inputs. */
export default function SansTablesPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <Link href="/portal/employee/sans/calculators" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> All calculators
        </Link>
        <PageHeader
          title="Reference Tables"
          description="The loaded SANS tables at a glance — ampacity at 30 °C, voltage drop (z, worst case) at 70 °C conductor temperature, ECC test limits. For power-factor-adjusted values and derating, use the calculators."
          icon={Table2}
        />
      </div>

      {CC_CABLE_TYPES.map((cable) => (
        <div key={cable.id} className="overflow-x-auto rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Table {cable.table} — {cable.label} — current-carrying capacity (A)
          </h2>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3">mm²</th>
                {cable.arrangements.map((a) => (
                  <th key={a.id} className="py-1 pr-3">{a.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-foreground">
              {cable.rows.map((r) => (
                <tr key={r.size} className="border-b border-border/40">
                  <td className="py-1 pr-3 font-mono font-semibold">{String(r.size).replace('.', ',')}</td>
                  {cable.arrangements.map((a) => (
                    <td key={a.id} className="py-1 pr-3">{r.values[a.id] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {VD_CABLE_TYPES.map((cable) => (
        <div key={cable.id} className="overflow-x-auto rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Table {cable.table} — {cable.label} — voltage drop (mV/A/m, z)
          </h2>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-1 pr-3">mm²</th>
                {cable.arrangements.map((a) => (
                  <th key={a.id} className="py-1 pr-3">{a.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-foreground">
              {cable.rows.map((r) => (
                <tr key={r.size} className="border-b border-border/40">
                  <td className="py-1 pr-3 font-mono font-semibold">{String(r.size).replace('.', ',')}</td>
                  {cable.arrangements.map((a) => (
                    <td key={a.id} className="py-1 pr-3">{fmt(r.values[a.id])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="max-w-md overflow-x-auto rounded-xl border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Table 8.1 — max earth-continuity resistance (Ω)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3">Protective device (A)</th>
              <th className="py-1">Max resistance (Ω)</th>
            </tr>
          </thead>
          <tbody className="text-foreground">
            {ECC_MAX_RESISTANCE.map((r) => (
              <tr key={r.ratedA} className="border-b border-border/40">
                <td className="py-1 pr-3 font-mono font-semibold">{r.ratedA}</td>
                <td className="py-1">{r.maxOhm.toFixed(3).replace('.', ',')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Transcribed from SANS 10142-1:2024 Ed 3.2, arithmetically verified in tests, and cross-checked
        against an independent second transcription. Buried-cable ratings (table 6.8) carry their own
        soil-based correction factors (6.11/6.12) — the air derating factors do not apply to them.
      </p>
    </div>
  )
}
