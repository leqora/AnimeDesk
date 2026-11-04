// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { PlayerMenu } from '../../../src/renderer/components/PlayerMenu.jsx'

const draw = (rate = 1, onRate = vi.fn()) => {
  renderUi(<PlayerMenu open onOpen={() => {}} rate={rate} language="sr" onRate={onRate} subs={{ available: false }} />)
  return onRate
}
const pressed = () => screen.getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true' && /×$/.test(b.textContent)).map((b) => b.textContent)

describe('PlayerMenu speed slider', () => {
  it('exposes an exact-speed slider bound to the rate', () => {
    draw(1.15)
    const s = screen.getByRole('slider', { name: 'Precizna brzina' })
    expect(s).toHaveAttribute('min', '0.25')
    expect(s).toHaveAttribute('max', '2')
    expect(s).toHaveAttribute('step', '0.05')
    expect(s).toHaveValue('1.15')
    expect(s).toHaveAttribute('aria-valuetext', '1,15×')
  })
  it('calls onRate with the rounded value', () => {
    const onRate = draw(1)
    fireEvent.change(screen.getByRole('slider', { name: 'Precizna brzina' }), { target: { value: '1.15' } })
    expect(onRate).toHaveBeenCalledWith(1.15)
  })
  it('presses a speed button only on an exact match', () => {
    draw(1.15)
    expect(pressed()).toEqual([])
  })
  it('presses just the matching button', () => {
    draw(1.25)
    expect(pressed()).toEqual(['1,25×'])
  })
})
