// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { ExternalPlayerBar } from '../../../src/renderer/components/ExternalPlayerBar.jsx'
import { makeFakeApi, renderUi, hasNoContent } from './helpers.jsx'

const setup = async (initial, props = {}) => {
  let push
  const api = makeFakeApi({ externalPlayer: { state: vi.fn(async () => initial), onChange: vi.fn((cb) => { push = cb; return () => {} }) } })
  const utils = renderUi(<ExternalPlayerBar {...props} />, { api })
  await act(async () => {})
  return { api, push: (s) => act(() => push(s)), ...utils }
}

describe('ExternalPlayerBar', () => {
  it('shows series and episode in a named region', async () => {
    await setup({ id: 'a', title: 'Frieren', episode: '1' })
    const region = screen.getByRole('region', { name: 'Spoljni plejer' })
    expect(region).toHaveTextContent('Pušta se u mpv-u: Frieren · EP 1')
    expect(screen.getByText('Pušta se u mpv-u: Frieren · EP 1')).toHaveAttribute('aria-live', 'polite')
  })
  it('omits the episode when unknown', async () => {
    await setup({ id: 'a', title: 'Frieren', episode: null })
    expect(screen.getByText('Pušta se u mpv-u: Frieren')).toBeInTheDocument()
  })
  it('renders nothing when nothing plays', async () => {
    const { container } = await setup(null)
    expect(hasNoContent(container)).toBe(true)
  })
  it('follows pushed changes and disappears on null', async () => {
    const { push, container } = await setup(null)
    push({ id: 'a', title: 'Frieren', episode: '2' })
    expect(screen.getByText('Pušta se u mpv-u: Frieren · EP 2')).toBeInTheDocument()
    push({ id: 'a', title: 'Frieren', episode: '3' })
    expect(screen.getByText('Pušta se u mpv-u: Frieren · EP 3')).toBeInTheDocument()
    push(null)
    expect(hasNoContent(container)).toBe(true)
  })
  it('ignores a late initial state after a push', async () => {
    let push, resolve
    const api = makeFakeApi({ externalPlayer: { state: vi.fn(() => new Promise((r) => { resolve = r })), onChange: vi.fn((cb) => { push = cb; return () => {} }) } })
    const { container } = renderUi(<ExternalPlayerBar />, { api })
    act(() => push(null))
    await act(async () => resolve({ id: 'old', title: 'Old', episode: '1' }))
    expect(hasNoContent(container)).toBe(true)
  })
  it('unsubscribes on unmount', async () => {
    const off = vi.fn()
    const api = makeFakeApi({ externalPlayer: { onChange: vi.fn(() => off) } })
    const { unmount } = renderUi(<ExternalPlayerBar />, { api })
    await act(async () => {})
    unmount()
    expect(off).toHaveBeenCalled()
  })
  it('Stop calls stop once, disables, and a new id resets it', async () => {
    const { api, push } = await setup({ id: 'a', title: 'Frieren', episode: '1' })
    const btn = screen.getByRole('button', { name: 'Zaustavi' })
    expect(btn).not.toHaveClass('primary')
    fireEvent.click(btn)
    expect(api.externalPlayer.stop).toHaveBeenCalledTimes(1)
    expect(api.externalPlayer.stop).toHaveBeenCalledWith('a')
    const busy = screen.getByRole('button', { name: 'Zaustavlja se…' })
    expect(busy).toBeDisabled()
    push({ id: 'b', title: 'Frieren', episode: '2' })
    expect(screen.getByRole('button', { name: 'Zaustavi' })).toBeEnabled()
  })
  it('calls onGone when it vanishes while focus is inside', async () => {
    const onGone = vi.fn()
    const { push } = await setup({ id: 'a', title: 'Frieren', episode: '1' }, { onGone })
    screen.getByRole('button', { name: 'Zaustavi' }).focus()
    push(null)
    expect(onGone).toHaveBeenCalledTimes(1)
  })
  it('does not call onGone when focus was elsewhere', async () => {
    const onGone = vi.fn()
    const { push } = await setup({ id: 'a', title: 'Frieren', episode: '1' }, { onGone })
    push(null)
    expect(onGone).not.toHaveBeenCalled()
  })
})
