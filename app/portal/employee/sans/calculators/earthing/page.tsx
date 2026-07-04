import Link from 'next/link'
import { ChevronLeft, Earth } from 'lucide-react'
import { PageHeader } from '@/components/layout/page'
import { EarthingCalculator } from '@/components/sans/EarthingCalculator'

export default function EarthingPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/portal/employee/sans/calculators" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All calculators
      </Link>
      <PageHeader
        title="Earth Conductor Sizing"
        description="Table 6.25 — the minimum protective-conductor cross-section for a given phase conductor."
        icon={Earth}
      />
      <EarthingCalculator />
    </div>
  )
}
