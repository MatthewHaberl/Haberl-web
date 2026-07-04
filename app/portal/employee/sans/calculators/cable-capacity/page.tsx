import Link from 'next/link'
import { ChevronLeft, Cable } from 'lucide-react'
import { PageHeader } from '@/components/layout/page'
import { CableCapacityCalculator } from '@/components/sans/CableCapacityCalculator'

export default function CableCapacityPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/portal/employee/sans/calculators" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All calculators
      </Link>
      <PageHeader
        title="Cable Current Capacity"
        description="Base rating from the 6.2(a)–6.4(a) tables, derated for ambient temperature (6.10) and grouping (6.14), then checked against the load and the breaker (§6.7.2.1)."
        icon={Cable}
      />
      <CableCapacityCalculator />
    </div>
  )
}
