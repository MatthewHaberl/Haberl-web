import { Suspense } from 'react'
import { SetPasswordForm } from './SetPasswordForm'

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-muted" />}>
      <SetPasswordForm />
    </Suspense>
  )
}
