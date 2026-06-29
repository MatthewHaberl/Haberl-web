import { requireSection } from '@/lib/auth/permissions'
import { AreaRoofScanner } from './AreaRoofScanner'

export default async function AreaScanPage() {
  await requireSection('lead_finder')
  return <AreaRoofScanner />
}
