// Pure rules for scripts/release.mjs — no I/O, so they are unit-tested.

export function artifactNames(version) {
  const exe = `AnimeDesk-Setup-${version}.exe`
  return { exe, blockmap: `${exe}.blockmap`, latest: 'latest.yml' }
}

export function checkRepoState({ version, porcelain, branch, localHead, remoteHead, localTagExists, remoteTagExists, notesText, ghAuthed }) {
  const errors = []
  const tag = `v${version}`
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) errors.push(`Neispravna verzija u package.json: "${version}"`)
  if (porcelain.trim() !== '') errors.push('Radni folder ima necommit-ovane izmene (git status nije prazan)')
  if (branch !== 'main') errors.push(`Objavljuje se samo sa grane main (trenutna: ${branch})`)
  if (localHead !== remoteHead) errors.push('Lokalni main nije jednak origin/main — uradi git push / git pull')
  if (localTagExists) errors.push(`Tag ${tag} već postoji lokalno`)
  if (remoteTagExists) errors.push(`Tag ${tag} već postoji na GitHub-u`)
  if (!notesText || notesText.trim() === '') errors.push(`Nedostaju beleške: docs/releases/${tag}.md`)
  if (!ghAuthed) errors.push('gh nije prijavljen — pokreni gh auth login')
  return errors
}

export function checkArtifacts({ version, files, latestYml }) {
  const errors = []
  const names = artifactNames(version)
  for (const name of [names.exe, names.blockmap, names.latest]) {
    if (!files.includes(name)) errors.push(`Nedostaje dist/${name}`)
  }
  if (latestYml != null) {
    const lines = latestYml.split(/\r?\n/).map((l) => l.trim())
    if (!lines.includes(`version: ${version}`)) errors.push(`latest.yml nema "version: ${version}"`)
    if (!lines.includes(`path: ${names.exe}`)) errors.push(`latest.yml nema "path: ${names.exe}"`)
  }
  return errors
}
