import Link from 'next/link'
import { ChevronLeft, Zap } from 'lucide-react'
import { PageHeader } from '@/components/layout/page'
import { VoltageDropCalculator } from '@/components/sans/VoltageDropCalculator'

export default function VoltageDropPage() {
  return (
    <div className="flex flex-col gap-6">
      <Link href="/portal/employee/sans/calculators" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All calculators
      </Link>
      <PageHeader
        title="Voltage Drop"
        description="SANS 10142-1 §6.2.7 — tabulated mV/A/m values at 70 °C, with the 5 % limit and the 11,5 V / 20 V caps checked automatically."
        icon={Zap}
      />
      <VoltageDropCalculator />
    </div>
  )
}
