// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Icon } from '../../../src/renderer/components/Icon.jsx'

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
})
