import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from './Icon.jsx'

// Shown on every page while an app-launched external mpv plays. `onGone` fires when the bar
// disappears while keyboard focus was inside it, so the caller can move focus somewhere sensible.
export function ExternalPlayerBar({ onGone }) {
  const api = useApi()
  const t = useT()
  const [current, setCurrent] = useState(null)
  const [stoppingId, setStoppingId] = useState(null)
  const ref = useRef(null)
  const goneRef = useRef(onGone)
  goneRef.current = onGone
  const stoppingRef = useRef(null)
  stoppingRef.current = stoppingId

  useEffect(() => {
    let pushed = false
    const off = api.externalPlayer.onChange((next) => {
      pushed = true
      if (!next) {
        const active = document.activeElement
        // a disabled button may already have dropped focus to <body>
        const inside = ref.current && (ref.current.contains(active) || (stoppingRef.current != null && (!active || active === document.body)))
        if (inside) goneRef.current?.()
      }
      setCurrent(next ?? null)
    })
    Promise.resolve(api.externalPlayer.state()).then((s) => { if (!pushed) setCurrent(s ?? null) }).catch(() => {})
    return off
  }, [api])

  if (!current) return null
  const text = current.episode != null && current.episode !== ''
    ? t('externalPlayer.playing', { title: current.title, episode: current.episode })
    : t('externalPlayer.playingNoEpisode', { title: current.title })
  const stopping = stoppingId === current.id
  return (
    <div className="external-bar" role="region" aria-label={t('externalPlayer.label')} ref={ref}>
      <Icon name="play" />
      <span className="external-bar__text" aria-live="polite">{text}</span>
      <button type="button" disabled={stopping} onClick={() => { setStoppingId(current.id); Promise.resolve(api.externalPlayer.stop(current.id)).catch(() => setStoppingId(null)) }}>
        {stopping ? t('externalPlayer.stopping') : t('externalPlayer.stop')}
      </button>
    </div>
  )
}
