// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { SettingsPage } from '../../../src/renderer/pages/SettingsPage.jsx'
import { DEFAULT_SETTINGS } from '../../../src/main/settings.js'

describe('Settings: "Nije ta" opens the candidate picker', () => {
  it('opens the picker with the entry title, and a pick refreshes the pending list', async () => {
    const pendingConfirm = vi.fn(async () => [{ id: 'e1', title: 'Naruto', aniListId: 20 }])
    const api = makeFakeApi({
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
})
