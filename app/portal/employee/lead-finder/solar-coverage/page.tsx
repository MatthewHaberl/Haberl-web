import { requireSection } from '@/lib/auth/permissions'
import { SolarCoverageTester } from './SolarCoverageTester'

export default async function SolarCoveragePage() {
  await requireSection('lead_finder')
  return <SolarCoverageTester />
}
