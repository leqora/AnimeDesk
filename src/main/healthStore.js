import fs from 'node:fs'
import { readJson, writeJsonAtomic } from './jsonStore.js'

export function createHealthStore({ file }) {
  return {
    // Never throws: any problem means "no usable record".
    read() {
      try {
        const { data } = readJson(file, null)
        return data ?? null
      } catch {
        return null
      }
    },
    write(record) {
      writeJsonAtomic(file, record)
    },
    clear() {
      fs.rmSync(file, { force: true })
    },
  }
}
