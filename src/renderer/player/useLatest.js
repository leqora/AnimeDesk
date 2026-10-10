import { useRef } from 'react'

// A ref holding the value from the latest render, for long-lived handlers (keydown, intervals, timers).
export function useLatest(value) {
  const ref = useRef(value)
  ref.current = value
  return ref
}
