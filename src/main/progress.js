import { readJson, writeJsonAtomic } from './jsonStore.js'
import { EVENTS } from '../shared/channels.js'

export function createProgress({ file, computeSnapshot, notify }) {
  const saved = () => readJson(file, null).data
  const remember = (level) => writeJsonAtomic(file, { version: 1, lastLevel: level })

  // First v0.2 start: remember the current level so existing history does not trigger level-ups.
  function init() {
    if (!saved()) remember(computeSnapshot().level)
  }

  function check({ completedTitle = null } = {}) {
    const stats = computeSnapshot()
    const last = saved()
    if (completedTitle) notify(EVENTS.seriesCompleted, { title: completedTitle, xp: 50 })
    if (!last) remember(stats.level)
    else if (stats.level > last.lastLevel) {
      remember(stats.level)
      notify(EVENTS.levelUp, { level: stats.level, title: stats.title })
    } else if (stats.level < last.lastLevel) remember(stats.level)
    return stats
  }

  return { init, check, snapshot: computeSnapshot }
}
