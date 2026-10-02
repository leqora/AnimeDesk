import { useEffect, useState } from 'react'
import { posterTint } from './posterTint.js'

export function usePosterTint(dataUrl) {
  const [tint, setTint] = useState(null)
  useEffect(() => {
    let live = true
    setTint(null)
    if (dataUrl) posterTint(dataUrl).then((value) => { if (live) setTint(value) })
    return () => { live = false }
  }, [dataUrl])
  return tint
}
