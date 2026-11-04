// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'

function setup({ retro = 0, whatsNew = null, whatsNewDelay = false } = {}) {
  const handlers = {}
  const api = makeFakeApi({
    stats: {
      onAchievements: vi.fn((cb) => { handlers.achievements = cb; return () => {} }),
      takeRetro: vi.fn(async () => ({ count: retro })),
    },
    whatsNew: { get: vi.fn(() => (whatsNewDelay ? new Promise((r) => setTimeout(() => r(whatsNew), 20)) : Promise.resolve(whatsNew))), seen: vi.fn(async () => {}) },
  })
  const sound = { play: vi.fn(() => true) }
  render(<App api={api} sound={sound} />)
  return { api, sound, handlers }
}

describe('App retroactive achievements toast', () => {
  it('waits for the What\'s New dialog to close', async () => {
    setup({ retro: 3, whatsNew: { version: '0.22.0', notes: 'Novo' }, whatsNewDelay: true })
    await screen.findByRole('dialog', { name: 'Ažurirano na 0.22.0' })
    expect(screen.queryByText('Otključano 3 dostignuća za dosadašnje gledanje')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(await screen.findByText('Otključano 3 dostignuća za dosadašnje gledanje')).toBeInTheDocument()
  })
  it('shows at once when there is no dialog, singular for one', async () => {
    const { api } = setup({ retro: 1 })
    expect(await screen.findByText('Otključano 1 dostignuće za dosadašnje gledanje')).toBeInTheDocument()
    expect(api.stats.takeRetro).toHaveBeenCalledTimes(1)
  })
  it('shows nothing for zero', async () => {
    const { api } = setup({ retro: 0 })
    await waitFor(() => expect(api.stats.takeRetro).toHaveBeenCalled())
    await screen.findByRole('button', { name: 'Početna' })
    expect(document.querySelector('.toast')).toBeNull()
  })
})

describe('App achievement events', () => {
  it('plays the sound and refreshes stats', async () => {
    const { api, sound, handlers } = setup()
    await waitFor(() => expect(handlers.achievements).toBeDefined())
    const before = api.stats.get.mock.calls.length
    act(() => handlers.achievements({ ids: ['marathon'] }))
    expect(sound.play).toHaveBeenCalledWith('seriesCompleted')
    expect(api.stats.get.mock.calls.length).toBeGreaterThan(before)
  })
})
