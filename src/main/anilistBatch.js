import { ID_BATCH, BY_ID, SEARCH, searchBatchQuery } from './anilistQueries.js'

// Collects byId / search lookups for a short window and sends them as one id_in request and/or one aliased search
// request. A wave is ONE task on the shared queue (ids first, then searches); the task takes the pending members only
// when it starts running, so whatever piles up while the queue is blocked goes out together.
const MAX_INT = 2147483647 // GraphQL Int; a larger id would 400 the whole id_in request

export function createAniListBatcher({
  enqueue,
  request,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  windowMs = 40,
  maxSearches = 10,
  maxIds = 50,
  waitGate = () => Promise.resolve(), // resolves when the queue's rate-limit pause (if any) is over
} = {}) {
  const pendingIds = new Map() // id -> { promise, resolve, reject }
  const pendingSearches = new Map() // exact text -> { promise, resolve, reject }
  let timer = null
  let taskQueued = false // a wave task sits in the queue and has not started yet

  const member = () => {
    const m = {}
    m.promise = new Promise((resolve, reject) => { m.resolve = resolve; m.reject = reject })
    return m
  }
  const take = (map, max) => {
    const taken = []
    for (const [key, m] of map) {
      if (taken.length >= max) break
      taken.push([key, m])
      map.delete(key)
    }
    return taken
  }
  const badAnswer = () => Object.assign(new Error('AniList returned an unexpected answer'), { graphql: true })

  async function runIds(members) {
    if (members.length === 0) return
    try {
      if (members.length === 1) {
        const [id, m] = members[0]
        try {
          const data = await request(BY_ID, { id })
          m.resolve(data?.Media ?? null)
        } catch (err) {
          if (err?.status === 404) m.resolve(null)
          else m.reject(err)
        }
        return
      }
      const data = await request(ID_BATCH, { ids: members.map(([id]) => id) })
      const list = data?.Page?.media
      if (!Array.isArray(list)) throw badAnswer()
      const byId = new Map(list.filter(Boolean).map((x) => [Number(x.id), x]))
      for (const [id, m] of members) m.resolve(byId.get(id) ?? null)
    } catch (err) {
      for (const [, m] of members) m.reject(err)
    }
  }

  async function runSearches(members) {
    if (members.length === 0) return
    if (members.length === 1) {
      const [text, m] = members[0]
      try {
        const data = await request(SEARCH, { search: text })
        const list = data?.Page?.media
        if (!Array.isArray(list)) throw badAnswer()
        m.resolve(list)
      } catch (err) {
        m.reject(err)
      }
      return
    }
    let data
    try {
      const variables = {}
      members.forEach(([text], i) => { variables[`s${i}`] = text })
      data = await request(searchBatchQuery(members.length), variables)
    } catch (err) {
      if (err?.status === 400 || err?.graphql === true) {
        const half = Math.ceil(members.length / 2)
        await runSearches(members.slice(0, half))
        await runSearches(members.slice(half))
      } else {
        for (const [, m] of members) m.reject(err)
      }
      return
    }
    members.forEach(([, m], i) => {
      const list = data?.[`s${i}`]?.media
      if (Array.isArray(list)) m.resolve(list)
      else m.reject(badAnswer())
    })
  }

  async function runWave() {
    taskQueued = false
    const ids = take(pendingIds, maxIds)
    const searches = take(pendingSearches, maxSearches)
    if (pendingIds.size > 0 || pendingSearches.size > 0) {
      if (timer !== null) { clearTimeoutFn(timer); timer = null }
      queueTask()
    }
    await runIds(ids)
    // The ids request may have exhausted the budget; the queue only checks its gate between tasks, so wait here.
    if (ids.length > 0 && searches.length > 0) await waitGate()
    await runSearches(searches)
  }

  function queueTask() {
    if (taskQueued) return
    taskQueued = true
    enqueue(runWave).catch(() => {}) // members are settled inside the task
  }

  function schedule() {
    if (taskQueued) return // the waiting task picks the new member up when it starts
    if (pendingIds.size >= maxIds || pendingSearches.size >= maxSearches) {
      if (timer !== null) { clearTimeoutFn(timer); timer = null }
      queueTask()
    } else if (timer === null) {
      timer = setTimeoutFn(() => { timer = null; queueTask() }, windowMs)
    }
  }

  function byId(id) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0 || id > MAX_INT) return Promise.resolve(null)
    let m = pendingIds.get(id)
    if (!m) { m = member(); pendingIds.set(id, m); schedule() }
    return m.promise
  }

  function search(text) {
    if (typeof text !== 'string' || text.trim() === '') return Promise.resolve([])
    let m = pendingSearches.get(text)
    if (!m) { m = member(); pendingSearches.set(text, m); schedule() }
    return m.promise
  }

  return { byId, search }
}
