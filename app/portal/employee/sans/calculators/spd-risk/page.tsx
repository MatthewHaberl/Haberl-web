import Link from 'next/link'
import { ChevronLeft, ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/layout/page'
import { SpdRiskCalculator } from '@/components/sans/SpdRiskCalculator'

export default function SpdRiskPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/portal/employee/sans/calculators" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All calculators
      </Link>
      <PageHeader
        title="SPD Risk Assessment"
        description="Annex Q simplified method — town lightning density (180 SA towns), environment and service-line length decide whether surge protection is required, and at what class and rating."
        icon={ShieldAlert}
      />
      <SpdRiskCalculator />
    </div>
  )
}
