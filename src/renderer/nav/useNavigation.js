import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createHistory, push, replace, back, forward, canBack, current, setScroll, setState, sameRoute } from './history.js'

export const RouteStateContext = createContext(null)

// Per-history-entry state (e.g. a list's filter): survives opening a detail and coming back.
// Without a provider (a page rendered on its own) it is plain local state.
export function useRouteState(key, initial) {
  const ctx = useContext(RouteStateContext)
  const [local, setLocal] = useState(initial)
  const set = ctx?.set
  const setValue = useCallback((v) => (set ? set(key, v) : setLocal(v)), [set, key])
  if (!ctx) return [local, setLocal]
  return [key in ctx.state ? ctx.state[key] : initial, setValue]
}

const START = { page: 'home', animeId: null }

export function useNavigation({ getScroll, onArrive }) {
  const ref = useRef(null)
  if (ref.current == null) ref.current = createHistory(START)
  const [version, setVersion] = useState(0)
  const pending = useRef(null)
  const latest = useRef({})
  latest.current = { getScroll, onArrive }

  const change = useCallback((fn, kind) => {
    const saved = setScroll(ref.current, latest.current.getScroll())
    const next = fn(saved)
    ref.current = next
    if (next === saved) return
    pending.current = { entry: current(next), kind }
    setVersion((v) => v + 1)
  }, [])

  // after the new page is rendered
  useLayoutEffect(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    latest.current.onArrive?.(p.entry, p.kind)
  }, [version])

  const navigate = useCallback((route) => change((h) => push(h, route), 'push'), [change])
  const replaceRoute = useCallback((route) => change((h) => (sameRoute(current(h).route, route) ? h : replace(h, route)), 'replace'), [change])
  const goBack = useCallback(() => change(back, 'back'), [change])
  const goForward = useCallback(() => change(forward, 'forward'), [change])
  const setRouteState = useCallback((key, value) => {
    ref.current = setState(ref.current, key, value)
    setVersion((v) => v + 1)
  }, [])

  const h = ref.current
  const entry = current(h)
  return { route: entry.route, entry, navigate, replace: replaceRoute, back: goBack, forward: goForward, canBack: canBack(h), setRouteState }
}
