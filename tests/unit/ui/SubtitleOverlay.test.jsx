// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SubtitleOverlay } from '../../../src/renderer/components/SubtitleOverlay.jsx'
import { DEFAULT_SUBTITLES } from '../../../src/shared/subtitles.js'

describe('SubtitleOverlay', () => {
  it('renders bottom and top cues with markup as elements, never as HTML', () => {
    const { container } = render(<SubtitleOverlay subtitles={DEFAULT_SUBTITLES} cues={[
      { id: 'a', text: '<i>Hello</i>\n<script>x</script>there', top: false },
      { id: 'b', text: 'Sign', top: true },
    ]} />)
    const bottom = container.querySelector('.subs__group--bottom')
    expect(bottom.querySelector('i')).toHaveTextContent('Hello')
    expect(bottom.querySelector('br')).not.toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(bottom).toHaveTextContent('Hellox' + 'there')
    expect(container.querySelector('.subs__group--top')).toHaveTextContent('Sign')
  })
  it('applies the style variables, the box switch and the raised state', () => {
    const { container, rerender } = render(<SubtitleOverlay subtitles={{ ...DEFAULT_SUBTITLES, box: false }} cues={[]} raised />)
    const root = container.querySelector('.subs')
    expect(root.style.getPropertyValue('--sub-size')).toBe('3.88cqh')
    expect(root).toHaveClass('subs--no-box')
    expect(root).toHaveClass('subs--raised')
    rerender(<SubtitleOverlay subtitles={DEFAULT_SUBTITLES} cues={[]} />)
    expect(root).not.toHaveClass('subs--no-box')
    expect(root).not.toHaveClass('subs--raised')
  })
})
