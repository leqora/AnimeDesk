import { useEffect, useState } from 'react'

// A clock for countdowns; only the Hero and the detail page use it (cards compute once per render).
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
