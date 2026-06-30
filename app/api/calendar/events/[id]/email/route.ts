import { createClient } from '@/lib/supabase/server'
import { sendEventConfirmation } from '@/lib/email/calendar'
import type { CalendarEvent } from '@/types/database'

export const runtime = 'nodejs'

/**
 * Manually email an appointment confirmation to the customer/contact. Auto-comms
 * are off by design — this only fires when staff click the button. The recipient
 * is resolved server-side from the linked customer, the event's own contact
 * email, or an explicit override in the request body.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // RLS scopes this to events the caller may see.
  const { data: event } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!event) return new Response('Event not found', { status: 404 })

  const evt = event as CalendarEvent

  const body = await req.json().catch(() => ({}))
  let to: string | null = typeof body.to === 'string' && body.to.includes('@') ? body.to.trim() : null

  if (!to && evt.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('email')
      .eq('id', evt.customer_id)
      .maybeSingle()
    to = (customer?.email as string | null) ?? null
  }
  if (!to) to = evt.contact_email

  if (!to) {
    return new Response('No email address on file for this appointment', { status: 400 })
  }

  const result = await sendEventConfirmation(evt, to)
  if (!result.sent) {
    return new Response(result.error ?? 'Email failed to send', { status: 502 })
  }
  return Response.json({ sent: true, to })
}
