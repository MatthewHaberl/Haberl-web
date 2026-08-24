import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient, getUser } from '@/lib/supabase/server'

export interface FounderParticipant {
  email: string
  display_name: string
  is_owner: boolean
  submitted_at: string | null
}

export interface FounderContext {
  /** The signed-in user's participant email, lowercased. */
  email: string
  me: FounderParticipant
  /** Everyone in the workbook, owner first. */
  participants: FounderParticipant[]
  /**
   * True once there is more than one participant and every one of them has
   * submitted — the point at which answers become comparable. The database
   * enforces this too (migration 134); this copy only decides what to render.
   */
  revealed: boolean
}

/**
 * The workbook context for the signed-in user, or null if they are not one of
 * the named participants.
 *
 * Membership of `founders_participants` IS the permission — this page is not
 * wired to the role/section matrix, because every admin would inherit it and
 * the workbook is private between two named people. RLS returns no roster rows
 * at all to a non-participant, so an empty read is the access check.
 */
export const getFounderContext = cache(async (): Promise<FounderContext | null> => {
  const user = await getUser()
  if (!user?.email) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('founders_participants')
    .select('email, display_name, is_owner, submitted_at')
    .order('is_owner', { ascending: false })
    .order('created_at', { ascending: true })

  const participants = (data ?? []) as FounderParticipant[]
  const email = user.email.toLowerCase()
  const me = participants.find((p) => p.email === email)
  if (!me) return null

  return {
    email,
    me,
    participants,
    revealed: participants.length > 1 && participants.every((p) => p.submitted_at),
  }
})

/** Server-component guard. Sends anyone who is not a participant back to their portal. */
export async function requireFounder(): Promise<FounderContext> {
  const ctx = await getFounderContext()
  if (!ctx) redirect('/portal')
  return ctx
}

/** Whether the signed-in user may add or remove participants. */
export function isWorkbookOwner(ctx: FounderContext): boolean {
  return ctx.me.is_owner
}
