import { useEffect, useState } from 'react'
import { useApi } from '../api.js'

// Per api object: key -> { promise, value }. Only a banner url (string) is remembered for the renderer life; an
// in-flight call is shared by everyone asking for the same key. null ("no banner yet": main answers null at once while
// the AniList record is not cached) and errors are NOT remembered, so a later view asks again.
const stores = new WeakMap()
const storeOf = (api) => {
  let s = stores.get(api)
  if (!s) { s = new Map(); stores.set(api, s) }
  return s
}

function load(api, key, req) {
  const store = storeOf(api)
  let slot = store.get(key)
  if (!slot) {
    slot = { value: undefined, promise: null }
    slot.promise = Promise.resolve()
      .then(() => api.anilist.banner(req))
      .then((v) => (typeof v === 'string' ? v : null), () => null)
      .then((v) => {
        if (v) slot.value = v
        else if (store.get(key) === slot) store.delete(key)
        return v
      })
    store.set(key, slot)
  }
  return slot
}

// undefined = still waiting, null = no banner (or no request), string = banner url.
export function useBanner(req) {
  const api = useApi()
  const key = req ? JSON.stringify(req) : null
  const [state, setState] = useState(null) // { key, value }
  useEffect(() => {
    if (!key) return undefined
    const slot = load(api, key, req)
    if (slot.value) return undefined
    let active = true
    slot.promise.then((value) => { if (active) setState({ key, value }) })
    return () => { active = false }
  }, [api, key])
  if (!key) return null
  const cached = storeOf(api).get(key)?.value
  if (cached) return cached
  return state?.key === key ? state.value : undefined
}
