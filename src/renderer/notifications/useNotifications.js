import { useCallback, useEffect, useState } from 'react'

const EMPTY = { items: [], unread: 0 }

// New-episode notifications from main: initial list, then live pushes.
export function useNotifications(api) {
  const [state, setState] = useState(EMPTY)
  useEffect(() => {
    let alive = true
    api.notifications.list().then((s) => { if (alive && s) setState(s) }, () => {})
    const off = api.onNotificationsChanged((s) => { if (s) setState(s) })
    return () => { alive = false; off?.() }
  }, [api])
  const markRead = useCallback(async () => {
    const s = await api.notifications.markRead()
    if (s) setState(s)
  }, [api])
  return { items: state.items, unread: state.unread, markRead }
}
