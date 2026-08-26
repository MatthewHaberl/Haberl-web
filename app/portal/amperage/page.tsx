import type { Metadata } from 'next'
import { Zap, ListChecks, Loader2, Sparkles, Bot } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { requireFounder } from '@/lib/founders/access'
import { PageShell, PageHeader } from '@/components/layout/page'
import { Card, CardContent } from '@/components/ui/card'
import {
  awaitsClaude,
  isOpen,
  type AmperageComment,
  type AmperageItem,
} from '@/lib/amperage/board'
import { Board } from './Board'

export const metadata: Metadata = { title: 'Amperage Electrical' }
export const dynamic = 'force-dynamic'

function Stat({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  accent?: boolean
}) {
  return (
    <Card className={accent && value > 0 ? 'border-accent/60 bg-accent/5' : undefined}>
      <CardContent className="flex items-center gap-3 py-4">
        <Icon className={`h-5 w-5 shrink-0 ${accent && value > 0 ? 'text-accent' : 'text-muted-foreground'}`} />
        <div className="min-w-0">
          <p className="text-xl font-bold leading-none text-foreground">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export default async function AmperagePage() {
  const ctx = await requireFounder()
  const supabase = await createClient()

  // RLS already restricts both tables to the two participants, so the reads need
  // no filter of their own — an empty result would itself be the access failure.
  const [{ data: itemRows }, { data: commentRows }] = await Promise.all([
    supabase.from('amperage_items').select('*'),
    supabase.from('amperage_comments').select('*').order('created_at', { ascending: true }),
  ])

  const items = (itemRows ?? []) as AmperageItem[]
  const comments = (commentRows ?? []) as AmperageComment[]

  const byItem: Record<string, AmperageComment[]> = {}
  for (const c of comments) (byItem[c.item_id] ??= []).push(c)

  const names: Record<string, string> = {}
  for (const p of ctx.participants) names[p.email] = p.display_name || p.email

  const openTasks = items.filter((i) => i.kind === 'task' && isOpen(i))
  const openFeatures = items.filter((i) => i.kind === 'feature' && isOpen(i))

  return (
    <PageShell width="content">
      <PageHeader
        title="Amperage Electrical"
        icon={Zap}
        description={`The shared board for ${ctx.participants
          .map((p) => (p.display_name || p.email).split(' ')[0])
          .join(', ')
          .replace(/, ([^,]*)$/, ' and $1')} — private to the people on it. Tick "Ask Claude" on anything you want built or actioned.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open to-dos" value={openTasks.length} icon={ListChecks} />
        <Stat label="In progress" value={items.filter((i) => i.status === 'doing').length} icon={Loader2} />
        <Stat label="Features wanted" value={openFeatures.length} icon={Sparkles} />
        <Stat label="Waiting on Claude" value={items.filter(awaitsClaude).length} icon={Bot} accent />
      </div>

      <Board items={items} commentsByItem={byItem} names={names} meEmail={ctx.email} />
    </PageShell>
  )
}
