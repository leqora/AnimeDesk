// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'

vi.mock('hls.js', async () => ({ default: (await import('./fakeHls.js')).FakeHls }))

const ctrlK = (target = window, init = {}) => {
  const ev = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true, ...init })
  act(() => { target.dispatchEvent(ev) })
  return ev
}
const boot = async (over) => {
  const api = makeFakeApi(over)
  render(<App api={api} />)
  await waitFor(() => screen.getByRole('button', { name: 'Podešavanja' }))
  return api
}

describe('App command palette', () => {
  it('Ctrl+K opens the palette and a second Ctrl+K closes it', async () => {
    await boot()
    const ev = ctrlK()
    expect(ev.defaultPrevented).toBe(true)
    expect(await screen.findByRole('dialog', { name: 'Brza pretraga' })).toBeInTheDocument()
    const closing = ctrlK(screen.getByRole('combobox'))
    expect(closing.defaultPrevented).toBe(true)
    expect(screen.queryByRole('dialog', { name: 'Brza pretraga' })).not.toBeInTheDocument()
  })
  it('closes when the player opens while the palette is open', async () => {
    let openPlayer
    await boot({ player: { onOpen: vi.fn((cb) => { openPlayer = cb; return () => {} }) } })
    ctrlK()
    await screen.findByRole('dialog', { name: 'Brza pretraga' })
    act(() => openPlayer({ playbackId: 'p1', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/s/t/p1/playlist', subtitleUrl: null, resumeAt: null, totalEpisodes: 12 }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Brza pretraga' })).not.toBeInTheDocument())
    expect(document.activeElement).not.toBe(document.querySelector('main.content'))
  })
  it('running a series action focuses main', async () => {
    await boot({ library: { list: vi.fn(async () => [{ id: 'a1', title: 'Pokémon', aniCliTitle: 'Pokémon', status: 'watching', lastWatchedAt: '2026-01-02T10:00:00.000Z' }]) } })
    ctrlK()
    fireEvent.click(await screen.findByRole('option', { name: /Pokémon/ }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Brza pretraga' })).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('main.content')))
  })
  it('the wizard action opens the setup wizard', async () => {
    await boot()
    ctrlK()
    fireEvent.click(await screen.findByRole('option', { name: 'Komponente i provera' }))
    expect(await screen.findByRole('heading', { name: 'Podešavanje' })).toBeInTheDocument()
  })
  it('opens while focus is in the Home search input, which keeps its value', async () => {
    await boot()
    const input = document.getElementById('search-input')
    input.focus()
    fireEvent.change(input, { target: { value: 'naruto' } })
    ctrlK(input)
    expect(await screen.findByRole('dialog', { name: 'Brza pretraga' })).toBeInTheDocument()
    expect(input).toHaveValue('naruto')
  })
  it('does nothing over the setup wizard and does not prevent the default', async () => {
    const api = makeFakeApi({ health: { get: vi.fn(async () => ({ light: 'red', reason: 'missing-tools', missing: ['mpv'] })) } })
    render(<App api={api} />)
    await screen.findByRole('heading', { name: 'Podešavanje' }, { timeout: 3000 })
    const ev = ctrlK()
    expect(ev.defaultPrevented).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'Brza pretraga' })).not.toBeInTheDocument()
  })
  it('does nothing while the player is open', async () => {
    let openPlayer
    await boot({ player: { onOpen: vi.fn((cb) => { openPlayer = cb; return () => {} }) } })
    act(() => openPlayer({ playbackId: 'p1', title: 'Show', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/s/t/p1/playlist', subtitleUrl: null, resumeAt: null, totalEpisodes: 12 }))
    const ev = ctrlK()
    expect(ev.defaultPrevented).toBe(false)
    expect(screen.queryByRole('dialog', { name: 'Brza pretraga' })).not.toBeInTheDocument()
  })
  it('running a page action navigates and focuses main', async () => {
    await boot()
    ctrlK()
    await screen.findByRole('dialog', { name: 'Brza pretraga' })
    fireEvent.click(await screen.findByRole('option', { name: 'Preuzeto' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Brza pretraga' })).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('main.content')))
    expect(screen.getByRole('button', { name: 'Preuzeto' })).toHaveAttribute('aria-current', 'page')
  })
  it('Esc returns focus to the element focused before', async () => {
    await boot()
    const btn = screen.getByRole('button', { name: 'Podešavanja' })
    btn.focus()
    ctrlK()
    const combo = await screen.findByRole('combobox')
    fireEvent.keyDown(combo, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Brza pretraga' })).not.toBeInTheDocument())
    expect(document.activeElement).toBe(btn)
  })
  it('the sidebar button opens the palette', async () => {
    await boot()
    fireEvent.click(screen.getByRole('button', { name: 'Brza pretraga' }))
    expect(await screen.findByRole('dialog', { name: 'Brza pretraga' })).toBeInTheDocument()
  })
  it('the fullscreen action toggles fullscreen', async () => {
    const api = await boot()
    ctrlK()
    fireEvent.click(await screen.findByRole('option', { name: 'Ceo ekran' }))
    expect(api.window.setFullscreen).toHaveBeenCalledWith(true)
  })
})
