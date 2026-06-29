import type { ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSection } from '@/lib/auth/permissions'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Send, FileText, Eye, Wallet, Sprout, PackageX, PhoneCall, Sunrise } from 'lucide-react'
import { buildDailyBriefing } from '@/lib/quotes/daily-briefing'
import { PageShell, PageHeader } from '@/components/layout/page'

export const dynamic = 'force-dynamic'

export default async function BriefingPage() {
  await requireSection('briefing')
  const supabase = await createClient()

  const b = await buildDailyBriefing(supabase)

  const attentionGroups = [
    { key: 'drafts',   icon: FileText, title: 'Quotes ready to send',           items: b.drafts },
    { key: 'awaiting', icon: Eye,      title: 'Viewed — waiting on their reply', items: b.awaitingResponse },
    { key: 'deposits', icon: Wallet,   title: 'Deposits to confirm',             items: b.depositsToConfirm },
    { key: 'leads',    icon: Sprout,   title: 'New leads to call',               items: b.newLeads },
    { key: 'followup', icon: PhoneCall, title: 'Follow up — called, not yet quoted', items: b.followupLeads },
    { key: 'pos',      icon: PackageX, title: 'Overdue purchase orders',         items: b.overduePOs },
  ].filter((g) => g.items.length > 0)

  return (
    <PageShell width="content">
      <PageHeader icon={Sunrise} title="Today" description={b.dateLabel} />

      {/* Going out automatically — no action from you */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-primary">Going out automatically</h2>
            </div>
            <Badge variant="default">{b.totalAuto}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            These reminders email customers on their own — no action needed from you.
          </p>
          {b.customerSends.length ? (
            <ul className="flex flex-col gap-2">
              {b.customerSends.map((q) => (
                <li key={q.id} className="text-sm flex items-start gap-2">
                  <Send className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <span>
                    <Link href={q.href} className="font-medium hover:underline">{q.customerName}</Link>
                    {q.quoteNumber ? <span className="text-muted-foreground"> · {q.quoteNumber}</span> : null}
                    <span className="text-muted-foreground"> — {q.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing emails customers automatically today.</p>
          )}
        </CardContent>
      </Card>

      {/* Needs you */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary">Needs you today</h2>
            <Badge variant={b.totalAttention ? 'warning' : 'success'}>{b.totalAttention}</Badge>
          </div>

          {b.personalFollowups.length > 0 && (
            <BriefSection icon={<PhoneCall className="h-4 w-4 text-destructive" />} title={`Personal follow-up — call them (${b.personalFollowups.length})`}>
              {b.personalFollowups.map((q) => (
                <BriefRow
                  key={q.id}
                  href={q.href}
                  label={`${q.customerName}${q.quoteNumber ? ` · ${q.quoteNumber}` : ''}`}
                  sub={q.detail}
                />
              ))}
            </BriefSection>
          )}

          {attentionGroups.map((g) => {
            const Icon = g.icon
            return (
              <BriefSection key={g.key} icon={<Icon className="h-4 w-4 text-muted-foreground" />} title={`${g.title} (${g.items.length})`}>
                {g.items.map((i) => (
                  <BriefRow key={i.id} href={i.href} label={i.label} sub={i.sub} />
                ))}
              </BriefSection>
            )
          })}

          {b.totalAttention === 0 && (
            <p className="text-sm text-success">All clear — nothing needs you right now. 🎉</p>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        You also get this as an email each morning (around 06:30 SAST), sent by the daily automation before the customer reminders go out.
      </p>
    </PageShell>
  )
}

function BriefSection({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center gap-2 mb-1.5">
        {icon}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      </div>
      <ul className="flex flex-col gap-1.5 pl-6">{children}</ul>
    </div>
  )
}

function BriefRow({ href, label, sub }: { href: string; label: string; sub?: string }) {
  return (
    <li className="text-sm">
      <Link href={href} className="font-medium hover:underline">{label}</Link>
      {sub ? <span className="text-muted-foreground"> — {sub}</span> : null}
    </li>
  )
}
