import { useEffect, useState } from 'react'
import { useApi } from '../api.js'

// One memory cache per api object for the whole renderer life: key -> { promise, done, value }.
// The same key asked at the same time shares one IPC call; the banner url is a local file url (animedesk-img://) or null.
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
    slot = { done: false, value: null, promise: null }
    slot.promise = Promise.resolve()
      .then(() => api.anilist.banner(req))
      .then((v) => (typeof v === 'string' ? v : null), () => null)
      .then((v) => { slot.done = true; slot.value = v; return v })
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
    if (slot.done) return undefined
    let active = true
    slot.promise.then((value) => { if (active) setState({ key, value }) })
    return () => { active = false }
  }, [api, key])
  if (!key) return null
  const slot = storeOf(api).get(key)
  if (slot?.done) return slot.value
  return state?.key === key ? state.value : undefined
}
