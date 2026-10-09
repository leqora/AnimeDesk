import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const css = fs.readFileSync('src/renderer/styles.css', 'utf8')
const rootEnd = css.indexOf('}', css.indexOf(':root {'))

describe('styles.css', () => {
  it('defines every design token in :root', () => {
    const root = css.slice(0, rootEnd)
    for (const t of ['--bg', '--bg-elev', '--glass', '--glass-strong', '--glass-border', '--blur', '--text', '--text-muted',
      '--accent', '--accent-2', '--cta', '--ok', '--warn', '--bad', '--poster-tint', '--radius', '--radius-sm', '--glow', '--ease',
      '--font-display', '--font-body', '--font-hud', '--sub-text', '--sub-text-alt', '--sub-box-rgb', '--sub-outline']) {
      expect(root, t).toContain(`${t}:`)
    }
  })
  it('uses no raw hex colors outside :root', () => {
    expect(css.slice(rootEnd).match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull()
  })
  it('only animates transform and opacity', () => {
    for (const m of css.matchAll(/transition:\s*([^;]+);/g)) {
      for (const part of m[1].split(',')) expect(part.trim().split(/\s+/)[0], m[0]).toMatch(/^(transform|opacity|none)$/)
    }
  })
  it('keeps the player below dialogs, the level-up overlay and toasts', () => {
    const z = (sel) => Number(new RegExp(`(^|\\n)\\${sel} \\{[^}]*z-index: (\\d+)`).exec(css)?.[2])
    const player = z('.player')
    expect(Number.isFinite(player)).toBe(true)
    for (const sel of ['.modal', '.levelup', '.toast']) expect(player, sel).toBeLessThan(z(sel))
  })
  it('lets subtitles scale with the player', () => {
    expect(css).toMatch(/.player {[^}]*container-type: size/)
    expect(css).toMatch(/.subs-preview {[^}]*container-type: size/)
    expect(css).not.toContain('::cue')
  })
  it('honours reduced motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('.reduce-motion')
  })
})
