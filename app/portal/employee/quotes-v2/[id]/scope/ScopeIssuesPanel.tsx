'use client'

// Pre-flight panel for the scope builder — the same job the error list above
// Submit does on the new-quote form, for an editor that has no Submit.
//
// Blockers are what Generate refuses on (lib/quotes/scope-validate.ts);
// warnings are legal but usually a mistake. Every row scrolls to the field it
// is about, because this editor is long enough to hide a problem off-screen.

import { AlertTriangle, Info } from 'lucide-react'
import type { ScopeIssue } from '@/lib/quotes/scope-validate'

/** Bring the field an issue is about on screen and flash it into focus. */
export function scrollToIssue(anchor: string) {
  const el = document.querySelector<HTMLElement>(`[data-issue-anchor="${CSS.escape(anchor)}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

export function ScopeIssuesPanel({ issues }: { issues: ScopeIssue[] }) {
  const blockers = issues.filter((i) => i.level === 'blocker')
  const warnings = issues.filter((i) => i.level === 'warning')
  if (blockers.length === 0 && warnings.length === 0) return null

  const list = (rows: ScopeIssue[]) => (
    <ul className="mt-1 list-disc space-y-0.5 pl-5">
      {rows.map((i) => (
        <li key={i.id}>
          <button
            type="button"
            onClick={() => scrollToIssue(i.anchor)}
            className="text-left underline-offset-2 hover:underline"
          >
            {i.message}
          </button>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="space-y-2">
      {blockers.length > 0 && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {blockers.length === 1
              ? 'One thing to fix before this quote can be generated:'
              : `${blockers.length} things to fix before this quote can be generated:`}
          </p>
          {list(blockers)}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-warning">
            <Info className="h-4 w-4 shrink-0" />
            Worth a look before this goes out:
          </p>
          {list(warnings)}
        </div>
      )}
    </div>
  )
}
