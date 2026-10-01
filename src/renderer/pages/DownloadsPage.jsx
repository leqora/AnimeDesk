import { useEffect, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { Poster } from '../components/Poster.jsx'
import { ConfirmButton } from '../components/ConfirmButton.jsx'

export function groupByTitle(items) {
  const map = new Map()
  for (const i of items) map.set(i.title, [...(map.get(i.title) ?? []), i])
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, list]) => [title, [...list].sort((x, y) => Number(x.episode) - Number(y.episode))])
}

export function DownloadsPage() {
  const api = useApi()
  const t = useT()
  const [queue, setQueue] = useState([])
  const [items, setItems] = useState(null)

  const loadList = () => api.downloads.list().then(setItems)
  useEffect(() => {
    api.downloads.queue().then(setQueue)
    loadList()
    return api.downloads.onChange((q) => { setQueue(q); loadList() })
  }, [api])

  const remove = async (id, deleteFile) => { await api.downloads.remove(id, deleteFile); loadList() }

  return (
    <section className="page">
      {queue.length > 0 && (
        <div className="page">
          <h2>{t('downloads.queue')}</h2>
          {queue.map((q) => (
            <div key={q.id} className="queue-item">
              <span className="queue-item__title">{q.title} — {t('downloads.episode', { episode: q.episode })}</span>
              <div className="progress"><div style={{ width: `${Math.round(q.percent)}%` }} /></div>
              <span>{t(`dstatus.${q.status}`, { percent: Math.floor(q.percent) })}</span>
              {q.status === 'error' && q.error && <span className="muted">{t(`error.${q.error}`)}</span>}
              {['downloading', 'queued'].includes(q.status) && <button type="button" onClick={() => api.downloads.pause(q.id)}>{t('downloads.pause')}</button>}
              {['paused', 'error'].includes(q.status) && <button type="button" onClick={() => api.downloads.resume(q.id)}>{t('downloads.resume')}</button>}
              {q.status !== 'done' && <button type="button" onClick={() => api.downloads.cancel(q.id)}>{t('downloads.cancel')}</button>}
            </div>
          ))}
        </div>
      )}

      <h2>{t('downloads.done')}</h2>
      {items && items.length === 0 && <p className="muted">{t('downloads.empty')}</p>}
      {items && groupByTitle(items).map(([title, list]) => (
        <div key={title} className="group">
          <Poster title={title} />
          <div className="group__items">
            <h3>{title}</h3>
            {list.map((d) => (
              <div key={d.id} className="dl-item">
                <span className="dl-item__title">{t('downloads.episode', { episode: d.episode })}</span>
                {d.missing ? (
                  <>
                    <span className="muted">{t('downloads.missing')}</span>
                    <button type="button" onClick={() => remove(d.id, false)}>{t('downloads.removeEntry')}</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="primary" onClick={() => api.downloads.play(d.id)}>{t('downloads.play')}</button>
                    <button type="button" onClick={() => api.downloads.openFolder(d.id)}>{t('downloads.openFolder')}</button>
                    <ConfirmButton label={t('downloads.delete')} confirmLabel={t('downloads.confirmDelete')} onConfirm={() => remove(d.id, true)} />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
