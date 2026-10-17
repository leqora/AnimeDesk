import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { ConfirmButton } from './ConfirmButton.jsx'
import { Modal } from './Modal.jsx'
import { AniListConfirmList } from './AniListConfirmList.jsx'

const NONE = { connected: false, name: null, expiresAt: null, state: 'none' }
const CONNECT_ERRORS = { rejected: 'anilist.err.rejected', network: 'anilist.err.network', unavailable: 'anilist.err.unavailable' }

// Settings section body: connection state, token paste and the bulk "is this the right series" confirmation.
// onPick(entry) opens the manual candidate picker (wired by the page).
export function AniListAccount({ onPick = () => {}, refreshKey = 0 }) {
  const api = useApi()
  const t = useT()
  const [status, setStatus] = useState(NONE)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null) // translation key
  const [configured, setConfigured] = useState(true)
  const [revoked, setRevoked] = useState(false)
  const [pending, setPending] = useState([])
  const [open, setOpen] = useState(false)
  const [rowErrors, setRowErrors] = useState({})

  useEffect(() => {
    let active = true
    api.anilistAuth.status().then((s) => { if (active && s) setStatus(s) }).catch(() => {})
    const off = api.anilistAuth.onChange((s) => { if (s) { setStatus(s); if (s.connected) setRevoked(false) } })
    return () => { active = false; off?.() }
  }, [api])

  const listRef = useRef(null)
  const openRef = useRef(null)
  const refocus = useRef(false)

  const refreshPending = useCallback(() => api.anilistSync.pendingConfirm().then((list) => setPending(list ?? [])).catch(() => {}), [api])
  // A manual pick (refreshKey bump) removes the row whose button had focus: once the refreshed list is in,
  // park focus on the list's first button (or the "Potvrdi serije" button when the modal is gone).
  useEffect(() => { if (refreshKey > 0) refocus.current = true }, [refreshKey])
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    const first = listRef.current?.querySelector('button')
    ;(first ?? openRef.current)?.focus()
  }, [pending])
  useEffect(() => {
    refreshPending()
    return api.anilistSync.onChange(() => { refreshPending() })
  }, [api, refreshPending, refreshKey]) // refreshKey: the page changed a match without a sync event
  useEffect(() => { if (open && pending.length === 0) setOpen(false) }, [open, pending.length])

  const authorize = async () => {
    const ok = await api.anilistAuth.openAuthorize()
    if (ok === false) setConfigured(false)
  }
  const save = async () => {
    if (busy || !token.trim()) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.anilistAuth.connect(token.trim())
      if (r?.ok) { setToken(''); setStatus(r.status); setRevoked(false) }
      else if (r?.error !== 'cancelled') setError(CONNECT_ERRORS[r?.error] ?? 'anilist.err.network')
    } catch {
      setError('anilist.err.network')
    } finally { setBusy(false) }
  }
  const disconnect = async () => {
    setError(null)
    let r
    try { r = await api.anilistAuth.disconnect() } catch { r = { ok: false } }
    if (r?.ok) { setStatus(NONE); setRevoked(true) }
    else setError('anilist.disconnectFailed')
  }
  const confirm = async (entry) => {
    setRowErrors((e) => ({ ...e, [entry.id]: null }))
    let r
    try { r = await api.anilistSync.confirm(entry.id, entry.aniListId) } catch { r = { ok: false, error: 'invalid' } }
    if (r?.ok) await refreshPending()
    else setRowErrors((e) => ({ ...e, [entry.id]: r?.error === 'taken' ? t('anilist.taken', { title: r.title ?? '' }) : t('anilist.confirmInvalid') }))
  }

  const date = (ms) => (ms == null ? '' : new Date(ms).toLocaleDateString(t.locale))
  const showConnect = !status.connected || status.state === 'expired' || status.state === 'expiring'

  return (
    <div className="anilist-account">
      {!status.connected && <p className="muted">{t('anilist.intro')}</p>}
      {status.connected && status.state !== 'expired' && <p>{t('anilist.connectedAs', { name: status.name ?? '' })}</p>}
      {status.state === 'ok' && status.expiresAt != null && <p className="muted">{t('anilist.validUntil', { date: date(status.expiresAt) })}</p>}
      {status.state === 'expired' && <p role="status">{t('anilist.expiredHere')}</p>}
      {showConnect && (
        <>
          <div className="row">
            <button type="button" disabled={!configured} onClick={authorize}>
              {status.state === 'expiring' ? t('anilist.expiring', { date: date(status.expiresAt) }) : t('anilist.connect')}
            </button>
            {!configured && <span className="muted">{t('anilist.notConfigured')}</span>}
          </div>
          <div className="row">
            <input
              type="password" aria-label={t('anilist.tokenLabel')} placeholder={t('anilist.tokenLabel')}
              autoComplete="off" spellCheck={false} value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            />
            <button type="button" disabled={busy || !token.trim()} onClick={save}>{t('anilist.save')}</button>
          </div>
        </>
      )}
      {status.connected && (
        <div className="row">
          <ConfirmButton label={t('anilist.disconnect')} confirmLabel={t('anilist.disconnect') + '?'} onConfirm={disconnect} />
        </div>
      )}
      {error && <p className="anilist-account__error" role="alert">{t(error)}</p>}
      {revoked && !status.connected && (
        <p className="muted">
          {t('anilist.revokeNote')}{' '}
          <button type="button" onClick={() => api.anilistAuth.openApps()}>{t('anilist.openApps')}</button>
        </p>
      )}
      {status.connected && pending.length > 0 && (
        <div className="row">
          <span>{t.n('anilist.pending', pending.length)}</span>
          <button type="button" ref={openRef} onClick={() => setOpen(true)}>{t('anilist.confirmSeries')}</button>
        </div>
      )}
      {open && status.connected && (
        <Modal label={t('anilist.confirmSeries')} className="anilist-confirm__modal" onClose={() => setOpen(false)}>
          <h2>{t('anilist.confirmSeries')}</h2>
          <div ref={listRef}><AniListConfirmList entries={pending} errors={rowErrors} onConfirm={confirm} onPick={onPick} /></div>
          <div className="row"><button type="button" onClick={() => setOpen(false)}>{t('update.close')}</button></div>
        </Modal>
      )}
    </div>
  )
}
