import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { TOOL_IDS } from '../../shared/domain.js'

export function toolView(status, progress, error, busy) {
  if (status?.installed) return { light: 'green', state: 'installed', percent: null }
  if (error) return { light: 'red', state: 'error', percent: null }
  if (busy && progress && progress.phase !== 'done' && progress.phase !== 'error') {
    const percent = progress.phase === 'download' && progress.total ? Math.floor((progress.received / progress.total) * 100) : null
    return { light: 'yellow', state: 'installing', percent }
  }
  return { light: 'red', state: 'missing', percent: null }
}

export function SetupWizard({ health, onClose }) {
  const api = useApi()
  const t = useT()
  const [status, setStatus] = useState({})
  const [progress, setProgress] = useState({})
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const refresh = () => api.tools.status().then(setStatus)
  useEffect(() => {
    refresh()
    return api.tools.onProgress((p) => setProgress((prev) => ({ ...prev, [p.id]: p })))
  }, [api])

  const installAll = async () => {
    setBusy(true)
    setErrors({})
    try {
      setErrors((await api.tools.installMissing()) ?? {})
    } finally {
      await refresh()
      setBusy(false)
    }
  }

  const loaded = Object.keys(status).length > 0
  const allInstalled = loaded && TOOL_IDS.every((id) => status[id]?.installed)
  const hasErrors = Object.keys(errors).length > 0

  return (
    <div className="modal" role="dialog" aria-labelledby="wizard-title">
      <div className="modal__box">
        <h2 id="wizard-title">{t('wizard.title')}</h2>
        <p>{t('wizard.intro')}</p>
        <ul className="tool-list">
          {TOOL_IDS.map((id) => {
            const view = toolView(status[id], progress[id], errors[id], busy)
            const version = status[id]?.installed && status[id]?.version ? ` (${status[id].version})` : ''
            return (
              <li key={id} className="tool-row">
                <span className={`dot dot--${view.light}`} data-testid={`tool-${id}`} data-light={view.light} />
                <span className="tool-row__name">{t(`tool.${id}`)}</span>
                <span className="tool-row__state">
                  {view.percent != null ? `${t('tool.installing')} ${view.percent}%` : t(`tool.${view.state}`)}
                  {version}
                </span>
              </li>
            )
          })}
        </ul>
        <p className="row">
          <span className={`dot dot--${health.light}`} />
          <span>{t(health.reason === 'ok' ? 'health.green' : `health.${health.reason}`)}</span>
        </p>
        <div className="row">
          {loaded && !allInstalled && (
            <button type="button" className="primary" disabled={busy} onClick={installAll}>
              {hasErrors ? t('wizard.retry') : t('wizard.installAll')}
            </button>
          )}
          {allInstalled && <span>{t('wizard.done')}</span>}
          <button type="button" onClick={() => api.health.recheck()}>{t('health.recheck')}</button>
          <button type="button" onClick={onClose}>{t('wizard.close')}</button>
        </div>
      </div>
    </div>
  )
}
