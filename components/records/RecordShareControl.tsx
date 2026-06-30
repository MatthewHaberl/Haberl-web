'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Loader2, UserCog, Check, X, Share2 } from 'lucide-react'
import type { StaffMember } from '@/lib/records/sharing'

/**
 * Generic ownership + sharing control for any record-visibility section
 * (migrations 071/072). Drop it on a record's detail page; it writes directly
 * via RLS (no per-section API), exactly like the Leads card:
 *   • owner  → updates `table.ownerColumn` (gated by `canAssignOwner`)
 *   • share  → inserts/deletes `record_grants` rows (gated by `canShare`)
 *
 * `ownerNoun` tunes the empty-owner label per section ("Unassigned" for leads,
 * "No owner set" elsewhere).
 */
export function RecordShareControl({
  section,
  recordId,
  table,
  ownerColumn,
  ownerId,
  ownerName,
  staff,
  sharedWith,
  currentUserId,
  canAssignOwner,
  canShare,
  ownerNoun = 'No owner set',
}: {
  section: string
  recordId: string
  table: string
  ownerColumn: string
  ownerId: string | null
  ownerName: string | null
  staff: StaffMember[]
  sharedWith: StaffMember[]
  currentUserId: string
  canAssignOwner: boolean
  canShare: boolean
  ownerNoun?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sharedIds = new Set(sharedWith.map((s) => s.id))
  const isMine = ownerId === currentUserId

  async function assignOwner(value: string) {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase
      .from(table)
      .update({ [ownerColumn]: value || null })
      .eq('id', recordId)
    if (error) setError(error.message)
    else router.refresh()
    setBusy(false)
  }

  async function toggleShare(memberId: string, on: boolean) {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error } = on
      ? await supabase.from('record_grants').insert({
          section, record_id: recordId, user_id: memberId, granted_by: currentUserId,
        })
      : await supabase.from('record_grants').delete()
          .eq('section', section).eq('record_id', recordId).eq('user_id', memberId)
    if (error) setError(error.message)
    else router.refresh()
    setBusy(false)
  }

  return (
    <Card>
      <CardContent className="pt-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Ownership &amp; sharing</h2>
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {/* Owner */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-xs font-semibold text-muted-foreground w-28 shrink-0">Owner</span>
          {canAssignOwner ? (
            <Select
              value={ownerId ?? ''}
              onChange={(e) => assignOwner(e.target.value)}
              disabled={busy}
              className="sm:max-w-xs"
              aria-label="Owner"
            >
              <option value="">{ownerNoun}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}{s.id === currentUserId ? ' (you)' : ''}
                </option>
              ))}
            </Select>
          ) : (
            <span className="text-sm">
              {isMine ? <Badge variant="accent">You</Badge> : ownerName ? ownerName : ownerNoun}
            </span>
          )}
        </div>

        {/* Share */}
        {canShare && (
          <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
            <span className="text-xs font-semibold text-muted-foreground w-28 shrink-0 sm:pt-1 inline-flex items-center gap-1">
              <Share2 className="h-3 w-3" /> Shared with
            </span>
            <div className="flex flex-wrap gap-1.5">
              {staff.filter((s) => s.id !== ownerId).map((s) => {
                const on = sharedIds.has(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy}
                    onClick={() => toggleShare(s.id, !on)}
                    className={
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors disabled:opacity-50 ' +
                      (on
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-muted-foreground hover:text-foreground')
                    }
                  >
                    {on ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-40" />}
                    {s.full_name}{s.id === currentUserId ? ' (you)' : ''}
                  </button>
                )
              })}
              {staff.filter((s) => s.id !== ownerId).length === 0 && (
                <span className="text-xs text-muted-foreground">No other staff to share with.</span>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
