import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createJobFromQuote } from '@/lib/jobs/create-from-quote'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || !['manager', 'admin'].includes(profile.role)) {
    return new Response('Forbidden — only managers can create jobs', { status: 403 })
  }

  const body = await req.json()
  const quoteRequestId = String(body.quoteRequestId ?? '')
  if (!quoteRequestId) return new Response('Missing quoteRequestId', { status: 400 })

  const admin = createAdminClient()
  const { data: quote, error: quoteError } = await admin
    .from('quote_requests').select('*').eq('id', quoteRequestId).single()
  if (quoteError || !quote) {
    return new Response(quoteError?.message ?? 'Quote request not found', { status: 404 })
  }

  const result = await createJobFromQuote(admin, quote, user.id)
  if (!result.ok) return new Response(result.error, { status: result.status })

  return NextResponse.json({
    jobId: result.jobId,
    created: result.created,
    materialsSeeded: result.materialsSeeded,
    warnings: result.warnings,
  })
}
