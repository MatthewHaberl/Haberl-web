import { Handshake } from 'lucide-react'
import { requireFounder } from '@/lib/founders/access'
import { FoundersTabs } from './FoundersTabs'

/**
 * Guard for the whole workbook. Access is membership of
 * `founders_participants` — not a role and not a permissions-matrix section,
 * because this is private between two named people and every admin would
 * otherwise inherit it.
 */
export default async function FoundersLayout({ children }: { children: React.ReactNode }) {
  await requireFounder()

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            Founders&rsquo; workbook · private
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-primary">
            <Handshake className="h-6 w-6 shrink-0 text-accent" />
            Before the Handshake
          </h1>
        </div>
        <FoundersTabs />
      </div>
      {children}
      <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        Nothing here is legal or tax advice. Every threshold, form number and fee is a starting
        point to confirm with your attorney, your accountant, the ECB and the relevant bargaining
        council — South African requirements change.
      </p>
    </div>
  )
}
