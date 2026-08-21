import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { loadCrew } from '@/lib/crews/query'
import {
  crewRosterRows,
  loadJobRoster,
  quotedPeopleFromScope,
  quotedRosterRows,
} from '@/lib/jobs/staff'

export const runtime = 'nodejs'

/**
 * The people on a job (migration 132).
 *
 * Adding, removing and promoting one person is a plain Supabase write from the
 * panel — RLS already limits job_staff to managers. This route exists for the
 * three operations that are not one row:
 *
 *   assign-crew   swap the crew's people in, take the old crew's people out,
 *                 and leave quoted and hand-added people alone
 *   add-quoted    pull across the people the quote priced
 *   clear-crew    take the crew off entirely
 *
 * Each is idempotent — running it twice leaves the roster where it was.
 */
type Guard =
  | { error: Response; supabase?: undefined; userId?: undefined }
  | { error?: undefined; supabase: SupabaseClient; userId: string }

async function guard(): Promise<Guard> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: new Response('Unauthorized', { status: 401 }) }

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return { error: new Response('Forbidden — only managers can change who is on a job', { status: 403 }) }
  }
  return { supabase, userId: user.id }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard()
  if (g.error) return g.error
  return NextResponse.json({ roster: await loadJobRoster(g.supabase, id) })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params
  const g = await guard()
  if (g.error) return g.error
  const { supabase, userId } = g

  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '')

  const { data: job } = await supabase
    .from('jobs')
    .select('id, crew_id, quote_request_id')
    .eq('id', jobId)
    .maybeSingle()
  if (!job) return new Response('Job not found', { status: 404 })

  switch (action) {
    case 'assign-crew': {
      const crewId = body.crewId ? String(body.crewId) : null

      // Take the outgoing crew's people off first. Only rows this mechanism
      // put there — a person somebody added by hand stays on the job even if
      // they happened to also be on the old crew.
      const { error: clearError } = await supabase
        .from('job_staff')
        .delete()
        .eq('job_id', jobId)
        .eq('source', 'crew')
      if (clearError) return new Response(clearError.message, { status: 400 })

      const { error: jobError } = await supabase
        .from('jobs')
        .update({ crew_id: crewId })
        .eq('id', jobId)
      if (jobError) return new Response(jobError.message, { status: 400 })

      if (!crewId) {
        return NextResponse.json({ ok: true, added: 0, roster: await loadJobRoster(supabase, jobId) })
      }

      const crew = await loadCrew(supabase, crewId)
      if (!crew) return new Response('Crew not found', { status: 404 })

      // Somebody may already be on this job as a quoted or hand-added person.
      // They keep that row — it carries the quote's hours — so the crew only
      // contributes the people who are not already here.
      const existing = await loadJobRoster(supabase, jobId)
      const taken = new Set(existing.map((p) => p.staffId))
      const rows = crewRosterRows(jobId, crew, {
        hasLeader: existing.some((p) => p.role === 'leader'),
      })
        .filter((r) => !taken.has(r.staff_id))
        .map((r) => ({ ...r, added_by: userId }))

      if (rows.length) {
        const { error } = await supabase.from('job_staff').insert(rows)
        if (error) return new Response(error.message, { status: 400 })
      }
      return NextResponse.json({
        ok: true,
        added: rows.length,
        roster: await loadJobRoster(supabase, jobId),
      })
    }

    case 'add-quoted': {
      if (!job.quote_request_id) {
        return new Response('This job has no quote behind it', { status: 400 })
      }
      const { data: quote } = await supabase
        .from('quote_requests')
        .select('scope')
        .eq('id', job.quote_request_id)
        .maybeSingle()

      const quoted = quotedPeopleFromScope(quote?.scope)
      if (quoted.length === 0) {
        return NextResponse.json({
          ok: true,
          added: 0,
          roster: await loadJobRoster(supabase, jobId),
          message: 'The quote did not price any named people — nothing to bring across.',
        })
      }

      const existing = await loadJobRoster(supabase, jobId)
      const taken = new Set(existing.map((p) => p.staffId))
      const rows = quotedRosterRows(jobId, quoted)
        .filter((r) => !taken.has(r.staff_id))
        .map((r) => ({ ...r, added_by: userId }))

      if (rows.length) {
        const { error } = await supabase.from('job_staff').insert(rows)
        if (error) return new Response(error.message, { status: 400 })
      }
      return NextResponse.json({
        ok: true,
        added: rows.length,
        roster: await loadJobRoster(supabase, jobId),
      })
    }

    default:
      return new Response(`Unknown action "${action}"`, { status: 400 })
  }
}
