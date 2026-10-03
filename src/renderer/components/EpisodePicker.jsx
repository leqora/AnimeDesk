import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { GROUP_SIZE, episodeGroups, findEpisodeIndex, firstUnwatchedIndex } from '../../shared/episodes.js'

const QUALITIES = ['best', '1080', '720', '480', '360', 'worst']

export function EpisodePicker({ episodes, selected, watched, noted = [], onToggle, prefs = null, onPrefs = null, children }) {
  const t = useT()
  const groups = episodeGroups(episodes)
  const [group, setGroup] = useState(() => Math.floor(firstUnwatchedIndex(episodes, watched) / GROUP_SIZE))
  const [goTo, setGoTo] = useState('')
  const [missing, setMissing] = useState(false)
  const [focusEp, setFocusEp] = useState(null)
  const buttons = useRef({})

  useEffect(() => {
    if (focusEp != null) buttons.current[focusEp]?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [focusEp, group])

  const current = groups[group] ?? groups[0]
  const visible = current ? episodes.slice(current.from, current.to + 1) : []

  const jump = (e) => {
    e.preventDefault()
    const i = findEpisodeIndex(episodes, goTo)
    if (i < 0) { setMissing(true); return }
    setMissing(false)
    const ep = episodes[i]
    setGroup(Math.floor(i / GROUP_SIZE))
    if (!selected.includes(ep)) onToggle(ep)
    setFocusEp(ep)
  }

  return (
    <div className="episode-picker">
      {groups.length > 1 && (
        <>
          <div className="ep-groups" role="group" aria-label={t('episodes.group')}>
            {groups.map((g, i) => (
              <button type="button" key={g.label} className="ep-group" aria-pressed={i === group} onClick={() => setGroup(i)}>{g.label}</button>
            ))}
          </div>
          <form className="row" onSubmit={jump}>
            <input aria-label={t('episodes.goTo')} placeholder={t('episodes.goTo')} inputMode="decimal" value={goTo} onChange={(e) => { setGoTo(e.target.value); setMissing(false) }} />
            {missing && <span className="muted" role="status">{t('episodes.notFound')}</span>}
          </form>
        </>
      )}
      <div className="ep-grid">
        {visible.map((ep) => {
          const cls = ['ep', selected.includes(ep) && 'ep--selected', watched.includes(Number(ep)) && 'ep--watched', noted.includes(ep) && 'ep--note'].filter(Boolean).join(' ')
          return (
            <button type="button" key={ep} ref={(el) => { buttons.current[ep] = el }} className={cls} aria-pressed={selected.includes(ep)} onClick={() => onToggle(ep)}>{ep}</button>
          )
        })}
      </div>
      <div className="episode-bar">
        {prefs && onPrefs && (
          <>
            <label className="field field--inline">
              <span>{t('episodes.quality')}</span>
              <select aria-label={t('episodes.quality')} value={prefs.quality ?? ''} onChange={(e) => onPrefs({ quality: e.target.value || null })}>
                <option value="">{t('episodes.default')}</option>
                {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            </label>
            <label className="field field--inline">
              <span>{t('episodes.mode')}</span>
              <select aria-label={t('episodes.mode')} value={prefs.mode ?? ''} onChange={(e) => onPrefs({ mode: e.target.value || null })}>
                <option value="">{t('episodes.default')}</option>
                <option value="sub">{t('settings.mode.sub')}</option>
                <option value="dub">{t('settings.mode.dub')}</option>
              </select>
            </label>
          </>
        )}
        {children}
      </div>
    </div>
  )
}
