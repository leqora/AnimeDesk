import { useRef, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { formatTime, segmentAt } from '../../shared/player.js'

const pct = (x, duration) => `${(x / duration) * 100}%`

// Seek slider with the AniSkip segments, what is already buffered, and the time under the mouse.
export function PlayerTimeline({ time, duration, buffered = [], segments = [], onSeek }) {
  const t = useT()
  const input = useRef(null)
  const [hover, setHover] = useState(null) // { frac, time }
  const known = Number.isFinite(duration) && duration > 0
  const names = { op: t('player.segment.op'), ed: t('player.segment.ed'), recap: t('player.segment.recap') }
  const onMove = (e) => {
    const rect = input.current?.getBoundingClientRect()
    if (!known || !(rect?.width > 0)) return
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    setHover({ frac, time: frac * duration })
  }
  const kind = hover && segmentAt(hover.time, Object.fromEntries(segments.map((s) => [s.kind, s])))
  return (
    <div className="player__timeline" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {known && buffered.map((r) => (
        <span key={`${r.start}-${r.end}`} className="player__buffered" style={{ left: pct(r.start, duration), width: pct(r.end - r.start, duration) }} />
      ))}
      {known && segments.map((s) => (
        <span key={s.kind} className={`player__segment player__segment--${s.kind}`} style={{ left: pct(s.start, duration), width: pct(s.end - s.start, duration) }} />
      ))}
      <input ref={input} type="range" min="0" max={known ? duration : 0} step="0.1" value={Math.min(time, known ? duration : 0)} aria-label={t('player.seek')} onChange={(e) => onSeek(Number(e.target.value))} />
      {known && hover && (
        <span className="player__tooltip hud" role="tooltip" style={{ left: `clamp(24px, ${hover.frac * 100}%, calc(100% - 24px))` }}>
          {formatTime(hover.time)}{kind ? ` · ${names[kind]}` : ''}
        </span>
      )}
    </div>
  )
}
