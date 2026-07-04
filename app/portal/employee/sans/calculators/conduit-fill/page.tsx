import Link from 'next/link'
import { ChevronLeft, Ruler } from 'lucide-react'
import { PageHeader } from '@/components/layout/page'
import { ConduitFillCalculator } from '@/components/sans/ConduitFillCalculator'

export default function ConduitFillPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/portal/employee/sans/calculators" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All calculators
      </Link>
      <PageHeader
        title="Conduit Fill"
        description="How many cables fit the pipe — tables 6.22–6.24 (ΣC ≤ K method), with worked examples in Annex F."
        icon={Ruler}
      />
      <ConduitFillCalculator />
    </div>
  )
}
