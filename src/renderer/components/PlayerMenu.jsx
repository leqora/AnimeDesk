import { useEffect, useRef } from 'react'
import { useT } from '../i18n/I18nContext.jsx'
import { Icon } from './Icon.jsx'
import { RATES, formatRate } from '../../shared/player.js'

// The gear menu: always available; sections that do not apply to this episode are disabled with the reason.
export function PlayerMenu({ rate, language, onRate, open, onOpen, subs, onToggleSubs, onSubOffset, onSubOffsetReset, onSubSize }) {
  const t = useT()
  const menuRef = useRef(null)
  const button = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!menuRef.current?.contains(e.target) && !button.current?.contains(e.target)) onOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') onOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const off = !subs.available
  return (
    <span className="player__menu-anchor">
      <button ref={button} type="button" aria-label={t('player.menu')} aria-haspopup="dialog" aria-expanded={open} onClick={() => onOpen(!open)}><Icon name="settings" /></button>
      {open && (
        <div ref={menuRef} className="player__menu" role="dialog" aria-label={t('player.menu')}>
          <section className="player__menu-section">
            <h3 className="player__menu-title">{t('player.speed')}</h3>
            <div className="player__rates" role="group" aria-label={t('player.speed')}>
              {RATES.map((r) => (
                <button key={r} type="button" aria-pressed={r === rate} onClick={() => onRate(r)}>{formatRate(r, language)}×</button>
              ))}
            </div>
          </section>
          <section className="player__menu-section">
            <h3 className="player__menu-title">{t('player.subs')}</h3>
            <label className="check"><input type="checkbox" aria-label={t('player.subs')} checked={subs.on && subs.available} disabled={off} onChange={onToggleSubs} /> {t('player.subs')}</label>
            <div className="row">
              <span>{t('player.subOffsetLabel')}</span>
              <button type="button" aria-label={t('player.subOffsetMinus')} disabled={off} onClick={() => onSubOffset(-0.1)}>−</button>
              <span className="hud">{subs.offsetLabel} s</span>
              <button type="button" aria-label={t('player.subOffsetPlus')} disabled={off} onClick={() => onSubOffset(0.1)}>+</button>
              <button type="button" disabled={off} onClick={onSubOffsetReset}>{t('player.subOffsetReset')}</button>
            </div>
            <label className="field">
              <span>{t('player.subsSize')}</span>
              <input type="range" min="0" max="100" step="5" aria-label={t('player.subsSize')} disabled={off} value={subs.size} onChange={(e) => onSubSize(Number(e.target.value))} />
            </label>
            {off && subs.hint && <p className="player__menu-hint">{subs.hint}</p>}
          </section>
        </div>
      )}
    </span>
  )
}
