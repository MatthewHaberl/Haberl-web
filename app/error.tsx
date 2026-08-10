'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Route-level error boundary for the app. Catches render/runtime errors in any
 * page or nested layout below the root and shows a branded recovery screen
 * instead of an unstyled crash. `reset()` re-renders the failed segment.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-[60vh] flex-1 items-center justify-center px-4 py-24">
      <div className="text-center">
        <p className="mb-2 text-6xl font-bold text-accent">Oops</p>
        <h1 className="mb-3 text-2xl font-bold text-primary">Something went wrong</h1>
        <p className="mx-auto mb-8 max-w-sm text-muted-foreground">
          An unexpected error occurred. You can try again, or head back home. If it
          keeps happening, please let us know.
        </p>
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent"
          >
            Back to home
          </Link>
        </div>
      </div>
    </main>
  )
}
