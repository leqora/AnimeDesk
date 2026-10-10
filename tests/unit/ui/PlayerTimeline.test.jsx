// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { PlayerTimeline } from '../../../src/renderer/components/PlayerTimeline.jsx'

const draw = (props = {}) => {
  renderUi(<PlayerTimeline time={0} duration={1400} onSeek={vi.fn()} {...props} />)
  const input = screen.getByLabelText('Pozicija u epizodi')
  input.getBoundingClientRect = () => ({ left: 100, width: 1000, top: 0, height: 10, right: 1100, bottom: 10 })
  return { timeline: input.closest('.player__timeline'), input }
}

describe('PlayerTimeline', () => {
  it('draws each buffered range at its share of the duration', () => {
    draw({ buffered: [{ start: 0, end: 140 }, { start: 700, end: 1050 }] })
    const spans = document.querySelectorAll('.player__buffered')
    expect(spans).toHaveLength(2)
    expect(spans[0].style.left).toBe('0%')
    expect(spans[0].style.width).toBe('10%')
    expect(spans[1].style.left).toBe('50%')
    expect(spans[1].style.width).toBe('25%')
  })
  it('shows the time under the mouse, with the segment name over a segment', () => {
    const { timeline } = draw({ segments: [{ kind: 'op', start: 60, end: 150 }] })
    fireEvent.mouseMove(timeline, { clientX: 100 + 500 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('11:40')
    fireEvent.mouseMove(timeline, { clientX: 100 + 50 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('1:10 · Uvod')
    fireEvent.mouseLeave(timeline)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  it('clamps the tooltip time to the track', () => {
    const { timeline } = draw()
    fireEvent.mouseMove(timeline, { clientX: 5000 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('23:20')
    fireEvent.mouseMove(timeline, { clientX: 0 })
    expect(screen.getByRole('tooltip')).toHaveTextContent('0:00')
  })
  it.each([0, NaN, Infinity])('draws nothing extra while the duration is %s', (duration) => {
    const { timeline } = draw({ duration, buffered: [{ start: 0, end: 10 }] })
    fireEvent.mouseMove(timeline, { clientX: 600 })
    expect(document.querySelectorAll('.player__buffered')).toHaveLength(0)
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(document.body.innerHTML).not.toContain('NaN')
  })
})
