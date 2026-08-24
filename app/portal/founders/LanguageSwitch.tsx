'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { LOCALE_LABEL } from '@/lib/founders/i18n'
import { LOCALES, type Locale } from '@/lib/founders/questions'

/**
 * EN / AF switch in the workbook header, on both tabs.
 *
 * The preference is stored on the participant row rather than in the browser,
 * so it follows the person between devices — which means flipping it has to
 * re-render the server tree (the header, the tabs and the questions all read
 * the stored value). Client state in the workbook survives that refresh, so a
 * half-typed answer is not lost by changing language mid-question.
 */
export function LanguageSwitch({
  email, value, label,
}: { email: string; value: Locale; label: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // Optimistic, so the pressed state does not wait for the round-trip.
  const [shown, setShown] = useState<Locale>(value)

  async function choose(next: Locale) {
    if (next === shown) return
    setShown(next)
    const supabase = createClient()
    const { error } = await supabase
      .from('founders_participants')
      .update({ language: next })
      .eq('email', email)
    if (error) {
      setShown(value)
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'flex items-center gap-1 rounded-lg border border-border p-1',
        pending && 'opacity-70',
      )}
    >
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => choose(code)}
          aria-pressed={shown === code}
          title={LOCALE_LABEL[code]}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            shown === code
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
