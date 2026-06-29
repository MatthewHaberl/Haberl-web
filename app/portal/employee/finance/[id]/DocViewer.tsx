'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { PanelRightOpen, PanelRightClose, ExternalLink } from 'lucide-react'

const STORE_KEY = 'fin-doc-preview-open'

type Kind = 'pdf' | 'image' | 'other'

/**
 * Two-pane document viewer: the extracted/text content on the left, the
 * original scan on the right. The original is only fetched when the preview
 * is toggled on (so the list of docs doesn't hammer storage), and the
 * choice is remembered across documents via localStorage.
 */
export function DocViewer({
  previewUrl, kind, fileName, children,
}: {
  previewUrl: string
  kind: Kind
  fileName: string | null
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setOpen(localStorage.getItem(STORE_KEY) === '1')
    setReady(true)
  }, [])

  function toggle() {
    setOpen((o) => {
      const n = !o
      localStorage.setItem(STORE_KEY, n ? '1' : '0')
      return n
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          {open ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          {open ? 'Hide original' : 'Show original'}
        </button>
      </div>

      <div className={open ? 'lg:flex lg:items-start lg:gap-4' : ''}>
        <div className={`space-y-6 ${open ? 'lg:min-w-0 lg:flex-1' : ''}`}>
          {children}
        </div>

        {open && (
          <aside className="mt-4 lg:mt-0 lg:sticky lg:top-4 lg:w-[46%] lg:shrink-0">
            <div className="rounded-lg border border-border bg-muted/30">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm">
                <span className="truncate font-medium" title={fileName ?? 'Original'}>
                  {fileName ?? 'Original'}
                </span>
                <a
                  href={previewUrl} target="_blank" rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
              </div>
              {/* Only mount the heavy element once we're client-ready and open */}
              {ready && (
                kind === 'pdf' ? (
                  <iframe
                    src={previewUrl}
                    title="Original document"
                    className="h-[82vh] w-full rounded-b-lg bg-white"
                  />
                ) : kind === 'image' ? (
                  <div className="max-h-[82vh] overflow-auto rounded-b-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt={fileName ?? 'Original document'} className="w-full" />
                  </div>
                ) : (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    This file type can&rsquo;t be previewed inline.{' '}
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      Open the original
                    </a>
                    .
                  </div>
                )
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
