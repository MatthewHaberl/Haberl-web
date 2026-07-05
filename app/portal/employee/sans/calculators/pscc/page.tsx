import Link from 'next/link'
import { ChevronLeft, PlugZap } from 'lucide-react'
import { PageHeader } from '@/components/layout/page'
import { PsccCalculator } from '@/components/sans/PsccCalculator'

export default function PsccPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/portal/employee/sans/calculators" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All calculators
      </Link>
      <PageHeader
        title="Prospective Short-Circuit Current"
        description="§8.4 — transformer + supply-cable calculation with table D.1 impedance, Amendment 3 source summation, and the switchgear-rating check."
        icon={PlugZap}
      />
      <PsccCalculator />
    </div>
  )
}
