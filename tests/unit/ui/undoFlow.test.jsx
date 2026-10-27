// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'

vi.mock('hls.js', async () => ({ default: (await import('./fakeHls.js')).FakeHls }))

const entry = (id, title) => ({
  id, title, aniCliTitle: title, aniListId: null, status: 'watching', rating: null, comment: '',
  totalEpisodes: 12, watchedEpisodes: [1], episodeNotes: {}, lastWatchedAt: '2026-10-01T00:00:00Z', pinnedAt: null,
})

// a library that really shrinks on remove and grows on restore, like main does
function liveApi(over = {}) {
  let lib = [entry('a', 'Alpha'), entry('b', 'Bravo')]
  const removed = new Map()
  const listeners = new Set()
  const emit = () => listeners.forEach((l) => l())
  return makeFakeApi({
    library: {
      list: vi.fn(async () => lib),
      remove: vi.fn(async (id) => { removed.set(id, lib.find((e) => e.id === id)); lib = lib.filter((e) => e.id !== id); emit(); return true }),
      restore: vi.fn(async (id) => { lib = [...lib, removed.get(id)]; emit(); return { ok: true, entry: removed.get(id) } }),
    },
    ...over,
  })
}
const toDetail = async (title = 'Alpha') => {
  fireEvent.click(await screen.findByRole('button', { name: /Watchlist/ }))
  await screen.findByLabelText('Naziv animea')
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${title} —`) }))
  await screen.findByRole('button', { name: 'Nazad' })
}
const remove = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Još' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Ukloni iz Watchlist-e' }))
}
const ctrlZ = (target = window) => fireEvent.keyDown(target, { key: 'z', code: 'KeyZ', ctrlKey: true })

describe('undo flow in the app', () => {
  it('removing from the detail goes back, and "Poništi" restores the series without an error toast', async () => {
    const api = liveApi()
    render(<App api={api} />)
    await toDetail()
    remove()
    const undo = await screen.findByRole('button', { name: 'Poništi' })
    expect(screen.queryByRole('button', { name: 'Nazad' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Naziv animea')).toBeInTheDocument()
    fireEvent.click(undo)
    await waitFor(() => expect(api.library.restore).toHaveBeenCalledWith('a'))
    expect(screen.queryByText('Seriju nije moguće vratiti.')).not.toBeInTheDocument()
  })
  it('after removal the focus is on "Poništi"', async () => {
    render(<App api={liveApi()} />)
    await toDetail()
    remove()
    const undo = await screen.findByRole('button', { name: 'Poništi' })
    await waitFor(() => expect(undo).toHaveFocus())
  })
  it('Ctrl+Z runs the newest action toast', async () => {
    const api = liveApi()
    render(<App api={api} />)
    await toDetail()
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Označi kao odgledano' }))
    await screen.findByText('EP 2 označena kao odgledana')
    remove()
    await screen.findByText(/Uklonjeno iz watchlist-e/)
    api.library.update.mockClear()
    expect(ctrlZ()).toBe(false) // preventDefault was called
    await waitFor(() => expect(api.library.restore).toHaveBeenCalledWith('a'))
    expect(api.library.update).not.toHaveBeenCalled()
    expect(screen.queryByText(/Uklonjeno iz watchlist-e/)).not.toBeInTheDocument()
  })
  it('ignores auto-repeated Ctrl+Z', async () => {
    const api = liveApi()
    render(<App api={api} />)
    await toDetail()
    fireEvent.click(screen.getByRole('button', { name: '2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Označi kao odgledano' }))
    await screen.findByText('EP 2 označena kao odgledana')
    remove()
    await screen.findByText(/Uklonjeno iz watchlist-e/)
    api.library.update.mockClear()
    ctrlZ()
    await waitFor(() => expect(api.library.restore).toHaveBeenCalledTimes(1))
    expect(fireEvent.keyDown(window, { key: 'z', code: 'KeyZ', ctrlKey: true, repeat: true })).toBe(true)
    await act(async () => {})
    expect(api.library.restore).toHaveBeenCalledTimes(1)
    expect(api.library.update).not.toHaveBeenCalled()
    expect(screen.getByText('EP 2 označena kao odgledana')).toBeInTheDocument()
  })
  it('does not undo inside contenteditable="plaintext-only"', async () => {
    const api = liveApi()
    render(<App api={api} />)
    await toDetail()
    remove()
    await screen.findByRole('button', { name: 'Poništi' })
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'plaintext-only')
    document.body.appendChild(editor)
    try {
      expect(ctrlZ(editor)).toBe(true)
    } finally { editor.remove() }
    expect(api.library.restore).not.toHaveBeenCalled()
  })
  it('Ctrl+Z without an action toast does nothing and keeps the default', async () => {
    render(<App api={liveApi()} />)
    await screen.findByRole('button', { name: /Watchlist/ })
    expect(ctrlZ()).toBe(true)
  })
  it('Ctrl+Z is ignored in a text input', async () => {
    const api = liveApi()
    render(<App api={api} />)
    await toDetail()
    remove()
    await screen.findByRole('button', { name: 'Poništi' })
    expect(ctrlZ(screen.getByLabelText('Naziv animea'))).toBe(true)
    expect(api.library.restore).not.toHaveBeenCalled()
  })
  it('Ctrl+Z is ignored while a modal is open', async () => {
    let release
    const api = liveApi({ whatsNew: { get: vi.fn(() => new Promise((r) => { release = r })) } })
    render(<App api={api} />)
    await toDetail()
    remove()
    await screen.findByRole('button', { name: 'Poništi' })
    await act(async () => { release({ version: '0.7.3', notes: 'x' }) })
    await waitFor(() => expect(document.querySelector('[aria-modal="true"]')).not.toBeNull())
    expect(ctrlZ()).toBe(true)
    expect(api.library.restore).not.toHaveBeenCalled()
  })
})
