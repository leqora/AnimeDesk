// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, act } from '@testing-library/react'
import { renderUi, renderHookUi } from './helpers.jsx'
import { AiringLine, NewBadge } from '../../../src/renderer/components/AiringLine.jsx'
import { useNow } from '../../../src/renderer/useNow.js'

const H = 3600 * 1000
// Friday 2026-10-16 17:30 local time, so the weekday/time text does not depend on the machine's zone.
const AT = new Date(2026, 9, 16, 17, 30).getTime()
const info = { status: 'RELEASING', nextAiring: { episode: 13, airingAt: AT } }

afterEach(() => vi.useRealTimers())

describe('AiringLine', () => {
  it('shows the next episode number, the countdown and the local day/time', () => {
    renderUi(<AiringLine info={info} now={AT - (2 * 24 + 4) * H} />)
    expect(screen.getByText('EP 13 izlazi za 2 d 4 h · pet 17:30')).toHaveClass('airing-line')
  })
  it('uses the English locale', () => {
    renderUi(<AiringLine info={info} now={AT - 3 * H} />, { lang: 'en' })
    expect(screen.getByText('EP 13 airs in 3 h · Fri 17:30')).toBeInTheDocument()
  })
  it('renders nothing once the episode has aired or without a schedule', () => {
    const { container, rerender } = renderUi(<AiringLine info={info} now={AT} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<AiringLine info={{ ...info, nextAiring: null }} now={AT - H} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<AiringLine info={undefined} now={AT - H} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('NewBadge', () => {
  it('shows only a number with the right plural', () => {
    renderUi(<NewBadge count={3} inline />)
    const badge = screen.getByText('3 nove')
    expect(badge).toHaveClass('badge', 'badge--new', 'badge--inline')
    expect(badge).not.toHaveAttribute('aria-hidden')
  })
  it('hides the poster variant from screen readers and renders nothing for zero', () => {
    const { container, rerender } = renderUi(<NewBadge count={5} />)
    expect(screen.getByText('5 novih')).toHaveAttribute('aria-hidden', 'true')
    rerender(<NewBadge count={0} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('useNow', () => {
  it('ticks every interval and stops on unmount', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(AT)
    const { result, unmount } = renderHookUi(() => useNow(60_000))
    expect(result.current).toBe(AT)
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(result.current).toBe(AT + 60_000)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
