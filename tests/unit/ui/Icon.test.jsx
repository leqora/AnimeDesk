// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Icon } from '../../../src/renderer/components/Icon.jsx'

const RENDERER = join(__dirname, '../../../src/renderer')

describe('Icon', () => {
  it('renders a decorative svg', () => {
    const { container } = render(<Icon name="home" size={20} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('width', '20')
  })
  it('renders nothing for an unknown name', () => {
    const { container } = render(<Icon name="nope" />)
    expect(container).toBeEmptyDOMElement()
  })

  // An unknown name renders nothing silently, so every name used in the renderer must exist.
  it('knows every icon name used in the renderer source', () => {
    const files = readdirSync(RENDERER, { recursive: true }).filter((f) => f.endsWith('.jsx'))
    const names = new Set()
    for (const f of files) {
      const src = readFileSync(join(RENDERER, f), 'utf8')
      for (const [, n] of src.matchAll(/<Icon name="([^"]+)"/g)) names.add(n)
      for (const [, expr] of src.matchAll(/<Icon name=\{([^}]+)\}/g)) {
        for (const [, n] of expr.matchAll(/'([^']+)'/g)) names.add(n)
      }
      for (const [, n] of src.matchAll(/\bicon="([^"]+)"/g)) names.add(n)
    }
    expect(names.size).toBeGreaterThan(10)
    const missing = [...names].filter((n) => !render(<Icon name={n} />).container.querySelector('svg'))
    expect(missing).toEqual([])
  })
})
