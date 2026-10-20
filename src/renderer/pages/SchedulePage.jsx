import { useEffect, useId, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { PosterFrame } from '../components/Poster.jsx'
import { useRouteState } from '../nav/useNavigation.js'
import { useNow } from '../useNow.js'
import { dayWindow, groupDay } from '../../shared/schedule.js'

const MAX_POSTERS = 40
const SKELETON_ROWS = 5

// One row = one button; only the episode number(s), the air time and list facts are shown (no spoilers).
// The poster goes through PosterFrame with the data URL main sent, never Poster with a title (that would look the series up on AniList).
function ScheduleRow({ row, now, ready, poster, inWatchlist, dayLabel, onOpen }) {
  const t = useT()
  const noteId = useId()
  const time = new Date(row.airingAt).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' })
  const [from, to] = row.episodes
  const episode = from === to ? t('schedule.episode', { n: from }) : t('schedule.episodes', { from, to })
  const aired = row.airingAt <= now
  const label = t('schedule.rowLabel', { title: row.title, episode, day: dayLabel, time }) + (aired ? t('schedule.rowAired') : '')
  const note = t('schedule.noPoster')
  // undefined = still on its way (skeleton), null = nothing to show (empty frame)
  const info = row.posterHidden ? { poster: null } : poster === undefined ? undefined : { poster }
  return (
    <li className="schedule-row-item">
      <button
        type="button" className={aired ? 'schedule-row schedule-row--aired' : 'schedule-row'} disabled={!ready} onClick={() => onOpen(row)}
        aria-label={label} aria-describedby={row.posterHidden ? noteId : undefined}
      >
        <span className="schedule-row__poster" title={row.posterHidden ? note : undefined}>
          <PosterFrame info={info} />
        </span>
        {row.posterHidden && <span id={noteId} hidden>{note}</span>}
        <span className="schedule-row__time" aria-hidden="true">{time}</span>
        <span className="schedule-row__main" aria-hidden="true">
          <span className="card__title">{row.title}</span>
          <span className="card__meta">{episode}{row.format ? ` · ${row.format}` : ''}</span>
        </span>
        <span className="schedule-row__tags" aria-hidden="true">
          {aired && <span className="schedule-badge">{t('schedule.aired')}</span>}
          {inWatchlist && <span className="schedule-badge schedule-badge--accent">{t('schedule.inWatchlist')}</span>}
        </span>
      </button>
    </li>
  )
}

export function SchedulePage({ ready, onOpenAnime, onSearch }) {
  const api = useApi()
  const t = useT()
  const now = useNow()
  const [data, setData] = useState(null)
  const [posters, setPosters] = useState({})
  const [modeChoice, setMode] = useRouteState('mode', null)
  const [dayChoice, setDay] = useRouteState('day', null)

  const window7 = dayWindow(now)
  const dayKey = window7.from

  // list() answers are applied newest-first: an older answer arriving late is ignored.
  const seq = useRef(0)
  const load = (force = false) => {
    const mine = ++seq.current
    const call = force ? api.schedule.list({ force: true }) : api.schedule.list()
    return call.then((r) => { if (mine === seq.current && r && Array.isArray(r.items)) setData(r) }).catch(() => {
      if (mine === seq.current) setData((d) => d ?? { state: 'error', refreshing: false, fetchedAt: null, from: 0, days: [], items: [] })
    })
  }
  // Loaded when the page opens, on every schedule/library change, and when the local day changes (midnight).
  useEffect(() => {
    load()
    const offSchedule = api.schedule.onChanged(() => load())
    const offLibrary = api.onLibraryChanged(() => load())
    return () => { seq.current++; offSchedule(); offLibrary() }
  }, [api, dayKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const items = data?.items ?? []
  const mineItems = items.filter((i) => i.entryId != null)
  const mode = modeChoice ?? (mineItems.length > 0 ? 'mine' : 'all')
  const shown = mode === 'mine' ? mineItems : items
  // a stored day that left the window (past midnight) falls back to today
  const dayStart = window7.days.includes(dayChoice) ? dayChoice : window7.days[0]
  const dayIndex = window7.days.indexOf(dayStart)
  const dayEnd = dayIndex + 1 < window7.days.length ? window7.days[dayIndex + 1] : window7.to
  const rows = groupDay(shown, dayStart, dayEnd)

  const dayLabel = (i) => {
    if (i === 0) return t('schedule.today')
    if (i === 1) return t('schedule.tomorrow')
    const d = new Date(window7.days[i])
    return `${d.toLocaleDateString(t.locale, { weekday: 'short' })} ${d.getDate()}.`
  }

  // Posters for the selected day's rows, never for rows whose poster is held back.
  const idsKey = rows.filter((r) => !r.posterHidden).slice(0, MAX_POSTERS).map((r) => r.mediaId).join(',')
  useEffect(() => {
    if (!idsKey) return undefined
    let alive = true
    const ids = idsKey.split(',').map(Number)
    api.schedule.posters(ids).then((map) => {
      if (!alive || !map || typeof map !== 'object') return
      // an id missing from the answer gets the empty frame instead of a skeleton that never ends
      setPosters((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, null])), ...map }))
    }).catch(() => {})
    return () => { alive = false }
  }, [api, idsKey, data])

  const open = (row) => (row.entryId != null ? onOpenAnime(row.entryId) : onSearch(row.romaji ?? row.title))
  const state = data?.state ?? 'loading'
  const usable = state === 'ok' || state === 'stale'
  const staleTime = data?.fetchedAt != null ? new Date(data.fetchedAt).toLocaleString(t.locale, { day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
  const dayCount = (i) => groupDay(shown, window7.days[i], i + 1 < window7.days.length ? window7.days[i + 1] : window7.to).length

  return (
    <section className="page schedule-page">
      <header className="page__head">
        <h2 className="hud">{t('schedule.title')}</h2>
        <p className="muted">{t('schedule.subtitle')}</p>
      </header>
      {state === 'error' && (
        <div className="schedule-state">
          <p className="muted">{t('schedule.error')}</p>
          <button type="button" onClick={() => load(true)}>{t('schedule.retry')}</button>
        </div>
      )}
      {state === 'loading' && (
        <ul className="schedule-list" data-testid="schedule-skeleton" aria-hidden="true">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => <li key={i} className="schedule-row schedule-row--skeleton"><span className="schedule-row__poster"><PosterFrame info={undefined} /></span></li>)}
        </ul>
      )}
      {usable && (
        <>
          {state === 'stale' && (
            <div className="schedule-state schedule-state--stale">
              <p className="muted">{t('schedule.stale', { time: staleTime })}</p>
              <button type="button" onClick={() => load(true)}>{t('schedule.retry')}</button>
            </div>
          )}
          <div className="status-chips" role="group" aria-label={t('schedule.modeGroup')}>
            <button type="button" className="chip-btn" aria-pressed={mode === 'mine'} onClick={() => setMode('mine')}>
              {t('schedule.mine')} <span className="chip-btn__count">{mineItems.length}</span>
            </button>
            <button type="button" className="chip-btn" aria-pressed={mode === 'all'} onClick={() => setMode('all')}>
              {t('schedule.all')} <span className="chip-btn__count">{items.length}</span>
            </button>
          </div>
          {mode === 'all' && <p className="muted schedule-note">{t('schedule.noPosterNote')}</p>}
          <div className="status-chips schedule-days" role="group" aria-label={t('schedule.daysGroup')}>
            {window7.days.map((d, i) => (
              <button key={d} type="button" className="chip-btn" aria-pressed={d === dayStart} onClick={() => setDay(d)}>
                {dayLabel(i)} <span className="chip-btn__count">{dayCount(i)}</span>
              </button>
            ))}
          </div>
          {mode === 'mine' && mineItems.length === 0 ? (
            <div className="schedule-state">
              <p className="muted">{t('schedule.mineEmpty')}</p>
              <button type="button" onClick={() => setMode('all')}>{t('schedule.showAll')}</button>
            </div>
          ) : rows.length === 0 ? (
            <p className="muted">{t('schedule.dayEmpty')}</p>
          ) : (
            <ul className="schedule-list">
              {rows.map((r) => (
                <ScheduleRow
                  key={r.mediaId} row={r} now={now} ready={ready} poster={posters[r.mediaId]} dayLabel={dayLabel(dayIndex)}
                  inWatchlist={mode === 'all' && r.entryId != null} onOpen={open}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
