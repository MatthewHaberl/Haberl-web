'use client'

import { useRef, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (address: string) => void
  onBlur?: () => void
  placeholder?: string
  /** Associates a wrapping <label htmlFor> / <FormField htmlFor> with the input. */
  id?: string
  name?: string
  required?: boolean
  /** Defaults to 'off' so the browser's own autofill doesn't fight the Google dropdown. */
  autoComplete?: string
  /** Extra classes merged onto the input (same base styling as the shared <Input>). */
  className?: string
}

export function AddressAutocomplete({
  value,
  onChange,
  onBlur,
  placeholder,
  id,
  name,
  required,
  autoComplete = 'off',
  className,
}: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fetchSuggestions = useCallback(async (input: string) => {
    if (input.length < 3) { setSuggestions([]); setOpen(false); return }
    try {
      const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(input)}`)
      const data: { suggestions: string[] } = await res.json()
      setSuggestions(data.suggestions ?? [])
      setOpen((data.suggestions ?? []).length > 0)
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
  }

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        required={required}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150)
          onBlur?.()
        }}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={cn(
          'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background ' +
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
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
