'use client'

import { useMemo, useState } from 'react'
import { PhoneIncoming, PhoneCall } from 'lucide-react'
import { LeadCard, type LeadCardData, type StaffMember } from './LeadCard'

type Filter = 'all' | 'mine' | 'unassigned' | 'shared'

/**
 * The actionable leads list with an ownership filter on top. RLS already limits
 * which leads reach a restricted user; these chips just let anyone (esp. a
 * manager who sees everything) narrow to their own pile, the unassigned pool, or
 * the leads shared to them. Status grouping (New → Contacted) is preserved as
 * the operational call order.
 */
export function LeadsInbox({
  cards,
  staff,
  currentUserId,
  canManage,
}: {
  cards: LeadCardData[]
  staff: StaffMember[]
  currentUserId: string
  canManage: boolean
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(() => ({
    all: cards.length,
    mine: cards.filter((c) => c.lead.owner_id === currentUserId).length,
    unassigned: cards.filter((c) => c.lead.owner_id === null).length,
    shared: cards.filter(
      (c) => c.lead.owner_id !== currentUserId && c.sharedWith.some((s) => s.id === currentUserId),
    ).length,
  }), [cards, currentUserId])

  const filtered = useMemo(() => cards.filter((c) => {
    switch (filter) {
      case 'mine': return c.lead.owner_id === currentUserId
      case 'unassigned': return c.lead.owner_id === null
      case 'shared':
        return c.lead.owner_id !== currentUserId && c.sharedWith.some((s) => s.id === currentUserId)
      default: return true
    }
  }), [cards, filter, currentUserId])

  const newLeads = filtered.filter((c) => c.lead.status === 'new')
  const contacted = filtered.filter((c) => c.lead.status === 'contacted')

  const chips: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'mine', label: 'Mine', n: counts.mine },
    { key: 'unassigned', label: 'Unassigned', n: counts.unassigned },
    // Only surface "Shared with me" when something actually is.
    ...(counts.shared > 0 ? [{ key: 'shared' as Filter, label: 'Shared with me', n: counts.shared }] : []),
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            className={
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ' +
              (filter === c.key
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-muted-foreground hover:text-foreground')
            }
          >
            {c.label}
            <span className={filter === c.key ? 'text-accent/70' : 'text-muted-foreground/60'}>{c.n}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No leads in this view.
        </p>
      )}

      {newLeads.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <PhoneIncoming className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              New — call these ({newLeads.length})
            </h2>
          </div>
          <div className="flex flex-col gap-2">
            {newLeads.map((c) => (
              <LeadCard key={c.lead.id} data={c} staff={staff} currentUserId={currentUserId} canManage={canManage} />
            ))}
          </div>
        </div>
      )}

      {contacted.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <PhoneCall className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Contacted — follow up ({contacted.length})
            </h2>
          </div>
          <div className="flex flex-col gap-2">
            {contacted.map((c) => (
              <LeadCard key={c.lead.id} data={c} staff={staff} currentUserId={currentUserId} canManage={canManage} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
