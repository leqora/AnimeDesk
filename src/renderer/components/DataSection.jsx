import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { useToast } from '../toast/ToastProvider.jsx'
import { resetBanners } from '../anilist/useBanner.js'
import { Modal } from './Modal.jsx'
import { ConfirmButton } from './ConfirmButton.jsx'

const MB = 1024 * 1024
const PICK_ERRORS = { invalid: 'invalid', newer: 'newer', 'too-large': 'tooLarge', 'read-failed': 'readFailed' }
const APPLY_ERRORS = { expired: 'expired', 'backup-failed': 'backupFailed', 'write-failed': 'writeFailed', 'rollback-failed': 'rollbackFailed' }

function formatSize(bytes, locale) {
  const fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return bytes < MB ? `${fmt.format(bytes / 1024)} KB` : `${fmt.format(bytes / MB)} MB`
}

// 'YYYY-MM-DD' is a local date: build it from its parts so no timezone shifts the day.
function formatLocalDate(ymd, locale) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? '')
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale)
}

function formatIsoDate(iso, locale) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(locale)
}

export function DataSection({ onImported, focusImport = false }) {
  const api = useApi()
  const t = useT()
  const { show } = useToast()
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const alive = useRef(true)
  const cancelRef = useRef(null)
  const importRef = useRef(null)
  const hadPreview = useRef(false)

  // mount only: after an import Settings remounts and focus would otherwise fall back to the body
  useEffect(() => { if (focusImport) importRef.current?.focus() }, [])

  useEffect(() => {
    alive.current = true
    api.data.info().then((i) => { if (alive.current) setInfo(i) }, () => {})
    return () => { alive.current = false }
  }, [api])

  // One request at a time: every action runs through here and the buttons are disabled meanwhile.
  const run = useCallback(async (fn) => {
    setBusy(true)
    try { await fn() } finally { if (alive.current) setBusy(false) }
  }, [])

  const doExport = () => run(async () => {
    let res
    try { res = await api.data.export() } catch { res = { ok: false, error: 'export' } }
    if (res?.ok) show({ message: t('data.exported') })
    else if (!res?.canceled) show({ message: t('data.exportFailed'), icon: 'alert' })
  })

  const doPick = () => run(async () => {
    let res
    try { res = await api.data.importPick() } catch { res = { ok: false, error: 'invalid' } }
    if (res?.ok) setPreview(res.preview)
    else if (!res?.canceled) show({ message: t(`data.error.${PICK_ERRORS[res?.error] ?? 'invalid'}`), icon: 'alert' })
  })

  const doApply = () => run(async () => {
    const token = preview.token
    let res
    try { res = await api.data.importApply(token) } catch { res = { ok: false, error: 'write-failed' } }
    setPreview(null)
    if (res?.ok) {
      show({ message: t('data.imported') })
      onImported?.(res.settings)
    } else {
      show({ message: t(`data.error.${APPLY_ERRORS[res?.error] ?? 'writeFailed'}`), icon: 'alert' })
    }
  })

  const doClear = () => run(async () => {
    try {
      const res = await api.data.clearCache()
      resetBanners(api)
      if (alive.current && res) setInfo((i) => ({ ...i, cacheBytes: res.cacheBytes }))
    } catch {
      show({ message: t('data.clearCacheFailed'), icon: 'alert' })
    }
  })

  // the opener button is disabled while the pick runs, so Modal cannot restore focus to it: do it here
  useEffect(() => {
    if (hadPreview.current && !preview) importRef.current?.focus()
    hadPreview.current = preview != null
  }, [preview])

  const lastAuto = formatLocalDate(info?.lastAutoBackup, t.locale)
  const createdAt = formatIsoDate(preview?.createdAt, t.locale)
  const counts = (p) => ({ series: t.n('data.series', p.series), log: t.n('data.logEntries', p.logEntries) })

  return (
    <>
      <h3>{t('data.section')}</h3>
      <div className="row">
        <button type="button" disabled={busy} onClick={doExport}>{t('data.export')}</button>
        <button type="button" ref={importRef} disabled={busy} onClick={doPick}>{t('data.import')}</button>
        <button type="button" disabled={busy} onClick={() => { Promise.resolve(api.data.openFolder()).catch(() => {}) }}>{t('data.openFolder')}</button>
      </div>
      {info && <p className="muted">{lastAuto ? t('data.lastAuto', { date: lastAuto }) : t('data.lastAutoNone')}</p>}
      <div className="row">
        <ConfirmButton label={t('data.clearCache')} confirmLabel={t('data.clearCacheConfirm')} onConfirm={doClear} disabled={busy} />
        {info && <span className="muted">{t('data.cacheSize', { size: formatSize(info.cacheBytes ?? 0, t.locale) })}</span>}
      </div>
      {preview && (
        <Modal label={t('data.importTitle')} initialFocus={cancelRef} onClose={busy ? undefined : () => setPreview(null)}>
          <div className="data-import">
          <h3>{t('data.importTitle')}</h3>
          {createdAt && <p>{t('data.importFrom', { date: createdAt })}</p>}
          <p>{t('data.importCounts', counts(preview))}</p>
          {preview.skipped > 0 && <p className="muted">{t.n('data.skipped', preview.skipped)}</p>}
          <p>{t('data.importWarning', { current: `${counts(preview.current).series}, ${counts(preview.current).log}` })}</p>
          <div className="row">
            <button type="button" className="danger" disabled={busy} onClick={doApply}>{t('data.importConfirm')}</button>
            <button type="button" ref={cancelRef} disabled={busy} onClick={() => setPreview(null)}>{t('data.importCancel')}</button>
          </div>
          </div>
        </Modal>
      )}
    </>
  )
}
