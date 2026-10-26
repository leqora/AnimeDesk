// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPalette } from '../../../src/renderer/components/CommandPalette.jsx'
import { renderUi, makeFakeApi } from './helpers.jsx'

const LIB = [
  { id: 'a1', title: 'Pokémon', status: 'watching', lastWatchedAt: '2026-01-02' },
  { id: 'a2', title: 'One Piece', status: 'planned' },
]

async function setup({ fullscreen = false, library = LIB, api } = {}) {
  const a = api || makeFakeApi({ library: { list: vi.fn(async () => library) } })
  const onRun = vi.fn()
  const onClose = vi.fn()
  const user = userEvent.setup()
  const r = renderUi(<CommandPalette fullscreen={fullscreen} onRun={onRun} onClose={onClose} />, { api: a })
  await waitFor(() => expect(a.library.list).toHaveBeenCalled())
  await screen.findByRole('option', { name: /Raspored/ })
  return { api: a, onRun, onClose, user, ...r }
}
const labels = () => screen.getAllByRole('option').map((o) => o.textContent)

describe('CommandPalette', () => {
  it('focuses a combobox input', async () => {
    await setup()
    const input = screen.getByRole('combobox')
    expect(input).toHaveFocus()
  })

  it('blank query shows Continue, Pages, Actions and no search row', async () => {
    await setup()
    expect(await screen.findByText('Nastavi')).toBeTruthy()
    expect(screen.getByText('Stranice')).toBeTruthy()
    expect(screen.getByText('Radnje')).toBeTruthy()
    expect(screen.queryByText(/u pretrazi/)).toBeNull()
  })

  it('omits Continue without a watching entry', async () => {
    await setup({ library: [LIB[1]] })
    expect(screen.queryByText('Nastavi')).toBeNull()
  })

  it('typing ranks series first and the search row last', async () => {
    const { user } = await setup()
    await user.type(screen.getByRole('combobox'), 'poke')
    const opts = screen.getAllByRole('option')
    expect(opts[0].textContent).toContain('Pokémon')
    expect(opts[opts.length - 1].textContent).toBe('Traži „poke” u pretrazi')
  })

  it('arrows move the active option and wrap', async () => {
    const { user } = await setup()
    const input = screen.getByRole('combobox')
    const opts = screen.getAllByRole('option')
    expect(input.getAttribute('aria-activedescendant')).toBe(opts[0].id)
    expect(opts[0].getAttribute('aria-selected')).toBe('true')
    await user.keyboard('{ArrowDown}')
    expect(input.getAttribute('aria-activedescendant')).toBe(opts[1].id)
    expect(opts[1].getAttribute('aria-selected')).toBe('true')
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(input.getAttribute('aria-activedescendant')).toBe(opts[opts.length - 1].id)
  })

  it('mousemove moves the active row but mouseenter (keyboard scroll under a still pointer) does not', async () => {
    await setup()
    const input = screen.getByRole('combobox')
    const opts = screen.getAllByRole('option')
    fireEvent.mouseEnter(opts[2])
    expect(input.getAttribute('aria-activedescendant')).toBe(opts[0].id)
    fireEvent.mouseMove(opts[2])
    expect(input.getAttribute('aria-activedescendant')).toBe(opts[2].id)
  })

  it('the search row wrapper is not an unlabeled group', async () => {
    const { user } = await setup()
    await user.type(screen.getByRole('combobox'), 'poke')
    const row = screen.getByRole('option', { name: /u pretrazi/ })
    expect(row.parentElement.getAttribute('role')).toBeNull()
  })

  it('Enter on a series runs anime', async () => {
    const { user, onRun } = await setup()
    await user.keyboard('{Enter}')
    expect(onRun).toHaveBeenCalledWith({ type: 'anime', id: 'a1' })
  })

  it('Enter on a page runs page', async () => {
    const { user, onRun } = await setup()
    await user.type(screen.getByRole('combobox'), 'raspored')
    await user.keyboard('{Enter}')
    expect(onRun).toHaveBeenCalledWith({ type: 'page', page: 'schedule' })
  })

  it('Enter on the search row runs a trimmed search', async () => {
    const { user, onRun } = await setup()
    await user.type(screen.getByRole('combobox'), '  poke  ')
    await user.keyboard('{ArrowUp}{Enter}')
    expect(onRun).toHaveBeenCalledWith({ type: 'search', query: 'poke' })
  })

  it('search query is capped at 100 chars', async () => {
    const { user, onRun } = await setup()
    await user.click(screen.getByRole('combobox'))
    await user.paste('x'.repeat(150))
    await user.keyboard('{ArrowUp}{Enter}')
    expect(onRun.mock.calls[0][0].query).toHaveLength(100)
  })

  it('shows the exit-fullscreen action when fullscreen', async () => {
    await setup({ fullscreen: true })
    expect(screen.getByRole('option', { name: 'Izađi iz celog ekrana' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Ceo ekran' })).toBeNull()
  })

  it('actions run fullscreen and wizard', async () => {
    const { user, onRun } = await setup()
    await user.click(screen.getByRole('option', { name: 'Ceo ekran' }))
    expect(onRun).toHaveBeenCalledWith({ type: 'fullscreen' })
    await user.click(screen.getByRole('option', { name: 'Komponente i provera' }))
    expect(onRun).toHaveBeenCalledWith({ type: 'wizard' })
  })

  it('still renders Pages and Actions when library.list rejects', async () => {
    const api = makeFakeApi({ library: { list: vi.fn(async () => { throw new Error('x') }) } })
    await setup({ api })
    expect(screen.queryByText('Nastavi')).toBeNull()
    expect(screen.getByText('Stranice')).toBeTruthy()
    expect(screen.getByText('Radnje')).toBeTruthy()
  })

  it('symbol-only query behaves like blank', async () => {
    const { user } = await setup()
    const blank = labels()
    await user.type(screen.getByRole('combobox'), '★!!')
    expect(labels()).toEqual(blank)
    expect(screen.queryByText(/u pretrazi/)).toBeNull()
  })

  it('Tab keeps focus on the input', async () => {
    const { user } = await setup()
    await user.tab()
    expect(screen.getByRole('combobox')).toHaveFocus()
  })

  it('options are not buttons and the palette makes no network calls', async () => {
    const { api } = await setup()
    for (const o of screen.getAllByRole('option')) {
      expect(o.tagName).not.toBe('BUTTON')
      expect(within(o).queryByRole('button')).toBeNull()
    }
    expect(api.anilist.forTitle).not.toHaveBeenCalled()
    expect(api.anilist.search).not.toHaveBeenCalled()
  })
})
