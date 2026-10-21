import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Modal } from './Modal.jsx'
import { rankSeries, continueSeries, filterByLabel, isBlankQuery } from '../../shared/palette.js'

const PAGES = ['home', 'watchlist', 'schedule', 'downloads', 'profile', 'settings']
const MAX_QUERY = 100

export function CommandPalette({ fullscreen, onRun, onClose }) {
  const api = useApi()
  const t = useT()
  const uid = useId()
  const listId = `${uid}-list`
  const inputRef = useRef(null)
  const [library, setLibrary] = useState({ entries: [], facets: {} })
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.allSettled([api.library.list(), api.library.facets()]).then(([list, facets]) => {
      if (!alive) return
      const entries = list.status === 'fulfilled' && Array.isArray(list.value) ? list.value : []
      const f = facets.status === 'fulfilled' && facets.value ? facets.value : {}
      setLibrary({ entries, facets: f })
    })
    return () => { alive = false }
  }, [api])

  const blank = isBlankQuery(query)
  const groups = useMemo(() => {
    const pages = PAGES.map((page) => ({ key: `page-${page}`, label: t(`nav.${page}`), action: { type: 'page', page } }))
    const actions = [
      { key: 'fullscreen', label: t(fullscreen ? 'palette.action.exitFullscreen' : 'palette.action.fullscreen'), action: { type: 'fullscreen' } },
      { key: 'wizard', label: t('palette.action.wizard'), action: { type: 'wizard' } },
    ]
    const seriesRow = (e) => ({ key: `anime-${e.id}`, label: e.title, status: e.status, action: { type: 'anime', id: e.id } })
    const out = []
    if (blank) {
      const cont = continueSeries(library.entries).map(seriesRow)
      if (cont.length) out.push({ id: 'continue', title: t('palette.group.continue'), rows: cont })
    } else {
      const found = rankSeries(library.entries, library.facets, query).map(seriesRow)
      if (found.length) out.push({ id: 'series', title: t('palette.group.series'), rows: found })
    }
    const p = filterByLabel(pages, query)
    if (p.length) out.push({ id: 'pages', title: t('palette.group.pages'), rows: p })
    const a = filterByLabel(actions, query)
    if (a.length) out.push({ id: 'actions', title: t('palette.group.actions'), rows: a })
    if (!blank) {
      const q = query.trim().slice(0, MAX_QUERY)
      out.push({ id: 'search', title: null, rows: [{ key: 'search', label: t('palette.search', { query: q }), action: { type: 'search', query: q } }] })
    }
    return out
  }, [library, query, blank, fullscreen, t])

  const rows = useMemo(() => groups.flatMap((g) => g.rows), [groups])
  const safeActive = rows.length ? Math.min(active, rows.length - 1) : 0
  const optionId = (key) => `${uid}-opt-${key}`
  const activeRow = rows[safeActive]
  const activeId = activeRow ? optionId(activeRow.key) : undefined

  useEffect(() => {
    const el = activeId ? document.getElementById(activeId) : null
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!rows.length) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((safeActive + step + rows.length) % rows.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeRow) onRun(activeRow.action)
    }
  }

  return (
    <Modal label={t('palette.label')} className="palette" onClose={onClose} initialFocus={inputRef}>
      <input
        ref={inputRef}
        type="text"
        className="palette__input"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-label={t('palette.label')}
        placeholder={t('palette.placeholder')}
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0) }}
        onKeyDown={onKeyDown}
      />
      <div role="listbox" id={listId} className="palette__list" aria-label={t('palette.label')}>
        {groups.map((g) => {
          const body = g.rows.map((r) => {
            const idx = rows.indexOf(r)
            return (
              <div
                key={r.key}
                id={optionId(r.key)}
                role="option"
                aria-selected={idx === safeActive}
                className={`palette__row${idx === safeActive ? ' palette__row--active' : ''}${r.status ? ' palette__row--series' : ''}`}
                onMouseMove={() => { if (idx !== safeActive) setActive(idx) }}
                onMouseEnter={() => setActive(idx)}
                onClick={() => onRun(r.action)}
              >
                <span className="palette__label">{r.label}</span>
                {r.status && <span className="palette__status">{t(`status.${r.status}`)}</span>}
              </div>
            )
          })
          if (!g.title) return <div key={g.id} role="group" className="palette__group">{body}</div>
          const hid = `${uid}-g-${g.id}`
          return (
            <div key={g.id} role="group" aria-labelledby={hid} className="palette__group">
              <div id={hid} className="palette__title">{g.title}</div>
              {body}
            </div>
          )
        })}
      </div>
      <div className="palette__help" aria-hidden="true">{t('palette.help')}</div>
    </Modal>
  )
}
