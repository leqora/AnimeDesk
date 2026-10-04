import { useT } from '../i18n/I18nContext.jsx'

export function SkipButton({ segment, onSkip }) {
  const t = useT()
  if (segment !== 'op' && segment !== 'recap') return null
  return <button type="button" className="player__skip primary" onClick={onSkip}>{t(segment === 'op' ? 'player.skipIntro' : 'player.skipRecap')}</button>
}
