import { readJson, writeJsonAtomic } from './jsonStore.js'
import { EVENTS } from '../shared/channels.js'
import { EMPTY_STATS } from '../shared/stats.js'

export function createProgress({ file, computeSnapshot, notify }) {
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

  // First v0.2 start: remember the current level so existing history does not trigger level-ups.
  function init() {
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
    return stats
  }

  return { init, check, snapshot: () => safeSnapshot() ?? EMPTY_STATS }
}
