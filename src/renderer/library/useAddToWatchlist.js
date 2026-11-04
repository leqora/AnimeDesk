import { useCallback, useRef, useState } from 'react'
import { useApi } from '../api.js'
import { useT } from '../i18n/I18nContext.jsx'
import { useToast } from '../toast/ToastProvider.jsx'

// "Add to Watchlist" for a card of a series that is not in the library (recommendation, sequel). State is per card instance.
export function useAddToWatchlist(item) {
  const api = useApi()
  const t = useT()
  const toast = useToast()
  const [added, setAdded] = useState(false)
  const busy = useRef(false)

  const add = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const list = await api.library.list()
      if (Array.isArray(list) && list.some((e) => e.aniListId === item.id)) {
        setAdded(true)
        toast.show({ message: t('cardMenu.already', { title: item.title }) })
        return
      }
      await api.library.add({ title: item.title, aniListId: item.id, status: 'planned' })
      setAdded(true)
      toast.show({ message: t('cardMenu.added', { title: item.title }) })
    } catch (err) {
      console.warn('add to watchlist failed', err)
    } finally {
      busy.current = false
    }
  }, [api, t, toast, item.id, item.title])

  return { added, add }
}
