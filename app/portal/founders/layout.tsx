import { Handshake } from 'lucide-react'
import { requireFounder } from '@/lib/founders/access'
import { strings } from '@/lib/founders/i18n'
import { FoundersTabs } from './FoundersTabs'
import { LanguageSwitch } from './LanguageSwitch'

/**
 * Guard for the whole workbook. Access is membership of
 * `founders_participants` — not a role and not a permissions-matrix section,
 * because this is private between two named people and every admin would
 * otherwise inherit it.
 */
export default async function FoundersLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireFounder()
  const s = strings(ctx.me.language)

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            {s.kicker}
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-primary">
            <Handshake className="h-6 w-6 shrink-0 text-accent" />
            {s.title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FoundersTabs questionsLabel={s.tabQuestions} referenceLabel={s.tabReference} />
          <LanguageSwitch email={ctx.me.email} value={ctx.me.language} label={s.languageLabel} />
        </div>
      </div>
      {children}
      <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        {s.disclaimer}
      </p>
    </div>
  )
}
