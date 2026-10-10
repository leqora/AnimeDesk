// The player (and hls.js, most of the renderer bundle) is loaded on first use instead of at startup.
export function createLoader(importer) {
  let pending = null
  return () => {
    // a failed load is forgotten so the next playback can try again
    pending ??= importer().catch((err) => { pending = null; throw err })
    return pending
  }
}

export const loadPlayer = createLoader(() => import('../components/PlayerView.jsx'))
