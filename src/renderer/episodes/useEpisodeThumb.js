import { useEffect, useState } from 'react'

// The picture of one episode row, only as main allowed it (a hidden row or one without a thumb never asks).
// With an IntersectionObserver the request waits until `ref` scrolls into view (a group holds up to 100 rows).
export function useEpisodeThumb({ row, loadThumb, ref }) {
  const [src, setSrc] = useState(null)
  const hidden = row.visibility === 'hidden'
  useEffect(() => {
    setSrc(null)
    if (hidden || !row.hasThumb || !loadThumb) return undefined
    let live = true
    const fetchThumb = () => loadThumb(row.number).then((u) => { if (live && u) setSrc(u) }).catch(() => {})
    if (typeof IntersectionObserver === 'undefined' || !ref?.current) {
      fetchThumb()
      return () => { live = false }
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fetchThumb() }
    })
    io.observe(ref.current)
    return () => { live = false; io.disconnect() }
  }, [row.number, hidden, row.hasThumb, loadThumb])
  return src
}
