import fs from 'node:fs'
import path from 'node:path'

export function readReleaseNotes(dir, version) {
  try {
    const text = fs.readFileSync(path.join(dir, `v${version}.md`), 'utf8').trim()
    return text || null
  } catch {
    return null
  }
}

// "Updated to X" once per new version; a fresh install (no lastSeenVersion) only records the version.
export function createWhatsNew({ settings, currentVersion, readNotes }) {
  let pending = false
  return {
    init() {
      const last = settings.get().lastSeenVersion
      if (last == null) settings.update({ lastSeenVersion: currentVersion })
      else pending = last !== currentVersion
    },
    get() {
      return pending ? { version: currentVersion, notes: readNotes(currentVersion) } : null
    },
    seen() {
      pending = false
      settings.update({ lastSeenVersion: currentVersion })
    },
  }
}
