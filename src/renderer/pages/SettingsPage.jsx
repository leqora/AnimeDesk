import { useEffect, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from '../components/Icon.jsx'
import { TOOL_IDS, OPTIONAL_TOOL_IDS } from '../../shared/domain.js'
import { SubtitleOverlay } from '../components/SubtitleOverlay.jsx'
import { DEFAULT_SUBTITLES, SUBTITLE_FONT_STACKS, SUBTITLE_COLORS } from '../../shared/subtitles.js'

const QUALITIES = ['best', '1080', '720', '480', '360', 'worst']
const FONT_NAMES = { segoe: 'Segoe UI', arial: 'Arial', verdana: 'Verdana', trebuchet: 'Trebuchet MS', georgia: 'Georgia', exo2: 'Exo 2' }
const SLIDE_SAVE_MS = 250

export function SettingsPage({ settings, onSettings, onTestSound = () => {}, updateState = { status: 'disabled', currentVersion: '' } }) {
  const api = useApi()
  const t = useT()
  const [tools, setTools] = useState({})
  const [checking, setChecking] = useState(false)
  const [threshold, setThreshold] = useState(settings.watchedThreshold)
  const [name, setName] = useState(settings.profileName ?? '')

  useEffect(() => { api.tools.status().then(setTools) }, [api])
  useEffect(() => { setThreshold(settings.watchedThreshold) }, [settings.watchedThreshold])

  // Sliders move the preview at once and save after a short pause (dragging must not write settings.json per pixel).
  const [subs, setSubs] = useState(settings.subtitles)
  const slideTimer = useRef(null)
  const pendingSlide = useRef(null)
  useEffect(() => { setSubs(settings.subtitles) }, [settings.subtitles])
  const flushSlide = () => {
    clearTimeout(slideTimer.current)
    const p = pendingSlide.current
    pendingSlide.current = null
    if (p) onSettings({ subtitles: p })
  }
  useEffect(() => () => flushSlide(), [])
  const slide = (field) => (e) => {
    const value = Number(e.target.value)
    setSubs((s) => ({ ...s, [field]: value }))
    pendingSlide.current = { ...(pendingSlide.current ?? {}), [field]: value }
    clearTimeout(slideTimer.current)
    slideTimer.current = setTimeout(flushSlide, SLIDE_SAVE_MS)
  }
  const setSub = (patch) => { setSubs((s) => ({ ...s, ...patch, enabled: { ...s.enabled, ...(patch.enabled ?? {}) } })); onSettings({ subtitles: patch }) }

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
      <h3>{t('settings.playerSection')}</h3>
      <label className="field">
        <span>{t('settings.playerMode')}</span>
        <select aria-label={t('settings.playerMode')} value={settings.playerMode} onChange={(e) => onSettings({ playerMode: e.target.value })}>
          <option value="internal">{t('settings.playerMode.internal')}</option>
          <option value="external">{t('settings.playerMode.external')}</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.autoSkip} onChange={(e) => onSettings({ autoSkip: e.target.checked })} />
        {t('settings.autoSkip')}
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.autoNext} onChange={(e) => onSettings({ autoNext: e.target.checked })} />
        {t('settings.autoNext')}
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.mpvModernUi} onChange={(e) => onSettings({ mpvModernUi: e.target.checked })} />
        {t('settings.mpvModernUi')}
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.autoUpdateTools} onChange={(e) => onSettings({ autoUpdateTools: e.target.checked })} />
        {t('settings.autoUpdate')}
      </label>
      <h3>{t('settings.subsSection')}</h3>
      <div className="subs-preview" aria-hidden="true">
        <SubtitleOverlay subtitles={subs} cues={[{ id: 'preview', text: t('settings.subs.preview'), top: false }]} />
      </div>
      <label className="check">
        <input type="checkbox" checked={subs.enabled.sub} onChange={(e) => setSub({ enabled: { sub: e.target.checked } })} />
        {t('settings.subs.enabledSub')}
      </label>
      <label className="check">
        <input type="checkbox" checked={subs.enabled.dub} onChange={(e) => setSub({ enabled: { dub: e.target.checked } })} />
        {t('settings.subs.enabledDub')}
      </label>
      {[['size', 'settings.subs.size'], ['lineSpacing', 'settings.subs.lineSpacing']].map(([field, key]) => (
        <label key={field} className="field">
          <span>{t(key)}</span>
          <div className="row">
            <input type="range" min="0" max="100" step="1" aria-label={t(key)} value={subs[field]} onChange={slide(field)} />
            <span className="hud">{subs[field]} %</span>
          </div>
        </label>
      ))}
      <label className="field">
        <span>{t('settings.subs.font')}</span>
        <select aria-label={t('settings.subs.font')} value={subs.font} onChange={(e) => setSub({ font: e.target.value })}>
          {Object.keys(SUBTITLE_FONT_STACKS).map((f) => (
            <option key={f} value={f} style={{ fontFamily: SUBTITLE_FONT_STACKS[f] }}>{f === 'default' ? t('settings.subs.font.default') : FONT_NAMES[f]}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t('settings.subs.color')}</span>
        <select aria-label={t('settings.subs.color')} value={subs.color} onChange={(e) => setSub({ color: e.target.value })}>
          {SUBTITLE_COLORS.map((c) => <option key={c} value={c}>{{ white: t('settings.subs.color.white'), yellow: t('settings.subs.color.yellow') }[c]}</option>)}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={subs.box} onChange={(e) => setSub({ box: e.target.checked })} />
        {t('settings.subs.box')}
      </label>
      <label className="field">
        <span>{t('settings.subs.boxOpacity')}</span>
        <div className="row">
          <input type="range" min="0" max="100" step="1" aria-label={t('settings.subs.boxOpacity')} value={subs.boxOpacity} disabled={!subs.box} onChange={slide('boxOpacity')} />
          <span className="hud">{subs.boxOpacity} %</span>
        </div>
      </label>
      <button type="button" onClick={() => { clearTimeout(slideTimer.current); pendingSlide.current = null; setSubs(DEFAULT_SUBTITLES); onSettings({ subtitles: DEFAULT_SUBTITLES }) }}>{t('settings.subs.reset')}</button>
      <h3>{t('settings.profileSection')}</h3>
      <label className="field">
        <span>{t('settings.profileName')}</span>
        <input
          aria-label={t('settings.profileName')}
          placeholder={settings.systemName ?? ''}
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { const v = name.trim(); if (v !== (settings.profileName ?? '')) onSettings({ profileName: v || null }) }}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.soundKey} onChange={(e) => onSettings({ soundKey: e.target.checked })} />
        {t('settings.soundKey')}
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.soundUi} onChange={(e) => onSettings({ soundUi: e.target.checked })} />
        {t('settings.soundUi')}
      </label>
      <div className="row">
        <label className="field">
          <span>{t('settings.soundVolume')}</span>
          <input type="range" min="0" max="100" aria-label={t('settings.soundVolume')} value={settings.soundVolume} onChange={(e) => onSettings({ soundVolume: Number(e.target.value) })} />
        </label>
        <button type="button" onClick={onTestSound}><Icon name="volume" /> {t('settings.soundTest')}</button>
      </div>
      <label className="check">
        <input type="checkbox" checked={settings.animations} onChange={(e) => onSettings({ animations: e.target.checked })} />
        {t('settings.animations')}
      </label>
      <h3>{t('settings.updateSection')}</h3>
      <label className="check">
        <input type="checkbox" checked={settings.autoDownloadUpdates} onChange={(e) => onSettings({ autoDownloadUpdates: e.target.checked })} />
        {t('settings.autoDownloadUpdates')}
      </label>
      {updateState.status === 'disabled' ? (
        <p className="muted">{t('settings.updateDisabled')}</p>
      ) : (
        <div className="row">
          <button type="button" disabled={['checking', 'downloading'].includes(updateState.status)} onClick={() => api.update.check()}>
            {updateState.status === 'checking' ? t('settings.updateChecking') : t('settings.updateCheck')}
          </button>
          {updateState.status === 'none' && <span className="muted">{t('settings.updateNone')}</span>}
          {['available', 'downloading', 'ready'].includes(updateState.status) && <span className="muted">{t('update.available', { version: updateState.version })}</span>}
          {updateState.status === 'error' && <span className="muted">{t('settings.updateFailed')}</span>}
          {updateState.lastCheckedAt && (
            <span className="muted">{t('settings.updateLastChecked', { time: new Date(updateState.lastCheckedAt).toLocaleString(settings.language === 'en' ? 'en-US' : 'sr-RS') })}</span>
          )}
        </div>
      )}
      <h3>{t('settings.tools')}</h3>
      <ul className="tool-list">
        {[...TOOL_IDS, ...OPTIONAL_TOOL_IDS].map((id) => (
          <li key={id} className="tool-row">
            <span className="tool-row__name">{t(`tool.${id}`)}</span>
            <span className="tool-row__state">{tools[id]?.installed ? tools[id].version : t('tool.missing')}</span>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" disabled={checking} onClick={checkUpdates}>{checking ? t('settings.checking') : t('settings.checkUpdates')}</button>
      </div>
      <h3>{t('settings.about')}</h3>
      <p className="hud">AnimeDesk · <span>{t('settings.aboutVersion', { version: updateState.currentVersion })}</span></p>
      <p>{t('settings.aboutAuthor')}</p>
      <div className="row">
        <button type="button" onClick={() => api.app.openRepo()}>{t('settings.aboutRepo')}</button>
        <span className="muted">© 2026 Leqora</span>
      </div>
    </section>
  )
}
