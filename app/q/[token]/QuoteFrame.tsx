'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Renders the saved quote HTML isolated in an iframe, sized to its content.
 *
 * Measuring on `load` alone isn't enough: with srcDoc the event can fire before
 * the document has laid out (and React can attach the handler after it fired),
 * which left long quotes stuck at the 900px fallback with the rest hidden
 * behind an inner scrollbar. So we also measure on mount, on a couple of short
 * retries, and whenever the inner body resizes.
 */
export function QuoteFrame({ html, title = 'Quote' }: { html: string; title?: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(900)

  const measure = useCallback(() => {
    try {
      const body = ref.current?.contentWindow?.document?.body
      const h = Math.max(body?.scrollHeight ?? 0, ref.current?.contentWindow?.document?.documentElement?.scrollHeight ?? 0)
      if (h > 300) setHeight((prev) => (Math.abs(prev - (h + 48)) > 8 ? h + 48 : prev))
    } catch {
      /* cross-origin or not ready — keep the current height */
    }
  }, [])

  useEffect(() => {
    measure()
    const timers = [100, 400, 1200].map((ms) => setTimeout(measure, ms))

    // Late layout (web fonts, images) changes the height after our retries.
    let observer: ResizeObserver | undefined
    try {
      const body = ref.current?.contentWindow?.document?.body
      if (body && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure)
        observer.observe(body)
      }
    } catch {
      /* not ready yet — the load handler and retries still cover it */
    }

    return () => {
      timers.forEach(clearTimeout)
      observer?.disconnect()
    }
  }, [html, measure])

  return (
    <iframe
      ref={ref}
      srcDoc={html}
      title={title}
      sandbox="allow-same-origin"
      className="w-full rounded-lg border border-border bg-white"
      style={{ height }}
      onLoad={measure}
    />
  )
}
