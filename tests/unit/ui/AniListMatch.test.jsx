// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AniListMatch } from '../../../src/renderer/components/AniListMatch.jsx'
import { makeFakeApi, renderUi, hasNoContent } from './helpers.jsx'

const OK = { connected: true, name: 'leqora', expiresAt: null, state: 'ok' }
const info = { id: 20, title: 'Naruto', year: 2002, episodes: 220, poster: null }
const unconfirmed = { id: 'e1', title: 'Naruto', aniListId: 20, aniListConfirmed: false }
const confirmed = { ...unconfirmed, aniListConfirmed: true }

const LOADING = Symbol('loading') // info prop undefined = AniList info still loading

function setup({ entry = unconfirmed, status = OK, state = { state: 'synced', progress: 3 }, sync = {}, onChanged = vi.fn(), lang = 'sr', infoProp = info } = {}) {
  let pushSync = () => {}
  const api = makeFakeApi({
    anilistAuth: { status: vi.fn(async () => status) },
    anilistSync: { stateFor: vi.fn(async () => state), ...sync },
  })
  api.anilistSync.onChange = vi.fn((cb) => { pushSync = cb; return () => {} })
  const view = renderUi(<AniListMatch entry={entry} info={infoProp === LOADING ? undefined : infoProp} onChanged={onChanged} />, { api, lang })
  return { api, onChanged, pushSync: () => act(() => pushSync()), ...view }
}

