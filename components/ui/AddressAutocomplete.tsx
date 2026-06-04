'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

declare global {
  interface Window { google: any } // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface Props {
  value: string
  onChange: (address: string) => void
  onBlur?: () => void
  placeholder?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlacesLib = any

function loadPlaces(): Promise<PlacesLib> {
  return new Promise((resolve, reject) => {
    function doImport() {
      window.google.maps.importLibrary('places').then(resolve).catch(reject)
    }

    // Already loaded
    if (window.google?.maps?.importLibrary) { doImport(); return }

    // Another script tag is already being injected — wait for it
    if (document.querySelector('script[data-gmaps]')) {
      const iv = setInterval(() => {
        if (window.google?.maps?.importLibrary) { clearInterval(iv); doImport() }
      }, 50)
      return
    }

    // Inject fresh — use loading=async to get the new importLibrary bootstrap
    const s = document.createElement('script')
    s.setAttribute('data-gmaps', '1')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&loading=async`
    s.async = true
    s.onload = () => doImport()
    s.onerror = reject
    document.head.appendChild(s)
  })
}

export function AddressAutocomplete({ value, onChange, onBlur, placeholder }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const placesRef = useRef<PlacesLib>(null)
  const sessionRef = useRef<any>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    loadPlaces().then((places) => {
      placesRef.current = places
      sessionRef.current = new places.AutocompleteSessionToken()
    })
  }, [])

  const fetchSuggestions = useCallback(async (input: string) => {
    if (!placesRef.current || input.length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }
    try {
      const { suggestions: results } =
        await placesRef.current.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          sessionToken: sessionRef.current,
          includedRegionCodes: ['za'],
        })
      const labels: string[] = (results as any[]) // eslint-disable-line @typescript-eslint/no-explicit-any
        .map((s) => s.placePrediction?.text?.toString())
        .filter(Boolean)
      setSuggestions(labels)
      setOpen(labels.length > 0)
    } catch {
      setSuggestions([])
      setOpen(false)
    }
  }, [])

  function handleChange(v: string) {
    onChange(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 300)
  }

  function handleSelect(address: string) {
    onChange(address)
    setSuggestions([])
    setOpen(false)
    if (placesRef.current) {
      sessionRef.current = new placesRef.current.AutocompleteSessionToken()
    }
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150)
          onBlur?.()
        }}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        placeholder={placeholder}
        autoComplete="off"
        className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-muted-foreground"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-border bg-background shadow-lg text-sm overflow-hidden">
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={() => handleSelect(s)}
              className="px-3 py-2.5 cursor-pointer hover:bg-muted transition-colors"
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
