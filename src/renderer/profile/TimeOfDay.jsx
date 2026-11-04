import { useT } from '../i18n/I18nContext.jsx'

const PARTS = ['morning', 'afternoon', 'evening', 'night']

export function TimeOfDay({ data }) {
  const t = useT()
  const max = Math.max(1, ...PARTS.map((p) => data[p]))
  return (
    <div className="profile-section">
      <h3>{t('profile.timeOfDay')}</h3>
      {data.total < 5 ? <p className="muted">{t('profile.todEmpty')}</p> : (
        <div className="genre-bars">
          {PARTS.map((p) => (
            <div key={p} className="genre-bar">
              <span>{t(`profile.tod.${p}`)}</span>
              <div className="genre-bar__track"><div className="genre-bar__fill" style={{ transform: `scaleX(${data[p] / max})` }} /></div>
              <span className="hud muted">{data[p]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
