import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { createPaths, toMsysPath, safeDirName } from '../../src/main/paths.js'

describe('paths', () => {
  it('builds all app paths under the base dir', () => {
    const p = createPaths('C:\\Data\\AnimeDesk')
    expect(p.library).toBe(path.join('C:\\Data\\AnimeDesk', 'library.json'))
    expect(p.manifest).toBe(path.join('C:\\Data\\AnimeDesk', 'tools', 'manifest.json'))
    expect(p.cache).toBe(path.join('C:\\Data\\AnimeDesk', 'cache', 'anilist'))
    expect(p.watchLog).toBe(path.join('C:\\Data\\AnimeDesk', 'watchlog.json'))
    expect(p.profile).toBe(path.join('C:\\Data\\AnimeDesk', 'profile.json'))
  })
  it('converts Windows paths to MSYS paths, keeping spaces and unicode', () => {
    expect(toMsysPath('C:\\Users\\Nikola\\Moji anime\\Šou')).toBe('/c/Users/Nikola/Moji anime/Šou')
    expect(toMsysPath('d:/x/y')).toBe('/d/x/y')
    expect(toMsysPath('/already/posix')).toBe('/already/posix')
  })
  it('makes a valid Windows folder name from any title', () => {
    expect(safeDirName('Re:Zero')).toBe('Re Zero')
    expect(safeDirName('Fate/stay night')).toBe('Fate stay night')
    expect(safeDirName('What?! <Title>.')).toBe('What ! Title')
    expect(safeDirName('???')).toBe('Anime')
  })
  it('avoids reserved Windows device names', () => {
    expect(safeDirName('CON')).toBe('CON_')
    expect(safeDirName('nul')).toBe('nul_')
    expect(safeDirName('Com1')).toBe('Com1_')
    expect(safeDirName('LPT9.txt')).toBe('LPT9_.txt')
    expect(safeDirName('Console')).toBe('Console')
  })
  it('caps very long titles at 100 characters without a trailing dot or space', () => {
    const name = safeDirName(`${'a'.repeat(98)} .bbbbbb`)
    expect(name).toBe('a'.repeat(98))
    expect(safeDirName('x'.repeat(300))).toHaveLength(100)
  })
})
