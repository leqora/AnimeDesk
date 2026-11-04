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
  it('draws the watched part at time / duration, under the buffered and segment layers', () => {
    draw({ time: 350, buffered: [{ start: 0, end: 700 }], segments: [{ kind: 'op', start: 60, end: 150 }] })
    const played = document.querySelector('.player__played')
    expect(played.style.width).toBe('25%')
    const layers = [...document.querySelector('.player__timeline').children].map((el) => el.className.split(' ')[0])
    expect(layers.slice(0, 5)).toEqual(['player__track', 'player__buffered', 'player__played', 'player__segment', 'player__seek'])
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
    expect(document.querySelector('.player__played')).toBeNull()
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(document.body.innerHTML).not.toContain('NaN')
  })
  describe('frame preview', () => {
    const preview = (frame, extra = {}) => ({ onHover: vi.fn(), onLeave: vi.fn(), frame, ...extra })
    it('renders the same tooltip markup with and without a preview prop', () => {
      const plain = draw()
      fireEvent.mouseMove(plain.timeline, { clientX: 600 })
      const html = screen.getByRole('tooltip').outerHTML
      document.body.innerHTML = ''
      const withPreview = draw({ preview: preview({ allowed: false, src: null, exact: false }) })
      fireEvent.mouseMove(withPreview.timeline, { clientX: 600 })
      expect(screen.getAllByRole('tooltip')).toHaveLength(1)
      expect(screen.getByRole('tooltip').outerHTML).toBe(html)
      expect(document.querySelector('.player__preview')).toBeNull()
    })
    it('shows the frame above the tooltip, tooltip text unchanged', () => {
      const { timeline } = draw({ preview: preview({ allowed: true, src: 'data:x', exact: true }) })
      fireEvent.mouseMove(timeline, { clientX: 600 })
      const box = document.querySelector('.player__preview[aria-hidden="true"]')
      expect(box.querySelector('img').getAttribute('src')).toBe('data:x')
      expect(box.className).not.toContain('--empty')
      expect(box.className).not.toContain('--stale')
      expect(screen.getByRole('tooltip')).toHaveTextContent('11:40')
    })
    it('draws no box when not allowed', () => {
      const { timeline } = draw({ preview: preview({ allowed: false, src: null, exact: false }) })
      fireEvent.mouseMove(timeline, { clientX: 600 })
      expect(document.querySelector('.player__preview')).toBeNull()
    })
    it('marks an empty and a stale frame', () => {
      const { timeline } = draw({ preview: preview({ allowed: true, src: null, exact: false }) })
      fireEvent.mouseMove(timeline, { clientX: 600 })
      expect(document.querySelector('.player__preview--empty')).not.toBeNull()
    })
    it('marks a nearest-frame as stale', () => {
      const { timeline } = draw({ preview: preview({ allowed: true, src: 'data:y', exact: false }) })
      fireEvent.mouseMove(timeline, { clientX: 600 })
      expect(document.querySelector('.player__preview--stale img')).not.toBeNull()
    })
    it('reports hover time and leave', () => {
      const p = preview(null)
      const { timeline } = draw({ preview: p })
      fireEvent.mouseMove(timeline, { clientX: 100 + 500 })
      expect(p.onHover).toHaveBeenCalledWith(700)
      fireEvent.mouseLeave(timeline)
      expect(p.onLeave).toHaveBeenCalledTimes(1)
    })
  })
})