describe('AniListMatch', () => {
  it('renders nothing when not connected', async () => {
    const { container, api } = setup({ status: { connected: false, name: null, expiresAt: null, state: 'none' } })
    await waitFor(() => expect(api.anilistAuth.status).toHaveBeenCalled())
    await act(async () => {})
    expect(hasNoContent(container)).toBe(true)
  })

  it('unconfirmed with info shows the card with both buttons', async () => {
    setup()
    expect(await screen.findByText(/Na AniList-u:/)).toBeTruthy()
    expect(screen.getByText(/Naruto/)).toBeTruthy()
    expect(screen.getByText(/2002/)).toBeTruthy()
    expect(screen.getByText(/220 EP/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'To je ta serija' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nije ta' })).toBeTruthy()
  })

  it('"To je ta serija" confirms and refreshes', async () => {
    const { api, onChanged } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'To je ta serija' }))
    expect(api.anilistSync.confirm).toHaveBeenCalledWith('e1', 20)
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('taken shows the taken message', async () => {
    setup({ sync: { confirm: vi.fn(async () => ({ ok: false, error: 'taken', title: 'Boruto' })) } })
    await userEvent.click(await screen.findByRole('button', { name: 'To je ta serija' }))
    expect(await screen.findByText('Ova AniList serija je već povezana sa „Boruto”.')).toBeTruthy()
  })

  it('no aniListId shows not-found and Izaberi opens the picker', async () => {
    const { api } = setup({ entry: { id: 'e1', title: 'Naruto', aniListId: null }, infoProp: null })
    expect(await screen.findByText('Serija nije pronađena na AniList-u.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Izaberi' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    await waitFor(() => expect(api.anilistSync.candidates).toHaveBeenCalledWith('Naruto'))
  })

  it('while the info is loading nothing is shown for the match (no not-found flash, no confirm)', async () => {
    const a = setup({ entry: { id: 'e1', title: 'Naruto', aniListId: null }, infoProp: LOADING })
    await waitFor(() => expect(a.api.anilistAuth.status).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByText('Serija nije pronađena na AniList-u.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Izaberi' })).toBeNull()
    a.unmount()
    const b = setup({ infoProp: LOADING })
    await waitFor(() => expect(b.api.anilistAuth.status).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'To je ta serija' })).toBeNull()
    expect(screen.queryByText('Serija nije pronađena na AniList-u.')).toBeNull()
  })

  it('an id without any info (offline) never offers "To je ta serija"', async () => {
    const { api } = setup({ infoProp: null })
    await waitFor(() => expect(api.anilistAuth.status).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'To je ta serija' })).toBeNull()
  })

  it('the card shows the poster and the romaji title when it differs', async () => {
    const poster = 'data:image/png;base64,AAAA'
    const { container } = setup({ infoProp: { ...info, poster, title: 'Naruto', romaji: 'Naruto Romaji' } })
    expect(await screen.findByText('Naruto Romaji')).toBeTruthy()
    expect(container.querySelector('img').getAttribute('src')).toBe(poster)
  })

  it('no romaji line when it equals the title', async () => {
    setup({ infoProp: { ...info, title: 'Naruto', romaji: 'Naruto' } })
    await screen.findByText(/Na AniList-u:/)
    expect(screen.getAllByText(/Naruto/)).toHaveLength(1)
  })

  it('after a successful pick the focus lands on the card, not on the vanished opener', async () => {
    const { api, container } = setup({ sync: { candidates: vi.fn(async () => [{ id: 7, title: 'Naruto', romaji: null, year: 2002, format: 'TV', episodes: 220, poster: null }]) } })
    await userEvent.click(await screen.findByRole('button', { name: 'Nije ta' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Izaberi' }))
    await waitFor(() => expect(api.anilistSync.confirm).toHaveBeenCalledWith('e1', 7))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(container.querySelector('.anilist-match'))
  })

  it('opt-out toggle refreshes the state line afterwards', async () => {
    const { api } = setup({ entry: confirmed })
    const box = await screen.findByRole('checkbox', { name: 'Ne šalji za ovu seriju' })
    const before = api.anilistSync.stateFor.mock.calls.length
    await userEvent.click(box)
    await waitFor(() => expect(api.anilistSync.stateFor.mock.calls.length).toBeGreaterThan(before))
  })

  it('"Nije ta" opens the picker', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Nije ta' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it.each([
    [{ state: 'synced', progress: 3 }, 'AniList: EP 3 ✓'],
    [{ state: 'pending' }, 'AniList: čeka slanje'],
    [{ state: 'error' }, 'AniList je odbio izmenu.'],
    [{ state: 'mismatch' }, 'Brojevi epizoda se ne poklapaju sa AniList-om — ništa nije poslato.'],
    [{ state: 'expired' }, 'Prijava je istekla — ponovo poveži u Podešavanjima'],
  ])('confirmed state %j shows its line', async (state, text) => {
    setup({ entry: confirmed, state })
    expect(await screen.findByText(text)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Promeni' })).toBeTruthy()
  })

  it('retry (error or pending with retryAt) shows the formatted time', async () => {
    const retryAt = new Date(2026, 9, 17, 14, 5).getTime()
    const time = new Date(retryAt).toLocaleTimeString('sr', { hour: '2-digit', minute: '2-digit' })
    setup({ entry: confirmed, state: { state: 'error', retryAt } })
    expect(await screen.findByText(`AniList: greška — pokušava se ponovo u ${time}`)).toBeTruthy()
  })

  it('pending with retryAt shows the retry text too', async () => {
    const retryAt = new Date(2026, 9, 17, 9, 30).getTime()
    setup({ entry: confirmed, state: { state: 'pending', retryAt } })
    expect(await screen.findByText(/AniList: greška — pokušava se ponovo u/)).toBeTruthy()
  })

  it('synced with progress 0 renders no state line', async () => {
    setup({ entry: confirmed, state: { state: 'synced', progress: 0 } })
    await screen.findByRole('button', { name: 'Promeni' })
    expect(screen.queryByText(/EP 0/)).toBeNull()
    expect(screen.queryByText(/^AniList:/)).toBeNull()
  })

  it('opt-out checkbox calls setEnabled(entry.id, false)', async () => {
    const { api } = setup({ entry: confirmed })
    const box = await screen.findByRole('checkbox', { name: 'Ne šalji za ovu seriju' })
    expect(box.checked).toBe(false)
    await userEvent.click(box)
    expect(api.anilistSync.setEnabled).toHaveBeenCalledWith('e1', false)
  })

  it('stateFor off while confirmed means opted out (checked); unchecking sends true', async () => {
    const { api } = setup({ entry: confirmed, state: { state: 'off' } })
    const box = await screen.findByRole('checkbox', { name: 'Ne šalji za ovu seriju' })
    await waitFor(() => expect(box.checked).toBe(true))
    await userEvent.click(box)
    expect(api.anilistSync.setEnabled).toHaveBeenCalledWith('e1', true)
  })

  it('anilistSync.onChange re-queries stateFor', async () => {
    const { api, pushSync } = setup({ entry: confirmed })
    await screen.findByText('AniList: EP 3 ✓')
    api.anilistSync.stateFor.mockResolvedValue({ state: 'synced', progress: 4 })
    pushSync()
    expect(await screen.findByText('AniList: EP 4 ✓')).toBeTruthy()
  })
})
