import { useEffect, useRef } from 'react'
import { useLatest } from './useLatest.js'

// Tells onOpenChange(open) whenever `open` changes (not on the first closed render), and false once more if the
// component goes away while open.
export function useReportOpen(open, onOpenChange) {
  const reported = useRef(false)
  const onChange = useLatest(onOpenChange)
  useEffect(() => {
    if (reported.current === open) return
    reported.current = open
    onChange.current?.(open)
  }, [open])
  useEffect(() => () => { if (reported.current) onChange.current?.(false) }, [])
}
