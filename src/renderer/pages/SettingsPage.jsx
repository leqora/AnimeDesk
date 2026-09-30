import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { TOOL_IDS } from '../../shared/domain.js'

const QUALITIES = ['best', '1080', '720', '480', '360', 'worst']

export function SettingsPage({ settings, onSettings }) {
  const api = useApi()
  const t = useT()
  const [tools, setTools] = useState({})
  const [checking, setChecking] = useState(false)
  const [threshold, setThreshold] = useState(settings.watchedThreshold)

  useEffect(() => { api.tools.status().then(setTools) }, [api])
  useEffect(() => { setThreshold(settings.watchedThreshold) }, [settings.watchedThreshold])

  const pickDir = async () => {
    const dir = await api.dialog.pickFolder()
    if (dir) onSettings({ downloadDir: dir })
  }
  const checkUpdates = async () => {
    setChecking(true)
    try { await api.tools.checkUpdates() } finally {
      setTools(await api.tools.status())
      setChecking(false)
    }
  }

  return (
    <section className="page">
      <h2>{t('settings.title')}</h2>
      <label className="field">
        <span>{t('settings.language')}</span>
        <select aria-label={t('settings.language')} value={settings.language} onChange={(e) => onSettings({ language: e.target.value })}>
          <option value="sr">{t('lang.sr')}</option>
          <option value="en">{t('lang.en')}</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.autoTrack} onChange={(e) => onSettings({ autoTrack: e.target.checked })} />
        {t('settings.autoTrack')}
      </label>
      <label className="field">
        <span>{t('settings.threshold')}</span>
        <input
          type="number" min="50" max="100" aria-label={t('settings.threshold')} value={threshold}
          disabled={!settings.autoTrack || settings.askOnClose}
          onChange={(e) => { setThreshold(e.target.value); const n = Number(e.target.value); if (n >= 50 && n <= 100) onSettings({ watchedThreshold: n }) }}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.askOnClose} disabled={!settings.autoTrack} onChange={(e) => onSettings({ askOnClose: e.target.checked })} />
        {t('settings.askOnClose')}
      </label>
      <div className="field">
        <span>{t('settings.downloadDir')}</span>
        <div className="row">
          <span>{settings.downloadDir ?? t('settings.downloadDirNone')}</span>
          <button type="button" onClick={pickDir}>{t('settings.change')}</button>
          {settings.downloadDir && <button type="button" onClick={() => onSettings({ downloadDir: null })}>{t('settings.clear')}</button>}
        </div>
      </div>
      <label className="field">
        <span>{t('settings.quality')}</span>
        <select aria-label={t('settings.quality')} value={settings.quality} onChange={(e) => onSettings({ quality: e.target.value })}>
          {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{t('settings.mode')}</span>
        <select aria-label={t('settings.mode')} value={settings.mode} onChange={(e) => onSettings({ mode: e.target.value })}>
          <option value="sub">{t('settings.mode.sub')}</option>
          <option value="dub">{t('settings.mode.dub')}</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.autoUpdateTools} onChange={(e) => onSettings({ autoUpdateTools: e.target.checked })} />
        {t('settings.autoUpdate')}
      </label>
      <h3>{t('settings.tools')}</h3>
      <ul className="tool-list">
        {TOOL_IDS.map((id) => (
          <li key={id} className="tool-row">
            <span className="tool-row__name">{t(`tool.${id}`)}</span>
            <span className="tool-row__state">{tools[id]?.installed ? tools[id].version : t('tool.missing')}</span>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" disabled={checking} onClick={checkUpdates}>{checking ? t('settings.checking') : t('settings.checkUpdates')}</button>
      </div>
    </section>
  )
}
