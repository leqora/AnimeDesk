import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Modal } from './Modal.jsx'

const DEBOUNCE_MS = 400
const MAX_RESULTS = 8

// Manual candidate picker: search AniList (debounced), choose the right series, confirm it for the entry.
// Only title / romaji / year / format / episodes / poster are shown, never a description.
export function AniListPicker({ open, initialQuery = '', entryId, onClose, onPicked }) {
  if (!open) return null
  return <PickerDialog initialQuery={initialQuery} entryId={entryId} onClose={onClose} onPicked={onPicked} />
}

function PickerDialog({ initialQuery, entryId, onClose, onPicked }) {
  const api = useApi()
  const t = useT()
  const inputRef = useRef(null)
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const first = useRef(true)

  useEffect(() => {
    let active = true
    setResults(null)
    const run = () => {
      Promise.resolve(api.anilistSync.candidates(query))
        .then((list) => { if (active) setResults((list ?? []).slice(0, MAX_RESULTS)) })
        .catch(() => { if (active) setResults([]) })
    }
    // The prefilled query goes out at once; later typing waits for a pause.
    const timer = setTimeout(run, first.current ? 0 : DEBOUNCE_MS)
    first.current = false
    return () => { active = false; clearTimeout(timer) }
  }, [api, query])

  const pick = async (c) => {
    if (busy) return
    setBusy(true)
    setError(null)
    let r
    try { r = await api.anilistSync.confirm(entryId, c.id) } catch { r = { ok: false, error: 'invalid' } }
    setBusy(false)
    if (r?.ok) onPicked?.(c)
    else setError(r?.error === 'taken' ? t('anilist.taken', { title: r.title ?? '' }) : t('anilist.confirmInvalid'))
  }

  return (
    <Modal label={t('anilist.pickerTitle')} className="anilist-picker" onClose={onClose} initialFocus={inputRef}>
      <h2>{t('anilist.pickerTitle')}</h2>
      <input
        ref={inputRef} type="search" aria-label={t('anilist.searchLabel')} placeholder={t('anilist.searchLabel')}
        value={query} spellCheck={false} onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p className="anilist-confirm__error" role="alert">{error}</p>}
      {results === null && <p className="muted" role="status">{t('anilist.searching')}</p>}
      {results !== null && results.length === 0 && <p className="muted" role="status">{t('anilist.noResults')}</p>}
      {results !== null && results.length > 0 && (
        <ul className="anilist-confirm" aria-label={t('anilist.pickerTitle')}>
          {results.map((c) => {
            const meta = [c.year, c.format, c.episodes != null ? t('detail.episodesCount', { n: c.episodes }) : null].filter((x) => x != null).join(' · ')
            return (
              <li key={c.id} className="anilist-confirm__row">
                <div className="anilist-confirm__poster">{c.poster && <img src={c.poster} alt="" />}</div>
                <div className="anilist-confirm__text">
                  <span className="anilist-confirm__library">{c.title}</span>
                  {c.romaji && c.romaji !== c.title && <span className="muted">{c.romaji}</span>}
                  {meta && <span className="muted">{meta}</span>}
                </div>
                <button type="button" className="primary" disabled={busy} onClick={() => pick(c)}>{t('anilist.choose')}</button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="row"><button type="button" onClick={onClose}>{t('update.close')}</button></div>
    </Modal>
  )
}
