import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { useLatest } from './useLatest.js'
import { useSubtitleCues } from './useSubtitleCues.js'
import { clampOffset, formatOffset } from '../../shared/subtitles.js'

export const OFFSET_SAVE_MS = 500
export const SUBS_FLASH_MS = 6000

// Subtitle on/off (per sub/dub), the per-series offset (saved after the keys settle), and the 415 probe for formats we cannot show.
export function usePlayerSubtitles({ video, trackEl, open, mode, settings, onSettings, probeSub, flash }) {
  const api = useApi()
  const t = useT()
  const [on, setOn] = useState(settings.subtitles.enabled[mode])
  const [offset, setOffset] = useState(clampOffset(open.subOffset ?? 0))
  const [unsupported, setUnsupported] = useState(false)
  const timer = useRef(null)
  const pending = useRef(null)
  const { cues, status } = useSubtitleCues(trackEl, video, offset, open.playbackId)
  const available = Boolean(open.subtitleUrl) && status !== 'error' && !unsupported
  const hint = !open.subtitleUrl ? t('player.noSubs') : unsupported ? t('player.subsUnsupported') : status === 'error' ? t('player.subsFailed') : null
  const latest = useLatest({ api, t, open, mode, on, offset, available, settings, onSettings, flash })

  // Written after the keys settle (holding H must not write the file 20 times); flushed on close and unmount.
  const flush = useRef(() => {
    clearTimeout(timer.current)
    const value = pending.current
    pending.current = null
    const l = latest.current
    if (value != null) l.api.seriesPrefs.set(l.open.title, { subOffset: { [l.mode]: value } })
  }).current
  const shift = (delta) => {
    const l = latest.current
    if (!l.available) return
    const next = clampOffset(l.offset + delta)
    l.offset = next // repeated keys before the next render must build on this value
    setOffset(next)
    l.flash(l.t('player.subOffset', { value: formatOffset(next, l.settings.language) }))
    pending.current = next
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, OFFSET_SAVE_MS)
  }
  const reset = () => shift(-latest.current.offset)
  const toggle = () => {
    const l = latest.current
    if (!l.available) return
    const next = !l.on
    l.on = next
    setOn(next)
    l.onSettings({ subtitles: { enabled: { [l.mode]: next } } })
  }

  useEffect(() => {
    setUnsupported(false)
    if (!open.subtitleUrl) return undefined
    let cancelled = false
    Promise.resolve().then(() => probeSub(open.subtitleUrl)).then((code) => {
      if (cancelled || code !== 415) return
      setUnsupported(true)
      if (latest.current.on) latest.current.flash(latest.current.t('player.subsUnsupported'), SUBS_FLASH_MS)
    }, () => {})
    return () => { cancelled = true }
  }, [open.playbackId])
  useEffect(() => flush, [])

  return { on, available, hint, cues, offset, offsetLabel: formatOffset(offset, settings.language), toggle, shift, reset, flush }
}
