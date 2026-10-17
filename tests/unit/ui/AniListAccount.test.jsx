// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, act, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AniListAccount } from '../../../src/renderer/components/AniListAccount.jsx'
import { makeFakeApi, renderUi } from './helpers.jsx'

const NONE = { connected: false, name: null, expiresAt: null, state: 'none' }
const OK = { connected: true, name: 'leqora', expiresAt: null, state: 'ok' }

function setup({ status = NONE, pending = [], auth = {}, sync = {}, lang = 'sr', onPick = vi.fn() } = {}) {
  let pushAuth = () => {}
  let pushSync = () => {}
  const api = makeFakeApi({
    anilistAuth: { status: vi.fn(async () => status), ...auth },
    anilistSync: { pendingConfirm: vi.fn(async () => pending), ...sync },
  })
  api.anilistAuth.onChange = vi.fn((cb) => { pushAuth = cb; return () => {} })
  api.anilistSync.onChange = vi.fn((cb) => { pushSync = cb; return () => {} })
  const view = renderUi(<AniListAccount onPick={onPick} />, { api, lang })
  return { api, onPick, pushAuth: (s) => act(() => pushAuth(s)), pushSync: () => act(() => pushSync()), ...view }
}

const pend = [{ id: 'e1', title: 'Naruto', aniListId: 20 }, { id: 'e2', title: 'Bleach', aniListId: 269 }]

describe('AniListAccount', () => {
  it('not connected: intro, connect button, password input, save', async () => {
    setup()
    expect(await screen.findByText(/Napredak se šalje na tvoj AniList nalog/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Poveži' })).toBeTruthy()
    const input = screen.getByLabelText('Nalepi token sa AniList-a')
    expect(input.getAttribute('type')).toBe('password')
    expect(screen.getByRole('button', { name: 'Sačuvaj' })).toBeTruthy()
  })

  it('openAuthorize false shows the not-configured text and disables Poveži', async () => {
    const { api } = setup()
    const btn = await screen.findByRole('button', { name: 'Poveži' })
    await userEvent.click(btn)
    expect(await screen.findByText('AniList klijent još nije podešen.')).toBeTruthy()
    expect(api.anilistAuth.openAuthorize).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Poveži' }).disabled).toBe(true)
  })

  it('save calls connect(token), clears the input, and the token is never rendered as text', async () => {
    const { api, container } = setup()
    const input = await screen.findByLabelText('Nalepi token sa AniList-a')
    await userEvent.type(input, 'sekret-token')
    expect(container.textContent).not.toContain('sekret-token')
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(api.anilistAuth.connect).toHaveBeenCalledWith('sekret-token')
    expect(await screen.findByText('Povezano kao leqora')).toBeTruthy()
    expect(container.textContent).not.toContain('sekret-token')
  })

  it.each([
    ['rejected', 'Token nije prihvaćen.'],
    ['network', 'AniList nije dostupan, pokušaj ponovo.'],
    ['unavailable', 'Bezbedno čuvanje nije dostupno na ovom računaru.'],
  ])('error %s shows its message', async (error, text) => {
    setup({ auth: { connect: vi.fn(async () => ({ ok: false, error })) } })
    await userEvent.type(await screen.findByLabelText('Nalepi token sa AniList-a'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(await screen.findByText(text)).toBeTruthy()
  })

  it('cancelled shows nothing', async () => {
    const { container, api } = setup({ auth: { connect: vi.fn(async () => ({ ok: false, error: 'cancelled' })) } })
    await userEvent.type(await screen.findByLabelText('Nalepi token sa AniList-a'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(api.anilistAuth.connect).toHaveBeenCalled())
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('connected: name, disconnect via ConfirmButton, revoke note', async () => {
    const { api } = setup({ status: OK })
    expect(await screen.findByText('Povezano kao leqora')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Prekini vezu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Da' }))
    expect(api.anilistAuth.disconnect).toHaveBeenCalled()
    expect(await screen.findByText(/AniList i dalje pamti da je AnimeDesk odobren/)).toBeTruthy()
  })

  it('disconnect failure shows a message and stays connected', async () => {
    setup({ status: OK, auth: { disconnect: vi.fn(async () => ({ ok: false })) } })
    await userEvent.click(await screen.findByRole('button', { name: 'Prekini vezu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Da' }))
    expect(await screen.findByText('Prekid veze nije uspeo — pokušaj ponovo.')).toBeTruthy()
    expect(screen.getByText('Povezano kao leqora')).toBeTruthy()
  })

  it('expiring and expired texts', async () => {
    const { pushAuth } = setup({ status: { connected: true, name: 'leqora', expiresAt: Date.UTC(2026, 11, 24), state: 'expiring' } })
    expect(await screen.findByText(/Prijava ističe .*2026.* — Ponovo poveži/)).toBeTruthy()
    pushAuth({ connected: true, name: 'leqora', expiresAt: 1, state: 'expired' })
    expect(await screen.findByText('Prijava je istekla — ponovo poveži u Podešavanjima')).toBeTruthy()
  })

  it('onChange re-renders the status', async () => {
    const { pushAuth } = setup()
    await screen.findByRole('button', { name: 'Poveži' })
    pushAuth(OK)
    expect(await screen.findByText('Povezano kao leqora')).toBeTruthy()
  })

  it('pending list: plural count, modal with both rows, confirm, taken, Nije ta', async () => {
    const confirm = vi.fn(async (id) => (id === 'e1' ? { ok: true } : { ok: false, error: 'taken', title: 'Bleach 2' }))
    const pendingConfirm = vi.fn().mockResolvedValueOnce(pend).mockResolvedValue([pend[1]])
    const { api, onPick } = setup({ status: OK, sync: { confirm, pendingConfirm } })
    expect(await screen.findByText('2 serije čekaju potvrdu')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Potvrdi serije' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Naruto')).toBeTruthy()
    expect(within(dialog).getByText('Bleach')).toBeTruthy()
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'To je ta serija' })[0])
    expect(api.anilistSync.confirm).toHaveBeenCalledWith('e1', 20)
    await waitFor(() => expect(within(screen.getByRole('dialog')).queryByText('Naruto')).toBeNull())
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'To je ta serija' }))
    expect(await screen.findByText(/Ova AniList serija je već povezana sa „Bleach 2”\./)).toBeTruthy()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Nije ta' }))
    expect(onPick).toHaveBeenCalledWith(pend[1])
  })

  it('not connected: the pending count and confirm button are hidden', async () => {
    const { api } = setup({ status: NONE, pending: pend })
    await waitFor(() => expect(api.anilistSync.pendingConfirm).toHaveBeenCalled())
    await screen.findByRole('button', { name: 'Poveži' })
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'Potvrdi serije' })).toBeNull()
    expect(screen.queryByText(/čeka potvrdu|čekaju potvrdu/)).toBeNull()
  })

  it('pendingConfirm refreshes on sync onChange', async () => {
    const pendingConfirm = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([pend[0]])
    const { pushSync } = setup({ status: OK, sync: { pendingConfirm } })
    await screen.findByText('Povezano kao leqora')
    expect(screen.queryByRole('button', { name: 'Potvrdi serije' })).toBeNull()
    pushSync()
    expect(await screen.findByText('1 serija čeka potvrdu')).toBeTruthy()
  })

  it('english copy', async () => {
    setup({ status: OK, lang: 'en' })
    expect(await screen.findByText('Connected as leqora')).toBeTruthy()
  })
})
