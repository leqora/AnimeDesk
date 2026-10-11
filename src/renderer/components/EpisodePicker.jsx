import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { EpisodeRow } from './EpisodeRow.jsx'
import { useEpisodeView } from '../episodes/useEpisodeView.js'
import { GROUP_SIZE, episodeGroups, findEpisodeIndex, firstUnwatchedIndex } from '../../shared/episodes.js'

const QUALITIES = ['best', '1080', '720', '480', '360', 'worst']

export function EpisodePicker({ episodes, selected, watched, noted = [], onToggle, prefs = null, onPrefs = null, series = null, poster = null, onReveal = null, loadThumb = null, children }) {
  const t = useT()
  const groups = episodeGroups(episodes)
  const [group, setGroup] = useState(() => Math.floor(firstUnwatchedIndex(episodes, watched) / GROUP_SIZE))
  const [goTo, setGoTo] = useState('')
  const [missing, setMissing] = useState(false)
  const [focus, setFocus] = useState(null)
  const buttons = useRef({})
  const [view, setView] = useEpisodeView()
  const hasMeta = series?.meta === 'ok'
  const asList = hasMeta && view === 'list'
  const rows = new Map((series?.episodes ?? []).map((r) => [r.number, r]))

  useEffect(() => {
    if (focus) buttons.current[focus.ep]?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }, [focus])

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
    setFocus((f) => ({ ep, n: (f?.n ?? 0) + 1 }))
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
      {hasMeta && (
        <div className="ep-view" role="group" aria-label={t('episodes.view')}>
          <button type="button" aria-pressed={view === 'numbers'} onClick={() => setView('numbers')}>{t('episodes.viewNumbers')}</button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>{t('episodes.viewList')}</button>
        </div>
      )}
      {asList ? (
        <div className="ep-list">
          {visible.map((ep) => (
            <EpisodeRow
              key={ep}
              row={rows.get(ep) ?? { number: ep, runtime: null, visibility: 'hidden' }}
              poster={poster}
              watched={watched.includes(Number(ep))}
              selected={selected.includes(ep)}
              noted={noted.includes(ep)}
              onToggle={onToggle}
              onReveal={onReveal}
              loadThumb={loadThumb}
            />
          ))}
        </div>
      ) : (
        <div className="ep-grid">
          {visible.map((ep) => {
            const cls = ['ep', selected.includes(ep) && 'ep--selected', watched.includes(Number(ep)) && 'ep--watched', noted.includes(ep) && 'ep--note'].filter(Boolean).join(' ')
            return (
              <button type="button" key={ep} ref={(el) => { buttons.current[ep] = el }} className={cls} aria-pressed={selected.includes(ep)} onClick={() => onToggle(ep)}>{ep}</button>
            )
          })}
        </div>
      )}
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
