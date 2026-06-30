import { emailButton, emailLayout, sendEmail, type SendResult } from './send'

/**
 * Password-reset email. Sent via Resend (our reliable transactional path),
 * NOT Supabase's built-in auth SMTP — which is heavily rate-limited and will
 * not deliver to arbitrary external inboxes. The recovery link is minted
 * server-side with admin.generateLink and passed in as `actionUrl`.
 */
export async function sendPasswordResetEmail({
  email,
  name,
  actionUrl,
}: {
  email: string
  name: string | null
  actionUrl: string
}): Promise<SendResult> {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : 'Hi,'
  const html = emailLayout(
    'Reset your password',
    `<p style="font-size:15px;line-height:1.6;">${greeting}</p>
     <p style="font-size:15px;line-height:1.6;">We received a request to reset the password for your Haberl portal account. Click below to choose a new one:</p>
     ${emailButton(actionUrl, 'Choose a new password')}
     <p style="font-size:13px;color:#6b7280;">This link expires shortly and can only be used once. If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
  )
  const text = `${greeting}\n\nWe received a request to reset your Haberl portal password. Choose a new one here:\n\n${actionUrl}\n\nThis link expires shortly and can only be used once. If you didn't request this, ignore this email.\n\nHaberl Electrical & Solar`

  return sendEmail({
    to: [email],
    subject: 'Reset your password — Haberl Solar',
    html,
    text,
    replyTo: 'info@haberl.co.za',
  })
}
