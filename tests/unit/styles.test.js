import { describe, it, expect } from 'vitest'
import fs from 'node:fs'

const css = fs.readFileSync('src/renderer/styles.css', 'utf8')
const rootEnd = css.indexOf('}', css.indexOf(':root {'))

describe('styles.css', () => {
  it('defines every design token in :root', () => {
    const root = css.slice(0, rootEnd)
    for (const t of ['--bg', '--bg-elev', '--glass', '--glass-strong', '--glass-border', '--blur', '--text', '--text-muted',
      '--accent', '--accent-2', '--cta', '--ok', '--warn', '--bad', '--poster-tint', '--radius', '--radius-sm', '--glow', '--ease',
      '--font-display', '--font-body', '--font-hud', '--sub-text', '--sub-text-alt', '--sub-box-rgb', '--sub-outline', '--panel-solid',
      '--card-ratio', '--card-min', '--rail-card-w', '--card-radius', '--dur-fast', '--dur', '--dur-slow', '--card-zoom', '--card-lift',
      '--badge-bg', '--poster-fade', '--status-watching', '--status-completed', '--status-planned', '--status-paused', '--status-dropped',
      '--z-card-media', '--z-card-fade', '--z-card-badge', '--z-card-actions',
    ]) {
      expect(root, t).toContain(`${t}:`)
    }
  })
  it('keeps primary buttons red on hover (the generic button:hover is more specific than button.primary)', () => {
    const rule = /(^|\n)button\.primary:hover:not\(:disabled\) \{([^}]*)\}/.exec(css)?.[2] ?? ''
    expect(rule).toContain('background: var(--cta)')
    expect(rule).toContain('border-color: var(--cta)')
  })
  it('reserves a stable scrollbar gutter on .content so the layout does not jump', () => {
    const rule = /(^|\n)\.content \{([^}]*)\}/.exec(css)?.[2] ?? ''
    expect(rule).toContain('scrollbar-gutter: stable')
  })
  it('external bar background is fully opaque', () => {
    const root = css.slice(0, rootEnd)
    const tok = /--panel-opaque:\s*([^;]+);/.exec(root)?.[1] ?? ''
    expect(tok).not.toBe('')
    const alpha = /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/.exec(tok)?.[1]
    if (alpha !== undefined) expect(Number(alpha)).toBe(1)
    const rule = /(^|\n)\.external-bar \{([^}]*)\}/.exec(css)?.[2] ?? ''
    expect(rule).toContain('background: var(--panel-opaque)')
  })
  it('genre select has a fixed width', () => {
    const rule = /(^|\n)\.watchlist-genre \{([^}]*)\}/.exec(css)?.[2] ?? ''
    expect(rule).toMatch(/(^|[\s;])width: \d+px/)
    expect(rule).toMatch(/flex: 0 0 \d+px/)
  })
  it('the non-clickable (not yet released) recommendation card gets no hover lift, glow or poster zoom', () => {
    const rule = (sel) => {
      const at = css.indexOf(`
${sel} {`)
      return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
    }
    expect(rule('.card.rec-card:has(.rec-card__static):hover')).toContain('transform: none')
    expect(rule('.rec-card:has(.rec-card__static):hover::after')).toContain('opacity: 0')
    expect(rule('.rec-card:has(.rec-card__static):hover .poster--in')).toContain('transform: none')
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
    for (const sel of ['.modal', '.levelup', '.toast-stack']) expect(player, sel).toBeLessThan(z(sel))
  })
  it('lets subtitles scale with the player', () => {
    expect(css).toMatch(/.player {[^}]*container-type: size/)
    expect(css).toMatch(/.subs-preview {[^}]*container-type: size/)
    expect(css).not.toContain('::cue')
  })
  it('keeps player panels over video opaque so bright frames do not wash out their text', () => {
    for (const sel of ['.player__menu', '.player__card', '.player__flash']) {
      expect(new RegExp(`(^|\\n)\\${sel} \\{[^}]*background: var\\(--panel-solid\\)`).test(css), sel).toBe(true)
    }
  })
  it('honours reduced motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('.reduce-motion')
  })
  it('dims aired schedule rows without opacity on the text (contrast)', () => {
    const body = (sel) => { const at = css.indexOf(sel + ' {'); return at < 0 ? null : css.slice(at, css.indexOf('}', at)) }
    expect(body('.schedule-row--aired')).toBeNull()
    expect(body('.schedule-row--aired .schedule-row__poster')).toContain('opacity')
    expect(body('.schedule-row--aired .schedule-row__time')).toContain('color: var(--text-muted)')
  })
})
