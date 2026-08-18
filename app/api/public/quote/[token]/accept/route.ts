import { NextResponse } from 'next/server'
import { ensureCustomerPortalAccess } from '@/lib/auth/customer-onboarding'
import { createJobFromQuote } from '@/lib/jobs/create-from-quote'
import { sendAdminNotice, sendCustomerPortalOnboardingEmail } from '@/lib/email/quotes'
import {
  CLOSED_QUOTE_MESSAGE, formatCents, isQuoteExpired, packageTierValue, parsePackageChoice,
  parseTierOptions,
} from '@/lib/quotes/public'
import { getBaseUrl, getClientIp, getCompanySettings, getQuoteByToken } from '@/lib/quotes/server'
import { escapeHtml } from '@/lib/utils'

export const runtime = 'nodejs'

async function sendPortalEmail(
  portalAccess: Awaited<ReturnType<typeof ensureCustomerPortalAccess>>,
  quote: Record<string, unknown>,
): Promise<string | null> {
  if (!portalAccess.ok || portalAccess.status === 'skipped') return null

  const result = await sendCustomerPortalOnboardingEmail({
    customerEmail: portalAccess.email,
    customerName: portalAccess.customerName,
    quoteNumber: typeof quote.quote_number === 'string' ? quote.quote_number : null,
    actionUrl: portalAccess.actionUrl,
    isInvite: portalAccess.status === 'invited',
  })

  return result.sent ? null : (result.error ?? 'Portal onboarding email was not sent')
}

