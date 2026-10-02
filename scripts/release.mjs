// Usage: npm run release — builds and publishes the GitHub release for the version in package.json.
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkRepoState, checkArtifacts, artifactNames } from './releaseChecks.mjs'

const run = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
const ok = (cmd) => { try { run(cmd); return true } catch { return false } }
const step = (msg) => console.log(`\n▶ ${msg}`)
const fail = (errors) => { console.error('\n✖ Objavljivanje prekinuto:'); for (const e of errors) console.error(`  - ${e}`); process.exit(1) }
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const tag = `v${version}`
const notesFile = `docs/releases/${tag}.md`

step(`Provera repozitorijuma za ${tag}`)
run('git fetch origin --tags')
const repoErrors = checkRepoState({
  version,
  porcelain: run('git status --porcelain'),
  branch: run('git rev-parse --abbrev-ref HEAD'),
  localHead: run('git rev-parse main'),
  remoteHead: run('git rev-parse origin/main'),
  localTagExists: ok(`git rev-parse -q --verify refs/tags/${tag}`),
  remoteTagExists: run(`git ls-remote --tags origin refs/tags/${tag}`) !== '',
  notesText: existsSync(notesFile) ? readFileSync(notesFile, 'utf8') : null,
  ghAuthed: ok('gh auth status'),
})
if (repoErrors.length) fail(repoErrors)

step('Testovi (npm test)')
execSync('npm test', { stdio: 'inherit' })

step('Pravljenje instalera (npm run dist)')
execSync('npm run dist', { stdio: 'inherit' })

step('Provera fajlova u dist/')
const names = artifactNames(version)
const latestPath = join('dist', names.latest)
const artifactErrors = checkArtifacts({
  version,
  files: readdirSync('dist'),
  latestYml: existsSync(latestPath) ? readFileSync(latestPath, 'utf8') : null,
})
if (artifactErrors.length) fail(artifactErrors)
const assetNames = [names.exe, names.blockmap, names.latest]

step(`Objavljivanje GitHub release-a ${tag} (kao draft)`)
execSync(`gh release create ${tag} ${assetNames.map((n) => `"${join('dist', n)}"`).join(' ')} --draft --target main --title "AnimeDesk ${version}" --notes-file "${notesFile}"`, { stdio: 'inherit' })

step('Provera objavljenih fajlova (SHA-256)')
const dir = mkdtempSync(join(tmpdir(), 'animedesk-release-'))
let mismatches
try {
  run(`gh release download ${tag} --dir "${dir}"`)
  mismatches = assetNames.filter((name) => {
    const remote = join(dir, name)
    const same = existsSync(remote) && sha256(remote) === sha256(join('dist', name))
    console.log(`  ${same ? '✔' : '✖'} ${name}`)
    return !same
  })
} finally {
  rmSync(dir, { recursive: true, force: true })
}

if (mismatches.length) fail([`Objavljeni fajlovi se ne poklapaju sa lokalnim: ${mismatches.join(', ')} — release je ostao kao DRAFT. Proveri ručno ili obriši sa: gh release delete ${tag}`])

step(`Objavljivanje ${tag}`)
execSync(`gh release edit ${tag} --draft=false --latest`, { stdio: 'inherit' })
console.log(`\n✔ ${tag} objavljen: https://github.com/leqora/AnimeDesk/releases/tag/${tag}`)
