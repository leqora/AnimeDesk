import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createEpisodeLists } from '../../src/main/episodeLists.js'

let file
beforeEach(() => { file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'animedesk-el-')), 'episode-lists.json') })

describe('episodeLists', () => {
  it('stores the list per normalized title and mode, and persists it', () => {
    const l = createEpisodeLists(file, { now: () => 'T1' })
    l.set('Show (12 episodes)', 'sub', [' 0', '1', '1.5 ', '', '2'])
    l.set('show', 'dub', ['1'])
    const again = createEpisodeLists(file)
    expect(again.get('SHOW', 'sub')).toEqual(['0', '1', '1.5', '2'])
    expect(again.get('Show', 'dub')).toEqual(['1'])
    expect(again.get('Other', 'sub')).toBeNull()
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).series.show.sub.at).toBe('T1')
  })
  it('does not rewrite the file for an unchanged list', () => {
    const l = createEpisodeLists(file, { now: () => 'T1' })
    l.set('Show', 'sub', ['1', '2'])
    const before = fs.statSync(file).mtimeMs
    fs.utimesSync(file, new Date(0), new Date(0))
    l.set('Show', 'sub', ['1', '2'])
    expect(fs.statSync(file).mtimeMs).toBe(0)
    l.set('Show', 'sub', ['1', '2', '3'])
    expect(fs.statSync(file).mtimeMs).not.toBe(0)
    expect(before).toBeGreaterThan(0)
  })
  it('ignores bad input and a hand-edited file', () => {
    const l = createEpisodeLists(file)
    l.set('', 'sub', ['1'])
    l.set('Show', 'raw', ['1'])
    l.set('Show', 'sub', 'x')
    l.set('Show', 'sub', ['', ' '])
    expect(fs.existsSync(file)).toBe(false)
    fs.writeFileSync(file, JSON.stringify({ version: 1, series: { show: { sub: { episodes: 'x' } } } }))
    expect(createEpisodeLists(file).get('Show', 'sub')).toBeNull()
    fs.writeFileSync(file, JSON.stringify({ nope: 1 }))
    expect(createEpisodeLists(file).get('Show', 'sub')).toBeNull()
  })
})
