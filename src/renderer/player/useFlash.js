import { useEffect, useRef, useState } from 'react'

// A short message over the video (skipped intro, subtitle offset, speed…).
export function useFlash() {
  const [text, setText] = useState(null)
  const timer = useRef(null)
  const show = useRef((value, ms = 1500) => {
    setText(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setText(null), ms)
  }).current
  useEffect(() => () => clearTimeout(timer.current), [])
  return { text, show }
}
