'use client'

import { useRef, useState } from 'react'

/** Renders the saved quote HTML isolated in an iframe, sized to its content. */
export function QuoteFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(900)

  return (
    <iframe
      ref={ref}
      srcDoc={html}
      title="Solar quote"
      sandbox="allow-same-origin"
      className="w-full rounded-lg border border-border bg-white"
      style={{ height }}
      onLoad={() => {
        try {
          const h = ref.current?.contentWindow?.document?.body?.scrollHeight
          if (h && h > 300) setHeight(h + 48)
        } catch {
          /* keep fallback height */
        }
      }}
    />
  )
}
