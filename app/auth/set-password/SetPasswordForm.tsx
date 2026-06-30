'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SetPasswordForm({ title = 'Set your password' }: { title?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const rawNext = searchParams.get('next') ?? ''
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/portal'

  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function initialiseSession() {
      const code = searchParams.get('code')
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError && !cancelled) {
          setError(exchangeError.message)
          setReady(true)
          return
        }
      }

      const { data, error: sessionError } = await supabase.auth.getSession()
      if (cancelled) return

      if (sessionError) {
        setError(sessionError.message)
      } else if (!data.session) {
        setError('This link has expired or was already used. Request a new portal invite or password reset email.')
      }
      setReady(true)
    }

    initialiseSession()
    return () => {
      cancelled = true
    }
  }, [searchParams, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })

    // `same_password` is NOT a failure here. The invite/recovery link already
    // signs the customer in, so if they re-submit (or re-open the link) with the
    // password they just chose, Supabase reports it as already set. They are
    // authenticated with exactly the password they want — finish onboarding
    // instead of dead-ending them on a "wrong password" screen.
    const alreadySet =
      updateError?.code === 'same_password' ||
      /different from the old password/i.test(updateError?.message ?? '')

    if (updateError && !alreadySet) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    // Mark the customer record as registered/verified. Best-effort — never
    // block the customer from reaching the portal if this hiccups — but retry
    // once, because a silent failure leaves them stuck as "Invited" and invites
    // a re-invite loop. RLS/trigger linking still applies if both attempts fail.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch('/api/customers/me/confirm', { method: 'POST' })
        if (res.ok) break
      } catch {
        // network hiccup — fall through to the retry
      }
    }

    router.push(next)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-primary font-bold text-xl">
            <Zap className="h-6 w-6 text-accent" />
            Haberl
          </Link>
          <h1 className="mt-4 text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create a password to open your customer portal</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium">New password</label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                disabled={!ready || loading}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm-password" className="text-sm font-medium">Confirm password</label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                disabled={!ready || loading}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
            )}

            <Button type="submit" disabled={!ready || loading || Boolean(error && !password)} className="w-full mt-1">
              {loading ? 'Saving...' : 'Save password'}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/auth/login" className="inline-flex items-center gap-1 text-primary font-medium hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
