// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AniListPicker } from '../../../src/renderer/components/AniListPicker.jsx'
import { makeFakeApi, renderUi } from './helpers.jsx'

const cand = (id, extra = {}) => ({ id, title: `Title ${id}`, romaji: `Romaji ${id}`, year: 2000 + id, format: 'TV', episodes: 12, poster: null, ...extra })

function setup({ candidates, sync = {}, props = {} } = {}) {
  const api = makeFakeApi({ anilistSync: { candidates: vi.fn(candidates ?? (async () => [cand(1), cand(2)])), ...sync } })
  const onClose = vi.fn()
  const onPicked = vi.fn()
  const view = renderUi(<AniListPicker open initialQuery="Naruto" entryId="e1" onClose={onClose} onPicked={onPicked} {...props} />, { api })
  return { api, onClose, onPicked, ...view }
}

describe('AniListPicker', () => {
  it('renders nothing when closed', () => {
    setup({ props: { open: false } })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('prefills the query, searches it and shows at most 8 results with title, romaji, year, format, episodes', async () => {
    const { api } = setup({ candidates: async () => Array.from({ length: 10 }, (_, i) => cand(i + 1)) })
    expect(screen.getByRole('searchbox').value).toBe('Naruto')
    await waitFor(() => expect(api.anilistSync.candidates).toHaveBeenCalledWith('Naruto'))
    expect(await screen.findByText('Title 1')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Izaberi' })).toHaveLength(8)
    expect(screen.getByText(/Romaji 1/)).toBeTruthy()
    expect(screen.getByText(/2001/)).toBeTruthy()
    expect(screen.getAllByText(/TV/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/12 EP/).length).toBeGreaterThan(0)
  })

  it('shows loading then the empty text', async () => {
    let resolve
    setup({ candidates: () => new Promise((r) => { resolve = r }) })
    expect(await screen.findByText('Pretraga…')).toBeTruthy()
    resolve([])
    expect(await screen.findByText('Nema rezultata.')).toBeTruthy()
  })

  it('debounces typing into one request', async () => {
    const { api } = setup()
    await waitFor(() => expect(api.anilistSync.candidates).toHaveBeenCalledTimes(1))
    const box = screen.getByRole('searchbox')
    await userEvent.clear(box)
    await userEvent.type(box, 'Bleach')
    await new Promise((r) => setTimeout(r, 600))
    expect(api.anilistSync.candidates).toHaveBeenCalledTimes(2)
    expect(api.anilistSync.candidates).toHaveBeenLastCalledWith('Bleach')
  })

  it('never renders a description', async () => {
    setup({ candidates: async () => [cand(1, { description: 'SECRET PLOT' })] })
    await screen.findByText('Title 1')
    expect(document.body.textContent).not.toContain('SECRET PLOT')
  })

  it('picking confirms and calls onPicked', async () => {
    const { api, onPicked } = setup()
    await userEvent.click((await screen.findAllByRole('button', { name: 'Izaberi' }))[1])
    expect(api.anilistSync.confirm).toHaveBeenCalledWith('e1', 2)
    await waitFor(() => expect(onPicked).toHaveBeenCalled())
  })

  it('taken shows the message and stays open', async () => {
    const { onPicked, onClose } = setup({ sync: { confirm: vi.fn(async () => ({ ok: false, error: 'taken', title: 'Boruto' })) } })
    await userEvent.click((await screen.findAllByRole('button', { name: 'Izaberi' }))[0])
    expect(await screen.findByText('Ova AniList serija je već povezana sa „Boruto”.')).toBeTruthy()
    expect(onPicked).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
