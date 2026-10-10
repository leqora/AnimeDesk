import { useEffect } from 'react'
import { useLatest } from './useLatest.js'

const NET_RETRIES = 3
// hls.js 1.x: startLoad() is a no-op until a manifest has been parsed, so these must reload the source
const MANIFEST_ERRORS = new Set(['manifestLoadError', 'manifestLoadTimeOut', 'manifestParsingError'])

// Attaches the stream (or a downloaded file) to the <video>; hls.js gets a small retry budget before onFatal.
export function useHlsSource({ video, open, HlsImpl, onFatal }) {
  const fatal = useLatest(onFatal)
  useEffect(() => {
    const v = video.current
    if (open.kind === 'file') { v.src = open.src; return undefined }
    const hls = new HlsImpl({ enableWorker: true })
    let netRetries = 0
    let mediaErrors = 0
    // progress means the earlier errors were transient; give later ones the full budget again
    hls.on(HlsImpl.Events.FRAG_CHANGED, () => { netRetries = 0; mediaErrors = 0 })
    hls.on(HlsImpl.Events.ERROR, (_e, d) => {
      if (!d.fatal) return
      if (d.type === HlsImpl.ErrorTypes.NETWORK_ERROR && netRetries < NET_RETRIES) {
        netRetries++
        if (MANIFEST_ERRORS.has(d.details) || !hls.levels?.length) hls.loadSource(open.src)
        else hls.startLoad()
        return
      }
      if (d.type === HlsImpl.ErrorTypes.MEDIA_ERROR && mediaErrors < 2) {
        mediaErrors++
        if (mediaErrors === 2) hls.swapAudioCodec()
        hls.recoverMediaError()
        return
      }
      fatal.current()
    })
    hls.loadSource(open.src)
    hls.attachMedia(v)
    return () => hls.destroy()
  }, [open.playbackId])
}
