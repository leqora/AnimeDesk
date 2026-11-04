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

  function initAchievements() {
    if (!enabled || ready) return
    ready = true
    try {
      const { data, corrupt } = readJson(achievementsFile, null)
      const valid = data && typeof data === 'object' && data.unlocked && typeof data.unlocked === 'object' && !Array.isArray(data.unlocked)
      if (valid && !corrupt) {
        unlocked = { ...data.unlocked }
        return
      }
      if (corrupt || data !== null) console.error('progress: achievements file unreadable, re-deriving')
      const ids = metIds()
      unlocked = Object.fromEntries(ids.map((id) => [id, now()]))
      if (!corrupt && data === null) pendingRetro = ids.length
      persist()
    } catch (err) {
      console.error('progress: achievements init failed', err)
    }
  }

  function unlock() {
    if (!enabled) return
    try {
      initAchievements()
      const ids = newlyUnlocked(computeAchievements(), unlocked)
      if (!ids.length) return
      const at = now()
      for (const id of ids) unlocked[id] = at
      persist()
      notify(EVENTS.achievementsUnlocked, { ids })
    } catch (err) {
      console.error('progress: achievements check failed', err)
    }
  }

  function achievementList() {
    if (!enabled) return []
    try {
      return computeAchievements().map(({ id, icon, goal, value }) => ({ id, icon, goal, value, unlockedAt: unlocked[id] ?? null }))
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
      ready = true
      unlocked = Object.fromEntries(metIds().map((id) => [id, unlocked[id] ?? now()]))
      pendingRetro = 0
      persist()
    } catch (err) {
      console.error('progress: achievements rebase failed', err)
    }
  }

  function snapshot() {
    const stats = safeSnapshot()
    if (!stats) return EMPTY_STATS
    if (!enabled) return stats
    unlock()
    return { ...stats, achievements: achievementList() }
  }

  function takeRetro() {
    initAchievements()
    const count = pendingRetro
    pendingRetro = 0
    return { count }
  }

  return { init, check, rebase, snapshot, takeRetro }
}
