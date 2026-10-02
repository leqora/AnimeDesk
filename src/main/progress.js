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
    if (savedLevel() !== null) return
    const stats = safeSnapshot()
    if (stats) remember(stats.level)
  }

  function check({ completedTitle = null } = {}) {
    const stats = safeSnapshot()
    if (!stats) return EMPTY_STATS
    const last = savedLevel()
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
