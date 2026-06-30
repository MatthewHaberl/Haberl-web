import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { monthStart } from '@/lib/finance/budget'

export const runtime = 'nodejs'

const SCOPES = new Set(['business', 'personal'])
const KINDS = new Set(['expense', 'income'])
const CADENCES = new Set(['weekly', 'monthly', 'quarterly', 'annual', 'once'])
const BUDGET_PATH = '/portal/employee/finance/budget'

type Resource = 'category' | 'plan' | 'commitment' | 'goal' | 'manual'
type Op = 'create' | 'update' | 'delete' | 'upsert'

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function asInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Math.round(Number(v))
  return null
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * One endpoint for all budget mutations. Manager/admin only (matches finance).
 * Body: { resource, op, id?, data? }. Returns { ok, row? }.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return bad('Unauthorized', 401)
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) return bad('Forbidden', 403)

  let body: { resource?: Resource; op?: Op; id?: string; data?: Record<string, unknown> }
  try { body = await req.json() } catch { return bad('Invalid JSON') }

  const { resource, op } = body
  const id = asString(body.id)
  const data = body.data ?? {}

  if (!resource) return bad('Missing resource')
  if (!op) return bad('Missing op')
  if ((op === 'update' || op === 'delete') && !id) return bad('Missing id')

  try {
    switch (resource) {
      // ── budget categories (delete = soft archive to preserve plans) ──
      case 'category': {
        if (op === 'create') {
          const name = asString(data.name)
          if (!name) return bad('Category name required')
          const scope = SCOPES.has(data.scope as string) ? data.scope : 'business'
          const kind = KINDS.has(data.kind as string) ? data.kind : 'expense'
          const match_keys = Array.isArray(data.match_keys)
            ? (data.match_keys as unknown[]).filter((x): x is string => typeof x === 'string')
            : [name]
          const { data: row, error } = await supabase.from('budget_categories')
            .insert({ name, scope, kind, match_keys, sort_order: asInt(data.sort_order) ?? 0 })
            .select().single()
          if (error) throw error
          revalidatePath(BUDGET_PATH)
          return NextResponse.json({ ok: true, row })
        }
        if (op === 'update') {
          const patch: Record<string, unknown> = {}
          if (data.name !== undefined) { const n = asString(data.name); if (!n) return bad('Name cannot be blank'); patch.name = n }
          if (data.scope !== undefined && SCOPES.has(data.scope as string)) patch.scope = data.scope
          if (data.kind !== undefined && KINDS.has(data.kind as string)) patch.kind = data.kind
          if (data.sort_order !== undefined) patch.sort_order = asInt(data.sort_order) ?? 0
          if (Array.isArray(data.match_keys)) patch.match_keys = (data.match_keys as unknown[]).filter((x): x is string => typeof x === 'string')
          if (data.archived !== undefined) patch.archived_at = data.archived ? new Date().toISOString() : null
          const { error } = await supabase.from('budget_categories').update(patch).eq('id', id)
          if (error) throw error
          revalidatePath(BUDGET_PATH)
          return NextResponse.json({ ok: true })
        }
        if (op === 'delete') {
          const { error } = await supabase.from('budget_categories')
            .update({ archived_at: new Date().toISOString() }).eq('id', id)
          if (error) throw error
          revalidatePath(BUDGET_PATH)
          return NextResponse.json({ ok: true })
        }
        return bad('Unsupported op for category')
      }

      // ── monthly plan (one figure per category per month) ──
      case 'plan': {
        if (op !== 'upsert') return bad('Plan only supports upsert')
        const category_id = asString(data.category_id)
        const monthIn = asString(data.month)
        const planned = asInt(data.planned_cents)
        if (!category_id || !monthIn) return bad('category_id and month required')
        if (planned == null) return bad('planned_cents required')
        const month = monthStart(monthIn)
        const { error } = await supabase.from('budget_plans')
          .upsert({ category_id, month, planned_cents: planned, note: asString(data.note) },
                  { onConflict: 'category_id,month' })
        if (error) throw error
        revalidatePath(BUDGET_PATH)
        return NextResponse.json({ ok: true })
      }

      // ── recurring commitments ──
      case 'commitment': {
        if (op === 'create' || op === 'update') {
          const patch: Record<string, unknown> = {}
          if (op === 'create' || data.name !== undefined) { const n = asString(data.name); if (!n) return bad('Name required'); patch.name = n }
          if (op === 'create' || data.amount_cents !== undefined) { const a = asInt(data.amount_cents); if (a == null) return bad('Amount required'); patch.amount_cents = a }
          if (op === 'create' || data.cadence !== undefined) patch.cadence = CADENCES.has(data.cadence as string) ? data.cadence : 'monthly'
          if (data.scope !== undefined) patch.scope = SCOPES.has(data.scope as string) ? data.scope : 'business'
          else if (op === 'create') patch.scope = 'business'
          if (data.category_id !== undefined) patch.category_id = asString(data.category_id)
          if (data.due_day !== undefined) { const d = asInt(data.due_day); patch.due_day = d && d >= 1 && d <= 31 ? d : null }
          if (data.next_due !== undefined) patch.next_due = asString(data.next_due)
          if (data.active !== undefined) patch.active = !!data.active
          if (data.note !== undefined) patch.note = asString(data.note)
          if (op === 'create') {
            const { data: row, error } = await supabase.from('budget_commitments').insert(patch).select().single()
            if (error) throw error
            revalidatePath(BUDGET_PATH)
            return NextResponse.json({ ok: true, row })
          }
          const { error } = await supabase.from('budget_commitments').update(patch).eq('id', id)
          if (error) throw error
          revalidatePath(BUDGET_PATH)
          return NextResponse.json({ ok: true })
        }
        if (op === 'delete') {
          const { error } = await supabase.from('budget_commitments').delete().eq('id', id)
          if (error) throw error
          revalidatePath(BUDGET_PATH)
          return NextResponse.json({ ok: true })
        }
        return bad('Unsupported op for commitment')
      }

      // ── savings goals ──
      case 'goal': {
        if (op === 'create' || op === 'update') {
          const patch: Record<string, unknown> = {}
          if (op === 'create' || data.name !== undefined) { const n = asString(data.name); if (!n) return bad('Name required'); patch.name = n }
          if (op === 'create' || data.target_cents !== undefined) { const t = asInt(data.target_cents); if (t == null) return bad('Target required'); patch.target_cents = t }
          if (data.saved_cents !== undefined) patch.saved_cents = asInt(data.saved_cents) ?? 0
          else if (op === 'create') patch.saved_cents = 0
          if (data.scope !== undefined) patch.scope = SCOPES.has(data.scope as string) ? data.scope : 'business'
          else if (op === 'create') patch.scope = 'business'
          if (data.target_date !== undefined) patch.target_date = asString(data.target_date)
          if (data.note !== undefined) patch.note = asString(data.note)
          if (data.achieved !== undefined) patch.achieved_at = data.achieved ? new Date().toISOString() : null
          if (op === 'create') {
            const { data: row, error } = await supabase.from('budget_goals').insert(patch).select().single()
            if (error) throw error
            revalidatePath(BUDGET_PATH)
            return NextResponse.json({ ok: true, row })
          }
          const { error } = await supabase.from('budget_goals').update(patch).eq('id', id)
          if (error) throw error
          revalidatePath(BUDGET_PATH)
          return NextResponse.json({ ok: true })
        }
        if (op === 'delete') {
          const { error } = await supabase.from('budget_goals').delete().eq('id', id)
          if (error) throw error
          revalidatePath(BUDGET_PATH)
          return NextResponse.json({ ok: true })
        }
        return bad('Unsupported op for goal')
      }

      // ── manual actuals (personal / cash spend not on the bank feed) ──
      case 'manual': {
        if (op === 'create') {
          const category_id = asString(data.category_id)
          const monthIn = asString(data.month)
          const amount = asInt(data.amount_cents)
          if (!category_id || !monthIn) return bad('category_id and month required')
          if (amount == null) return bad('amount_cents required')
          const { data: row, error } = await supabase.from('budget_manual_actuals')
            .insert({ category_id, month: monthStart(monthIn), amount_cents: amount, note: asString(data.note), created_by: user.id })
            .select().single()
          if (error) throw error
          revalidatePath(BUDGET_PATH)
          return NextResponse.json({ ok: true, row })
        }
        if (op === 'delete') {
          const { error } = await supabase.from('budget_manual_actuals').delete().eq('id', id)
          if (error) throw error
          revalidatePath(BUDGET_PATH)
          return NextResponse.json({ ok: true })
        }
        return bad('Unsupported op for manual actual')
      }

      default:
        return bad('Unknown resource')
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Database error'
    return bad(msg, 500)
  }
}
