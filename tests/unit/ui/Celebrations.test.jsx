// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { LevelUpOverlay } from '../../../src/renderer/components/LevelUpOverlay.jsx'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

function setup(settings = {}) {
  const handlers = {}
  const capture = (name) => vi.fn((cb) => { handlers[name] = cb; return () => {} })
  const api = makeFakeApi({
    stats: { onLevelUp: capture('levelUp'), onSeriesCompleted: capture('completed') },
    downloads: { onChange: capture('downloads') },
  })
  api.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS, ...settings })
  const sound = { play: vi.fn(() => true) }
  render(<App api={api} sound={sound} />)
  return { api, sound, handlers }
}
afterEach(() => { vi.useRealTimers(); document.documentElement.classList.remove('reduce-motion') })

describe('LevelUpOverlay', () => {
  it('closes after the timeout and on Escape', () => {
    vi.useFakeTimers()
    const onDone = vi.fn()
    renderUi(<LevelUpOverlay level={11} title="veteran" onDone={onDone} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('LEVEL UP')
    expect(screen.getByRole('dialog')).toHaveTextContent('LV 11 · Veteran')
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDone).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(2000))
    expect(onDone).toHaveBeenCalledTimes(2)
  })
})

describe('App celebrations', () => {
  it('shows the level-up overlay with sound and closes it on click', async () => {
    const { sound, handlers, api } = setup()
    await waitFor(() => expect(handlers.levelUp).toBeDefined())
    act(() => handlers.levelUp({ level: 11, title: 'veteran' }))
    expect(sound.play).toHaveBeenCalledWith('levelUp')
    const dialog = screen.getByRole('dialog', { name: 'LEVEL UP' })
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog', { name: 'LEVEL UP' })).not.toBeInTheDocument()
    expect(api.stats.get.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
  it('uses a toast instead of the overlay when animations are off', async () => {
    const { handlers } = setup({ animations: false })
    await waitFor(() => expect(handlers.levelUp).toBeDefined())
    act(() => handlers.levelUp({ level: 11, title: 'veteran' }))
    expect(screen.queryByRole('dialog', { name: 'LEVEL UP' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('LEVEL UP · LV 11 · Veteran')
    expect(document.documentElement).toHaveClass('reduce-motion')
  })
  it('removes the reduce-motion class on unmount', async () => {
    const api = makeFakeApi()
    api.settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS, animations: false })
    const { unmount } = render(<App api={api} sound={{ play: vi.fn() }} />)
    await waitFor(() => expect(document.documentElement).toHaveClass('reduce-motion'))
    unmount()
    expect(document.documentElement).not.toHaveClass('reduce-motion')
  })
  it('announces a completed series', async () => {
    const { sound, handlers } = setup()
    await waitFor(() => expect(handlers.completed).toBeDefined())
    act(() => handlers.completed({ title: 'Show', xp: 50 }))
    expect(sound.play).toHaveBeenCalledWith('seriesCompleted')
    expect(screen.getByRole('status')).toHaveTextContent('ZAVRŠENO · Show · +50 XP')
  })
  it('plays the download sound once per finished item', async () => {
    const { sound, handlers } = setup()
    await waitFor(() => expect(handlers.downloads).toBeDefined())
    act(() => handlers.downloads([{ id: 'd1', status: 'downloading' }]))
    act(() => handlers.downloads([{ id: 'd1', status: 'done' }]))
    act(() => handlers.downloads([{ id: 'd1', status: 'done' }, { id: 'd2', status: 'queued' }]))
    expect(sound.play.mock.calls.filter((c) => c[0] === 'downloadDone')).toHaveLength(1)
  })
  it('plays the navigate sound on page change', async () => {
    const { sound } = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Preuzeto' }))
    expect(sound.play).toHaveBeenCalledWith('navigate')
    expect(sound.play).toHaveBeenCalledWith('click')
  })
})
