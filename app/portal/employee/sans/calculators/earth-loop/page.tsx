import Link from 'next/link'
import { ChevronLeft, Waves } from 'lucide-react'
import { PageHeader } from '@/components/layout/page'
import { EarthLoopCalculator } from '@/components/sans/EarthLoopCalculator'

export default function EarthLoopPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/portal/employee/sans/calculators" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All calculators
      </Link>
      <PageHeader
        title="Earth-Fault Loop Impedance"
        description="§8.6.5 at the main switch — will a bolted earth fault actually trip the main device instantaneously? Zs ≤ U₀ ÷ (curve multiple × In), plus the neutral-loop sanity check."
        icon={Waves}
      />
      <EarthLoopCalculator />
    </div>
  )
}
