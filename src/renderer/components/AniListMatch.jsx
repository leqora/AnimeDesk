import { useCallback, useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { AniListPicker } from './AniListPicker.jsx'

// AniList match card + sync state line for the series detail. Shown only while an AniList account is connected.
// `info` is the detail's AniList info (title/year/episodes); onChanged refreshes the library entry.
export function AniListMatch({ entry, info, onChanged = () => {} }) {
  const api = useApi()
  const t = useT()
  const [connected, setConnected] = useState(false)
  const [sync, setSync] = useState(null)
  const [optOut, setOptOut] = useState(false)
  const [picker, setPicker] = useState(false)
  const [error, setError] = useState(null)
  const confirmed = entry.aniListConfirmed === true && entry.aniListId != null

  useEffect(() => {
    let active = true
    api.anilistAuth.status().then((s) => { if (active) setConnected(Boolean(s?.connected)) }).catch(() => {})
    const off = api.anilistAuth.onChange((s) => { if (active) setConnected(Boolean(s?.connected)) })
    return () => { active = false; off?.() }
  }, [api])

  const refresh = useCallback(() => {
    api.anilistSync.stateFor(entry.id).then((s) => {
      setSync(s ?? null)
      // No per-series pref is exposed to the renderer: "off" for a confirmed entry while connected = opted out.
      setOptOut(s?.state === 'off')
    }).catch(() => {})
  }, [api, entry.id])
  useEffect(() => {
    if (!connected || !confirmed) return undefined
    refresh()
    return api.anilistSync.onChange(refresh)
  }, [api, connected, confirmed, refresh])

  if (!connected) return null

  const confirm = async () => {
    setError(null)
    let r
    try { r = await api.anilistSync.confirm(entry.id, entry.aniListId) } catch { r = { ok: false, error: 'invalid' } }
    if (r?.ok) onChanged()
    else setError(r?.error === 'taken' ? t('anilist.taken', { title: r.title ?? '' }) : t('anilist.confirmInvalid'))
  }
  const toggleOptOut = async (checked) => {
    setOptOut(checked)
    try { await api.anilistSync.setEnabled(entry.id, !checked) } catch { setOptOut(!checked) }
  }
  const time = (ms) => new Date(ms).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' })

  let line = null
  if (confirmed && sync && !optOut) {
    const { state, progress, retryAt } = sync
    if (state === 'synced' && progress > 0) line = t('anilist.syncedEp', { n: progress })
    else if ((state === 'pending' || state === 'error') && retryAt != null) line = t('anilist.syncRetry', { time: time(retryAt) })
    else if (state === 'pending') line = t('anilist.syncWaiting')
    else if (state === 'error') line = t('anilist.syncRejected')
    else if (state === 'mismatch') line = t('anilist.syncMismatch')
    else if (state === 'expired') line = t('anilist.expired')
  }

  const meta = [info?.year, info?.episodes != null ? t('detail.episodesCount', { n: info.episodes }) : null].filter((x) => x != null).join(' · ')

  return (
    <div className="anilist-match">
      {!confirmed && (
        entry.aniListId == null ? (
          <div className="row">
            <span className="muted">{t('anilist.notFound')}</span>
            <button type="button" onClick={() => setPicker(true)}>{t('anilist.choose')}</button>
          </div>
        ) : info && (
          <div className="row">
            <span>{t('anilist.matchLabel')} <strong>{info.title}</strong>{meta && <span className="muted"> · {meta}</span>}</span>
            <button type="button" className="primary" onClick={confirm}>{t('anilist.confirmYes')}</button>
            <button type="button" onClick={() => setPicker(true)}>{t('anilist.confirmNo')}</button>
          </div>
        )
      )}
      {confirmed && (
        <div className="row">
          {line && <span role="status" className="anilist-match__state muted">{line}</span>}
          <button type="button" onClick={() => setPicker(true)}>{t('anilist.change')}</button>
          <label className="check">
            <input type="checkbox" checked={optOut} onChange={(e) => toggleOptOut(e.target.checked)} />
            {t('anilist.optOut')}
          </label>
        </div>
      )}
      {error && <p className="anilist-confirm__error" role="alert">{error}</p>}
      <AniListPicker
        open={picker} initialQuery={entry.title} entryId={entry.id}
        onClose={() => setPicker(false)} onPicked={() => { setPicker(false); onChanged() }}
      />
    </div>
  )
}