/**
 * Public online acceptance. The unguessable share token is the credential;
 * the typed name + timestamp + IP form the acceptance record.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { supabase, quote } = await getQuoteByToken(token)
  if (!quote) return new Response('Quote not found', { status: 404 })

  // Idempotent: a second tap on Accept is fine. If a previous attempt
  // recorded the acceptance but job creation failed, retry it now.
  if (quote.status === 'accepted') {
    const baseUrl = getBaseUrl()
    const portalAccess = await ensureCustomerPortalAccess(supabase, quote, baseUrl)
    if (!portalAccess.ok) {
      console.error('[public/accept] customer onboarding retry failed:', portalAccess.error)
    }

    const actor = quote.generated_by ?? quote.submitted_by
    if (actor) {
      const retry = await createJobFromQuote(supabase, quote, actor)
      if (!retry.ok) {
        console.error('[public/accept] job retry failed:', retry.error)
        return new Response('Could not open the installation job - please contact us', { status: 500 })
      }
    }
    if (portalAccess.ok && portalAccess.status === 'invited') {
      try {
        const emailWarning = await sendPortalEmail(portalAccess, quote)
        if (emailWarning) console.error('[public/accept] onboarding retry email:', emailWarning)
      } catch (err) {
        console.error('[public/accept] onboarding retry email failed', err)
      }
    }
    return NextResponse.json({ ok: true })
  }
  // Archived or deleted here means we've taken the quote off the table — the
  // link must not create a job. The page sends them to /q/<token>/renew instead.
  if (quote.archived_at || quote.deleted_at) {
    return new Response(CLOSED_QUOTE_MESSAGE, { status: 410 })
  }
  if (!['generated', 'sent'].includes(quote.status)) {
    return new Response('This quote is no longer open for acceptance', { status: 409 })
  }
  if (isQuoteExpired(quote)) {
    return new Response('This quote has expired — please request an updated version', { status: 410 })
  }

  let body: { name?: string; tier?: string; packageId?: string; acknowledgedSurcharge?: boolean }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid request', { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  if (name.length < 2 || name.length > 120) {
    return new Response('Please enter your full name to accept', { status: 400 })
  }

  // Combined quote, one package taken: bill the STANDALONE price, not a share
  // of the bundle. Doing this on the server (rather than trusting a total sent
  // by the browser) is what stops the combined price being claimed for a
  // single package.
  const packageChoice = parsePackageChoice(quote)
  const wantedPackageId = typeof body.packageId === 'string' ? body.packageId : ''
  let chosenPackage = null
  if (wantedPackageId) {
    // Two ways to get here with no choice on offer: the quote never had parts,
    // or it is all-or-nothing (migration 124). Say which — the second is a
    // decision someone made about this quote and the customer deserves the
    // reason, not a flat refusal.
    if (quote.allow_partial_acceptance === false) {
      return new Response(
        'This quote is priced as one job and has to be accepted in full — call us and we will quote you for a smaller job.',
        { status: 409 },
      )
    }
    if (!packageChoice) {
      return new Response('This quote cannot be accepted in parts', { status: 400 })
    }
    chosenPackage = packageChoice.packages.find((p) => p.id === wantedPackageId) ?? null
    if (!chosenPackage) {
      return new Response('That part of the quote is no longer available — please reload the page', { status: 409 })
    }
    // Matthew's rule: nobody buys one package without being told, in terms, that
    // it costs more alone. The tick box on the page is the disclosure; this is
    // the gate that makes it more than decoration.
    if (body.acknowledgedSurcharge !== true) {
      return new Response(
        'Please confirm you understand that taking only part of the quote costs more than the combined price',
        { status: 400 },
      )
    }
  }

  // Multi-tier: lock in the chosen option's totals so the job, deposit and
  // emails all reflect what the customer actually accepted.
  const tierOptions = parseTierOptions(quote)
  const chosen = tierOptions?.find((option) => option.tier === body.tier) ?? null

  const update: Record<string, unknown> = {
    status: 'accepted',
    accepted_at: new Date().toISOString(),
    acceptance_name: name,
    acceptance_ip: getClientIp(req),
    accepted_tier: chosenPackage ? packageTierValue(chosenPackage.id) : (chosen?.tier ?? null),
  }
  if (chosenPackage) {
    update.total_amount = chosenPackage.totalCents
    if (chosenPackage.depositCents != null) update.deposit_amount = chosenPackage.depositCents
  } else {
    if (chosen?.totalCents != null) update.total_amount = chosen.totalCents
    if (chosen?.depositCents != null) update.deposit_amount = chosen.depositCents
  }

  const { error: updateError } = await supabase
    .from('quote_requests')
    .update(update)
    .eq('id', quote.id)
    .in('status', ['generated', 'sent'])
  if (updateError) {
    console.error('[public/accept]', updateError)
    return new Response('Could not record acceptance — please try again', { status: 500 })
  }

  // Create the job (idempotent). Assigned to whoever generated the quote.
  const acceptedQuote = { ...quote, ...update }
  const baseUrl = getBaseUrl()
  const portalAccess = await ensureCustomerPortalAccess(supabase, acceptedQuote, baseUrl)
  let onboardingWarning: string | null = null
  if (!portalAccess.ok) {
    onboardingWarning = portalAccess.error
    console.error('[public/accept] customer onboarding:', portalAccess.error)
  } else if (portalAccess.status === 'skipped') {
    onboardingWarning = portalAccess.reason
  }

  const actorId = quote.generated_by ?? quote.submitted_by
  let jobWarning: string | null = null
  let jobWarnings: string[] = []
  if (actorId) {
    const result = await createJobFromQuote(supabase, acceptedQuote, actorId)
    if (!result.ok) jobWarning = result.error
    else jobWarnings = result.warnings
  } else {
    jobWarning = 'No staff account linked to this quote — create the job manually.'
  }
  if (jobWarning) {
    console.error('[public/accept] job creation:', jobWarning)
    await supabase
      .from('quote_requests')
      .update({
        status: quote.status,
        accepted_at: null,
        acceptance_name: null,
        acceptance_ip: null,
        accepted_tier: null,
        total_amount: quote.total_amount,
        deposit_amount: quote.deposit_amount,
      })
      .eq('id', quote.id)
      .eq('status', 'accepted')

    return new Response('Could not open the installation job - please try again or contact us', { status: 500 })
  }

  // Notify admin — never block the customer on email problems
  if (portalAccess.ok && portalAccess.status !== 'skipped') {
    try {
      const emailWarning = await sendPortalEmail(portalAccess, acceptedQuote)
      if (emailWarning) {
        onboardingWarning = emailWarning
        console.error('[public/accept] onboarding email:', emailWarning)
      }
    } catch (err) {
      onboardingWarning = 'Portal onboarding email failed'
      console.error('[public/accept] onboarding email failed', err)
    }
  }

  try {
    const settings = await getCompanySettings(supabase)
    await sendAdminNotice(
      settings?.contact_email ?? null,
      `Quote accepted — ${quote.quote_number ?? quote.customer_name}`,
      [
        `<strong>${escapeHtml(quote.customer_name)}</strong> accepted quote <strong>${escapeHtml(quote.quote_number ?? '')}</strong>${
          chosenPackage
            ? ` &mdash; <strong>${escapeHtml(chosenPackage.label)} ONLY</strong>, at the standalone price. The rest of the quote was not taken.`
            : chosen ? ` (${escapeHtml(chosen.label)} option)` : ''
        }`,
        `Signed: ${escapeHtml(name)}`,
        ...(onboardingWarning ? [`Portal onboarding: ${onboardingWarning}`] : []),
        ...jobWarnings.map((warning) => `Job warning: ${warning}`),
        `Total: ${formatCents((update.total_amount as number) ?? quote.total_amount)} · Deposit: ${formatCents((update.deposit_amount as number) ?? quote.deposit_amount)}`,
        ...(jobWarning ? [`⚠ ${jobWarning}`] : []),
      ],
      `${getBaseUrl()}/portal/employee/quotes-v2/${quote.id}`,
      'Open quote',
    )
  } catch (err) {
    console.error('[public/accept] admin notice failed', err)
  }

  return NextResponse.json({ ok: true })
}
