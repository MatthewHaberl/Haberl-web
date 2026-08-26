import { requireFounder } from '@/lib/founders/access'

/**
 * Guard for the Amperage Electrical board.
 *
 * Same gate as the founders' workbook: membership of `founders_participants` IS
 * the permission. This is the private workspace of two named people, so it is
 * deliberately not wired to the role/section matrix — every admin on the portal
 * would otherwise inherit it.
 */
export default async function AmperageLayout({ children }: { children: React.ReactNode }) {
  await requireFounder()
  return <>{children}</>
}
