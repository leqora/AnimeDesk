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
  it('keeps the logo still on click (as specific as the global button:active nudge)', () => {
    expect(css).toMatch(/\.topbar__logo:active:not\(:disabled\) \{ transform: none; \}/)
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
  it('does not blur behind every button (player, episode grid, cards)', () => {
    expect(/(^|\n)button \{[^}]*backdrop-filter/.test(css)).toBe(false)
    expect(css).toContain('--rail-wide-w:')
  })
  it('uses no raw hex colors outside :root', () => {
    expect(css.slice(rootEnd).match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull()
  })
  it('only animates transform and opacity', () => {
    for (const m of css.matchAll(/transition:\s*([^;]+);/g)) {
      for (const part of m[1].split(',')) expect(part.trim().split(/\s+/)[0], m[0]).toMatch(/^(transform|opacity|none)$/)
    }
  })
  it('keeps the layers in order: page bar, player, bar over the player, dialogs, toasts, level-up', () => {
    const token = (name) => Number(new RegExp(`--z-${name}: (\\d+);`).exec(css)?.[1])
    const z = (sel) => {
      const v = new RegExp(`(^|\\n)\\${sel} \\{[^}]*z-index: ([^;]+);`).exec(css)?.[2]
      return v?.startsWith('var(--z-') ? token(v.slice(8, -1)) : Number(v)
    }
    const order = [z('.topbar'), z('.player'), token('topbar-player'), z('.modal'), z('.toast-stack'), z('.levelup')]
    for (const n of order) expect(Number.isFinite(n)).toBe(true)
    expect(order).toEqual([...order].sort((x, y) => x - y))
    expect(new Set(order).size).toBe(order.length)
    expect(z('.error-fallback--overlay')).toBe(z('.player'))
    expect(css).toMatch(/\.app-shell--playing \.topbar \{[^}]*z-index: var\(--z-topbar-player\)/)
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
  it('the see-through top bar rule follows .page-banner, not just the home hero', () => {
    const rule = css.split('\n').find((l) => l.includes('[data-at-top="true"]') && l.includes('.topbar {')) ?? ''
    expect(rule).toContain('.page-banner')
    expect(rule).not.toContain('.home-hero')
    expect(css).toMatch(/\.app-shell:has\(\.content__notices > \*\) \.page-banner \{ margin-top: 0; \}/)
  })
  it('the series detail hero grows with its content instead of having a fixed height', () => {
    const body = (sel) => { const at = css.indexOf(sel + ' {'); return at < 0 ? null : css.slice(at, css.indexOf('}', at)) }
    const hero = body('.detail-hero')
    expect(hero).toContain('min-height: clamp(')
    expect(hero).not.toMatch(/(^|[\s;])height:/)
    expect(hero).toContain('var(--topbar-h)')
    expect(body('.detail-hero__in')).not.toContain('position: absolute')
  })
  it('the next episode marker differs from the focus ring, and the play button has its own focus ring', () => {
    expect(css).not.toMatch(/\.ep-card--next \.ep-card__frame[^{]*\{[^}]*outline/)
    expect(css).not.toMatch(/\.ep-card:focus-within \.ep-card__frame/)
    expect(css).toMatch(/\.ep-card__open:focus-visible \.ep-card__frame[^{]*\{[^}]*outline: 2px solid var\(--accent-2\)/)
  })
  it('select options have an opaque background', () => {
    const m = css.match(/(?:^|\n)select option[^{]*\{([^}]*)\}/)
    expect(m).not.toBeNull()
    expect(m[1]).toContain('background-color: var(--panel-opaque)')
    expect(m[1]).toContain('color: var(--text)')
  })
  it('has no leftover rules of the old detail banner', () => {
    expect(css).not.toMatch(/^\.banner[ _.{:]/m)
  })
})
