import { useEffect, useState } from 'react'

const QUERY = '(max-width: 999.98px)'

// True while the window is narrower than 1000 px (the top bar then folds the pages into one "Menu" button).
export function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(QUERY)?.matches === true)
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY)
    if (!mq) return undefined
    const onChange = (e) => setNarrow(e.matches)
    setNarrow(mq.matches)
    if (mq.addEventListener) { mq.addEventListener('change', onChange); return () => mq.removeEventListener('change', onChange) }
    mq.addListener?.(onChange)
    return () => mq.removeListener?.(onChange)
  }, [])
  return narrow
}
