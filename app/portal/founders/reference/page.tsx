import { requireFounder } from '@/lib/founders/access'
import {
  REGISTRATIONS, INSURANCE, LEGAL_DOCUMENTS, SEQUENCE,
  TIER_LABEL, TIER_MEANING, type RegistrationTier,
} from '@/lib/founders/reference'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const TIER_VARIANT: Record<RegistrationTier, 'success' | 'warning' | 'accent'> = {
  must: 'success',
  maybe: 'warning',
  smart: 'accent',
}

export default async function FoundersReferencePage() {
  const ctx = await requireFounder()

  return (
    <div className="flex flex-col gap-10">
      {ctx.me.language !== 'en' && (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Hierdie afdeling is voorlopig net in Engels — die vorm- en
          registrasiename is in elk geval die amptelike Engelse benamings.
        </p>
      )}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary">Registrations you cannot trade without</h2>
          <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
            Statutory means illegal to trade without it. Conditional depends on the work you take on.
            Commercial is not law, but you will lose work without it.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {(Object.keys(TIER_LABEL) as RegistrationTier[]).map((tier) => (
            <span key={tier} className="flex items-center gap-1.5">
              <Badge variant={TIER_VARIANT[tier]}>{TIER_LABEL[tier]}</Badge>
              {TIER_MEANING[tier]}
            </span>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Registration</th>
                <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Body</th>
                <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">When</th>
                <th className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {REGISTRATIONS.map((r) => (
                <tr key={r.name} className="border-b border-border last:border-b-0 align-top">
                  <td className={cn('px-4 py-3', r.tier === 'must' && 'border-l-4 border-l-success')}>
                    <span className="font-semibold text-foreground">{r.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{r.detail}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.body}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.when}</td>
                  <td className="px-4 py-3">
                    <Badge variant={TIER_VARIANT[r.tier]}>{r.tierLabel}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Card>
          <CardContent className="py-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Insurance to price on day one
            </h3>
            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
              {INSURANCE.map((i) => <li key={i} className="my-1">{i}</li>)}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary">Documents to have drawn</h2>
          <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
            Contracts are for the divorce, not the marriage. The first four are drawn by a commercial
            attorney before you trade; the rest can start as templates.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {LEGAL_DOCUMENTS.map((d) => (
            <Card key={d.title}>
              <CardContent className="py-4">
                <h3 className="font-semibold text-foreground">{d.title}</h3>
                <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">{d.who}</p>
                <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground">
                  {d.items.map((i) => <li key={i} className="my-1">{i}</li>)}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-primary">The order to do it in</h2>
        <div className="flex flex-col">
          {SEQUENCE.map((p) => (
            <div key={p.title} className="grid gap-2 border-b border-border py-4 last:border-b-0 sm:grid-cols-[130px_1fr] sm:gap-6">
              <p className="text-xs font-bold uppercase tracking-wider text-accent">{p.when}</p>
              <div>
                <h3 className="font-semibold text-foreground">{p.title}</h3>
                <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                  {p.items.map((i) => <li key={i} className="my-1">{i}</li>)}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
