import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { createPaths, toMsysPath, safeDirName } from '../../src/main/paths.js'

describe('paths', () => {
  it('builds all app paths under the base dir', () => {
    const p = createPaths('C:\\Data\\AnimeDesk')
    expect(p.library).toBe(path.join('C:\\Data\\AnimeDesk', 'library.json'))
    expect(p.manifest).toBe(path.join('C:\\Data\\AnimeDesk', 'tools', 'manifest.json'))
    expect(p.cache).toBe(path.join('C:\\Data\\AnimeDesk', 'cache', 'anilist'))
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
})
