import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from './Icon.jsx'
import { XpBar } from './XpBar.jsx'

const VISIBLE = ['available', 'downloading', 'ready']

export function UpdateBanner({ state, onWhatsNew }) {
  const api = useApi()
  const t = useT()
  if (!VISIBLE.includes(state.status)) return null
  const { version } = state
  const text = state.status === 'available'
    ? t('update.available', { version })
    : state.status === 'downloading'
      ? t('update.downloading', { version, percent: state.percent ?? 0 })
      : t('update.ready', { version })
  return (
    <div className="update-banner" role="status">
      <Icon name="downloads" />
      <span className="update-banner__text">{text}</span>
      {state.status === 'downloading' && <XpBar into={state.percent ?? 0} total={100} />}
      {state.status !== 'downloading' && <button type="button" onClick={onWhatsNew}>{t('update.whatsNew')}</button>}
      {state.status === 'available' && <button type="button" className="primary" onClick={() => api.update.download()}>{t('update.download')}</button>}
      {state.status === 'ready' && <button type="button" className="primary" onClick={() => api.update.install()}>{t('update.install')}</button>}
    </div>
  )
}
