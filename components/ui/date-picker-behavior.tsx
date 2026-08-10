'use client'

import { useEffect } from 'react'

/** Input types that have a native picker popup worth opening on click. */
const PICKER_TYPES = new Set(['date', 'datetime-local', 'month', 'week', 'time'])

function isPickerInput(node: EventTarget | null): node is HTMLInputElement {
  return (
    node instanceof HTMLInputElement &&
    PICKER_TYPES.has(node.type) &&
    !node.disabled &&
    !node.readOnly
  )
}

function open(input: HTMLInputElement) {
  // showPicker() throws without user activation, and in browsers that don't
  // support it at all — either way the field still works as a typed input.
  try {
    input.showPicker()
  } catch {
    /* no-op */
  }
}

/**
 * Mounted once in the root layout. Makes every native date/time input on the
 * site drop its calendar the moment you click the field — not only when you
 * hit the small indicator icon. Clicking still lands on the segment you aimed
 * at, so typing the date by hand keeps working.
 */
export function DatePickerBehavior() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (isPickerInput(event.target)) open(event.target)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPickerInput(event.target)) return
      // Enter/Space/Down are the conventional "open the dropdown" keys. Arrow
      // up/down otherwise increment the focused segment, which stays available
      // once the picker is open.
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault()
        open(event.target)
      }
    }

    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return null
}
