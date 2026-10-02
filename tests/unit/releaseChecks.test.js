import { describe, it, expect } from 'vitest'
import { checkRepoState, checkArtifacts, artifactNames } from '../../scripts/releaseChecks.mjs'

const okRepo = {
  version: '0.3.0', porcelain: '', branch: 'main', localHead: 'abc', remoteHead: 'abc',
  localTagExists: false, remoteTagExists: false, notesText: '## Novo\n- Ažuriranja', ghAuthed: true,
}
const yml = 'version: 0.3.0\nfiles:\n  - url: AnimeDesk-Setup-0.3.0.exe\npath: AnimeDesk-Setup-0.3.0.exe\nsha512: x\n'
const okFiles = ['AnimeDesk-Setup-0.3.0.exe', 'AnimeDesk-Setup-0.3.0.exe.blockmap', 'latest.yml', 'win-unpacked']

describe('artifactNames', () => {
  it('matches the electron-builder artifactName', () => {
    expect(artifactNames('0.3.0')).toEqual({
      exe: 'AnimeDesk-Setup-0.3.0.exe', blockmap: 'AnimeDesk-Setup-0.3.0.exe.blockmap', latest: 'latest.yml',
    })
  })
})

describe('checkRepoState', () => {
  it('passes a clean, pushed main with notes', () => {
    expect(checkRepoState(okRepo)).toEqual([])
  })
  it.each([
    ['dirty working tree', { porcelain: ' M src/a.js' }, /necommit/i],
    ['wrong branch', { branch: 'feat/x' }, /main/],
    ['main not pushed', { remoteHead: 'def' }, /origin\/main/],
    ['local tag exists', { localTagExists: true }, /v0\.3\.0/],
    ['remote tag exists', { remoteTagExists: true }, /v0\.3\.0/],
    ['missing notes', { notesText: null }, /docs\/releases\/v0\.3\.0\.md/],
    ['empty notes', { notesText: '  \n' }, /docs\/releases\/v0\.3\.0\.md/],
    ['gh not logged in', { ghAuthed: false }, /gh auth login/],
    ['bad version', { version: '0.3' }, /verzija/i],
  ])('rejects %s', (_name, over, msg) => {
    const errors = checkRepoState({ ...okRepo, ...over })
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.join('\n')).toMatch(msg)
  })
})

describe('checkArtifacts', () => {
  it('passes when all three files exist and latest.yml matches', () => {
    expect(checkArtifacts({ version: '0.3.0', files: okFiles, latestYml: yml })).toEqual([])
  })
  it('rejects a missing latest.yml', () => {
    const errors = checkArtifacts({ version: '0.3.0', files: okFiles.filter((f) => f !== 'latest.yml'), latestYml: null })
    expect(errors.join('\n')).toMatch(/latest\.yml/)
  })
  it('rejects a missing blockmap', () => {
    const errors = checkArtifacts({ version: '0.3.0', files: okFiles.filter((f) => !f.endsWith('.blockmap')), latestYml: yml })
    expect(errors.join('\n')).toMatch(/blockmap/)
  })
  it('rejects a missing installer', () => {
    const errors = checkArtifacts({ version: '0.3.0', files: okFiles.filter((f) => !f.endsWith('.exe')), latestYml: yml })
    expect(errors.join('\n')).toMatch(/AnimeDesk-Setup-0\.3\.0\.exe/)
  })
  it('rejects latest.yml with another version or path', () => {
    expect(checkArtifacts({ version: '0.3.0', files: okFiles, latestYml: yml.replace('version: 0.3.0', 'version: 0.2.0') }).join('\n')).toMatch(/version: 0\.3\.0/)
    expect(checkArtifacts({ version: '0.3.0', files: okFiles, latestYml: yml.replace(/path: .*/, 'path: Other.exe') }).join('\n')).toMatch(/path: AnimeDesk-Setup-0\.3\.0\.exe/)
  })
  it('does not accept 0.3.0 as a prefix of 0.3.01', () => {
    expect(checkArtifacts({ version: '0.3.0', files: okFiles, latestYml: yml.replace('version: 0.3.0', 'version: 0.3.01') })).not.toEqual([])
  })
})
