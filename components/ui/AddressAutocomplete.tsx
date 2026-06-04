'use client'

import { useEffect, useRef } from 'react'

declare global {
  interface Window { google: any } // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface Props {
  value: string
  onChange: (address: string) => void
  onBlur?: () => void
  placeholder?: string
}

function loadGooglePlaces(): Promise<void> {
  return new Promise((resolve) => {
    if (window.google?.maps?.places) { resolve(); return }

    let script = document.querySelector<HTMLScriptElement>('script[data-gmaps]')
    if (!script) {
      script = document.createElement('script')
      script.setAttribute('data-gmaps', '1')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places`
      script.async = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', () => resolve(), { once: true })
    // If script already finished loading before this listener was added
    if ((script as any).readyState === 'complete' || window.google?.maps?.places) resolve()
  })
}

export function AddressAutocomplete({ value, onChange, onBlur, placeholder }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const acRef = useRef<any>(null) // eslint-disable-line @typescript-eslint/no-explicit-any

  // Sync external value changes to uncontrolled input (e.g. form reset)
  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = value
    }
  }, [value])

  // Boot autocomplete once Maps + Places library is available
  useEffect(() => {
    if (!inputRef.current) return
    let cancelled = false

    loadGooglePlaces().then(() => {
      if (cancelled || !inputRef.current || acRef.current) return

      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: ['address'],
        componentRestrictions: { country: 'za' },
        fields: ['formatted_address'],
      })

      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        const addr: string = place.formatted_address ?? inputRef.current?.value ?? ''
        if (inputRef.current) inputRef.current.value = addr
        onChange(addr)
      })

      acRef.current = ac
    })

    return () => { cancelled = true }
  }, [onChange])

  return (
    <input
      ref={inputRef}
      defaultValue={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      autoComplete="off"
      className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted-foreground"
    />
  )
}
