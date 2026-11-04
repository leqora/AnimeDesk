import { readJson, writeJsonAtomic } from './jsonStore.js'
import { EVENTS } from '../shared/channels.js'
import { EMPTY_STATS } from '../shared/stats.js'
import { newlyUnlocked } from '../shared/achievements.js'

export function createProgress({ file, achievementsFile, computeSnapshot, computeAchievements, notify, now = () => new Date().toISOString() }) {
  // lastLevel = highest level ever reached; a missing or non-numeric value counts as a missing file.
  const savedLevel = () => {
    const level = readJson(file, null).data?.lastLevel
    return Number.isFinite(level) ? level : null
  }
  const remember = (level) => writeJsonAtomic(file, { version: 1, lastLevel: level })
  const safeSnapshot = () => {
    try {
      return computeSnapshot()
    } catch (err) {
      console.error('progress: stats computation failed', err)
      return null
    }
  }

  // Achievements: id -> ISO unlock date. Disabled when no achievementsFile/computeAchievements is given.
  const enabled = Boolean(achievementsFile && computeAchievements)
  let unlocked = {}
  let pendingRetro = 0
  let ready = false
  const persist = () => writeJsonAtomic(achievementsFile, { version: 1, unlocked })
  const metIds = () => computeAchievements().filter((a) => a.met).map((a) => a.id)

  // ready only after a successful read/re-derive, so a failed init is retried and never treats history as new.
  let silentRederive = false
  function initAchievements() {
    if (!enabled || ready) return
    try {
      const { data, corrupt } = readJson(achievementsFile, null)
      if (corrupt) silentRederive = true // the bad file was already moved aside; a retry must not count a retro
      const valid = data && typeof data === 'object' && data.unlocked && typeof data.unlocked === 'object' && !Array.isArray(data.unlocked)
      if (valid && !corrupt) {
        unlocked = { ...data.unlocked }
        ready = true
        return
      }
      if (silentRederive || data !== null) {
        silentRederive = true
        console.error('progress: achievements file unreadable, re-deriving')
      }
      const ids = metIds()
      const map = Object.fromEntries(ids.map((id) => [id, now()]))
      unlocked = map
      persist()
      if (!silentRederive) pendingRetro = ids.length
      ready = true
    } catch (err) {
      console.error('progress: achievements init failed', err)
    }
  }

  // `evaluated` lets snapshot() reuse one computeAchievements() result for unlocking and the list.
  function unlock(evaluated = null) {
    if (!enabled) return
    try {
      initAchievements()
      if (!ready) return
      const ids = newlyUnlocked(evaluated ?? computeAchievements(), unlocked)
      if (!ids.length) return
      const at = now()
      for (const id of ids) unlocked[id] = at
      persist()
      notify(EVENTS.achievementsUnlocked, { ids })
    } catch (err) {
      console.error('progress: achievements check failed', err)
    }
  }

  function achievementList(evaluated) {
    try {
      return evaluated.map(({ id, icon, goal, value }) => ({ id, icon, goal, value, unlockedAt: unlocked[id] ?? null }))
    } catch (err) {
      console.error('progress: achievements evaluation failed', err)
      return []
    }
  }

  // First v0.2 start: remember the current level so existing history does not trigger level-ups.
  function init() {
    initAchievements()
    try {
      if (savedLevel() !== null) return
      remember(computeSnapshot().level)
    } catch (err) {
      console.error('progress: init failed', err)
    }
  }

  function check({ completedTitle = null } = {}) {
    let stats, last
    try {
      stats = computeSnapshot()
      last = savedLevel()
    } catch (err) {
      console.error('progress: check failed', err)
      return EMPTY_STATS
    }
    if (completedTitle) notify(EVENTS.seriesCompleted, { title: completedTitle, xp: 50 })
    if (last === null) remember(stats.level)
    else if (stats.level > last) {
      remember(stats.level)
      notify(EVENTS.levelUp, { level: stats.level, title: stats.title })
    }
    unlock()
    return stats
  }

  // After a data import: the level of the imported data becomes the baseline (even when lower), silently.
  function rebase() {
    try {
      remember(computeSnapshot().level)
    } catch (err) {
      console.error('progress: rebase failed', err)
    }
    if (!enabled) return
    try {
      const next = Object.fromEntries(metIds().map((id) => [id, unlocked[id] ?? now()]))
      const prev = unlocked
      unlocked = next
      try { persist() } catch (err) { unlocked = prev; throw err }
      pendingRetro = 0
      ready = true
    } catch (err) {
      console.error('progress: achievements rebase failed', err)
    }
  }

  function snapshot() {
    const stats = safeSnapshot()
    if (!stats) return EMPTY_STATS
    if (!enabled) return stats
    let evaluated
    try {
      initAchievements()
      evaluated = computeAchievements()
    } catch (err) {
      console.error('progress: achievements evaluation failed', err)
      return { ...stats, achievements: [] }
    }
    unlock(evaluated)
    return { ...stats, achievements: achievementList(evaluated) }
  }

  function takeRetro() {
    initAchievements()
    const count = pendingRetro
    pendingRetro = 0
    return { count }
  }

  return { init, check, rebase, snapshot, takeRetro }
}
