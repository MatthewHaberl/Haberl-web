import { Suspense } from 'react'
import { SetPasswordForm } from '../set-password/SetPasswordForm'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-muted" />}>
      <SetPasswordForm title="Reset your password" />
    </Suspense>
  )
}
