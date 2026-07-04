import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { PageHeader } from '@/components/layout/page'

function ClauseLink({ refId, children }: { refId: string; children?: React.ReactNode }) {
  return (
    <Link
      href={`/portal/employee/sans/clause/${encodeURIComponent(refId)}`}
      className="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent hover:bg-accent/20"
    >
      {children ?? `SANS ${refId}`}
    </Link>
  )
}

function Card({ title, refs, children }: { title: string; refs: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-foreground">{title}</h2>
        <span className="flex flex-wrap gap-1.5">{refs.map((r) => <ClauseLink key={r} refId={r} />)}</span>
      </div>
      <div className="mt-2 text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

/** Installer quick-reference cards — the numbers you need on a roof, with clause links. */
export default function SansGuidePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Field Guide"
        description="The numbers installers actually need on site, with the clause behind every one. When in doubt, click through and read the letter of the law."
        icon={ClipboardCheck}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Voltage drop limits" refs={['6.2.7', '5.3.2']}>
          <ul className="list-inside list-disc space-y-1">
            <li>Max <strong className="text-foreground">5 %</strong> from point of control to any outlet at design load.</li>
            <li>230 V single-phase: max <strong className="text-foreground">11,5 V</strong> drop.</li>
            <li>400 V three-phase: max <strong className="text-foreground">20 V</strong> drop.</li>
            <li>d.c. circuits (PV strings, battery runs): 5 % of nominal — or the manufacturer&apos;s stricter figure.</li>
          </ul>
          <p className="mt-2">
            <Link href="/portal/employee/sans/calculators/voltage-drop" className="font-medium text-accent hover:underline">
              → Run the voltage-drop calculator
            </Link>
          </p>
        </Card>

        <Card title="Earth conductor sizes (table 6.25)" refs={['6.12.1']}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide">
                  <th className="py-1 pr-4">Phase conductor S</th>
                  <th className="py-1">Min earth conductor</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                <tr><td className="py-1 pr-4">up to 16 mm²</td><td>same as phase (S)</td></tr>
                <tr><td className="py-1 pr-4">16 – 35 mm²</td><td>16 mm²</td></tr>
                <tr><td className="py-1 pr-4">35 – 400 mm²</td><td>half the phase (S/2)</td></tr>
                <tr><td className="py-1 pr-4">400 – 800 mm²</td><td>200 mm²</td></tr>
                <tr><td className="py-1 pr-4">over 800 mm²</td><td>quarter the phase (S/4)</td></tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Small-cable breaker caps (table 6.27)" refs={['6.7.2.1']}>
          <ul className="list-inside list-disc space-y-1">
            <li>1 mm² → max <strong className="text-foreground">10 A</strong> protection</li>
            <li>1,5 mm² → max <strong className="text-foreground">16 A</strong> protection</li>
            <li>2,5 mm² → max <strong className="text-foreground">25 A</strong> protection</li>
          </ul>
          <p className="mt-2">And never rate a breaker above the cable&apos;s corrected capacity — grouping and hot ceilings pull that number down fast.</p>
        </Card>

        <Card title="Derating rules of thumb" refs={['6.2.8', '6.2.9']}>
          <ul className="list-inside list-disc space-y-1">
            <li>Ratings assume <strong className="text-foreground">30 °C</strong> ambient. At 40 °C a PVC cable keeps only 87 % of its rating; at 50 °C, 71 %.</li>
            <li>Bunch 2 circuits in one conduit → <strong className="text-foreground">×0,80</strong>. Four circuits → ×0,65. Nine → ×0,50.</li>
            <li>Spacing cables ≥ 1 diameter apart on a surface keeps you at ×0,90 or better.</li>
          </ul>
          <p className="mt-2">
            <Link href="/portal/employee/sans/calculators/cable-capacity" className="font-medium text-accent hover:underline">
              → Run the capacity calculator
            </Link>
          </p>
        </Card>

        <Card title="PV & alternative supplies — where to look" refs={['7.12', '7.12.2', '7.12.3']}>
          <ul className="list-inside list-disc space-y-1">
            <li><ClauseLink refId="7.12.2" /> — requirements for the alternative source itself.</li>
            <li><ClauseLink refId="7.12.3" /> — earthing and earth-leakage with inverters/UPS/PV.</li>
            <li><ClauseLink refId="7.12.4" /> — overcurrent protection on the alternative supply.</li>
            <li><ClauseLink refId="7.15" /> — d.c. installations (strings, combiners, isolators).</li>
          </ul>
          <p className="mt-2">
            Amendment 3 adds a full PV/battery test report (Annex S), PSCC summation and island-mode
            N-E rules —{' '}
            <Link href="/portal/employee/sans/changes" className="font-medium text-accent hover:underline">see What&apos;s Changing</Link>.
          </p>
        </Card>

        <Card title="Testing & CoC — the chapter 8 trail" refs={['8.5', '8.6', '8.7']}>
          <ul className="list-inside list-disc space-y-1">
            <li><ClauseLink refId="8.5" /> — the visual inspection list before you test.</li>
            <li><ClauseLink refId="8.6" /> — the tests: continuity, insulation resistance, earth loop, polarity, earth-leakage operation.</li>
            <li><ClauseLink refId="8.7" /> — the test report that backs the Certificate of Compliance.</li>
          </ul>
          <p className="mt-2">Under Amendment 3 a generating plant (PV/battery) needs its own Annex S report attached to the CoC.</p>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        More cards land as the remaining tables load (bathroom zones, buried cables, conduit fill, test values).
        These summaries are working aids — the clause text governs.
      </p>
    </div>
  )
}
