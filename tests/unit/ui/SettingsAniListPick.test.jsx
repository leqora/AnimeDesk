// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { SettingsPage } from '../../../src/renderer/pages/SettingsPage.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

const OK = { connected: true, name: 'leqora', expiresAt: null, state: 'ok' }

describe('Settings: "Nije ta" opens the candidate picker', () => {
  it('opens the picker with the entry title, and a pick refreshes the pending list', async () => {
    const pendingConfirm = vi.fn(async () => [{ id: 'e1', title: 'Naruto', aniListId: 20 }])
    const api = makeFakeApi({
      anilistAuth: { status: vi.fn(async () => OK) },
      anilistSync: {
        pendingConfirm,
        candidates: vi.fn(async () => [{ id: 7, title: 'Naruto Shippuden', romaji: null, year: 2007, format: 'TV', episodes: 500, poster: null }]),
      },
    })
    renderUi(<SettingsPage settings={{ ...DEFAULT_SETTINGS }} onSettings={vi.fn()} />, { api })
    await userEvent.click(await screen.findByRole('button', { name: 'Potvrdi serije' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Nije ta' }))
    await waitFor(() => expect(api.anilistSync.candidates).toHaveBeenCalledWith('Naruto'))
    const before = pendingConfirm.mock.calls.length
    await userEvent.click(await screen.findByRole('button', { name: 'Izaberi' }))
    expect(api.anilistSync.confirm).toHaveBeenCalledWith('e1', 7)
    await waitFor(() => expect(pendingConfirm.mock.calls.length).toBeGreaterThan(before))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Izaberi' })).toBeNull())
  })

  it('after a pick removes its row the focus stays inside the confirm list, not on the vanished opener', async () => {
    const rows = [{ id: 'e1', title: 'Naruto', aniListId: 20 }, { id: 'e2', title: 'Bleach', aniListId: 269 }]
    const pendingConfirm = vi.fn(async () => rows)
    const api = makeFakeApi({
      anilistAuth: { status: vi.fn(async () => OK) },
      anilistSync: {
        pendingConfirm,
        candidates: vi.fn(async () => [{ id: 7, title: 'Naruto Shippuden', romaji: null, year: 2007, format: 'TV', episodes: 500, poster: null }]),
      },
    })
    renderUi(<SettingsPage settings={{ ...DEFAULT_SETTINGS }} onSettings={vi.fn()} />, { api })
    await userEvent.click(await screen.findByRole('button', { name: 'Potvrdi serije' }))
    await userEvent.click((await screen.findAllByRole('button', { name: 'Nije ta' }))[0])
    pendingConfirm.mockImplementation(async () => rows.slice(1))
    await userEvent.click(await screen.findByRole('button', { name: 'Izaberi' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Nije ta' })).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Izaberi seriju sa AniList-a' })).toBeNull())
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'To je ta serija' }))
  })
})
