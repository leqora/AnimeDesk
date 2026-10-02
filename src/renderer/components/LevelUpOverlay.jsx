import { useEffect } from 'react'
import { useT } from '../i18n/I18nContext.jsx'

export function LevelUpOverlay({ level, title, onDone, ms = 2000 }) {
  const t = useT()
  useEffect(() => {
    const timer = setTimeout(onDone, ms)
    const onKey = (e) => { if (e.key === 'Escape') onDone() }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(timer); window.removeEventListener('keydown', onKey) }
  }, [])
  return (
    <div className="levelup" role="dialog" aria-label={t('levelup.title')} onClick={onDone}>
      <div className="levelup__beam" />
      <div className="levelup__text">
        <span className="levelup__title">{t('levelup.title')}</span>
        <span className="hud">{t('profile.level', { level })} · {t(`title.${title}`)}</span>
      </div>
    </div>
  )
}
