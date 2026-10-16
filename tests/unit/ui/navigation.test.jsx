// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import App from '../../../src/renderer/App.jsx'
import { makeFakeApi } from './helpers.jsx'

vi.mock('hls.js', async () => ({ default: (await import('./fakeHls.js')).FakeHls }))

const entry = (id, title, over = {}) => ({
  id, title, aniCliTitle: title, aniListId: null, status: 'watching', rating: null, comment: '',
  totalEpisodes: 12, watchedEpisodes: [1, 2], episodeNotes: {}, lastWatchedAt: '2026-10-01T00:00:00Z', pinnedAt: null, ...over,
})
const LIB = [entry('a', 'Alpha'), entry('b', 'Bravo', { status: 'completed' }), entry('c', 'Charlie', { status: 'completed' })]

const setup = (over = {}) => {
  const api = makeFakeApi({ library: { list: vi.fn(async () => LIB) }, ...over })
  render(<App api={api} />)
  return api
}
const goWatchlist = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /Watchlist/ }))
  await screen.findByLabelText('Naziv animea')
}
const openCard = async (title) => {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${title} —`) }))
  await screen.findByRole('button', { name: 'Nazad' })
}
const altBack = () => fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true })
const altForward = () => fireEvent.keyDown(window, { key: 'ArrowRight', altKey: true })

afterEach(() => vi.unstubAllGlobals())

describe('navigation', () => {
  it('detail opened from Home goes back to Home', async () => {
    setup()
    const rail = await screen.findByRole('region', { name: 'Nastavi gledanje' })
    fireEvent.click(rail.querySelector('button.media-card__open'))
    fireEvent.click(await screen.findByRole('button', { name: 'Nazad' }))
    expect(await screen.findByRole('region', { name: 'Nastavi gledanje' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Naziv animea')).not.toBeInTheDocument()
  })
  it('watchlist filter survives detail and back', async () => {
    setup()
    await goWatchlist()
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'completed' } })
    await openCard('Bravo')
    fireEvent.click(screen.getByRole('button', { name: 'Nazad' }))
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue('completed'))
  })
  it('Alt+ArrowLeft and mouse button 4 go back; Alt+ArrowRight / button 5 forward', async () => {
    setup()
    await goWatchlist()
    await openCard('Alpha')
    altBack()
    await screen.findByLabelText('Naziv animea')
    altForward()
    await screen.findByRole('button', { name: 'Nazad' })
    fireEvent.mouseUp(window, { button: 3 })
    await screen.findByLabelText('Naziv animea')
    fireEvent.mouseUp(window, { button: 4 })
    await screen.findByRole('button', { name: 'Nazad' })
    const down = new MouseEvent('mousedown', { button: 3, cancelable: true, bubbles: true })
    window.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
  })
  it('shortcuts are ignored while a modal is open', async () => {
    let release
    const api = makeFakeApi({ library: { list: vi.fn(async () => LIB) }, whatsNew: { get: vi.fn(() => new Promise((r) => { release = r })) } })
    render(<App api={api} />)
    await goWatchlist()
    await openCard('Alpha')
    await act(async () => { release({ version: '0.7.3', notes: 'x' }) })
    await waitFor(() => expect(document.querySelector('[aria-modal="true"]')).not.toBeNull())
    altBack()
    expect(screen.getByRole('button', { name: 'Nazad' })).toBeInTheDocument()
  })
  it('shortcuts are ignored while the player is open', async () => {
    let openPlayer
    const api = makeFakeApi({ library: { list: vi.fn(async () => LIB) }, player: { onOpen: vi.fn((cb) => { openPlayer = cb; return () => {} }) } })
    render(<App api={api} />)
    await goWatchlist()
    await openCard('Alpha')
    await waitFor(() => expect(openPlayer).toBeDefined())
    act(() => openPlayer({ playbackId: 'p1', title: 'Alpha', episode: '3', kind: 'hls', src: 'http://127.0.0.1:9/s/t/p1/playlist', subtitleUrl: null, resumeAt: null, totalEpisodes: 12 }))
    altBack()
    // the app shell is inert behind the player, hence hidden: true
    expect(screen.getByRole('button', { name: 'Nazad', hidden: true })).toBeInTheDocument()
  })
  it('back restores the scroll position of the content', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(0); return 1 })
    setup()
    await goWatchlist()
    const main = document.querySelector('main.content')
    Object.defineProperty(main, 'scrollHeight', { configurable: true, value: 3000 })
    Object.defineProperty(main, 'clientHeight', { configurable: true, value: 500 })
    main.scrollTop = 600
    await openCard('Alpha')
    expect(main.scrollTop).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Nazad' }))
    await screen.findByLabelText('Naziv animea')
    await waitFor(() => expect(main.scrollTop).toBe(600))
  })
  it('a back pressed while a scroll restore is pending keeps the saved position', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    setup()
    await goWatchlist()
    const main = document.querySelector('main.content')
    const size = (h) => Object.defineProperty(main, 'scrollHeight', { configurable: true, value: h })
    Object.defineProperty(main, 'clientHeight', { configurable: true, value: 500 })
    size(3000)
    main.scrollTop = 600
    await openCard('Alpha')
    size(100) // content not loaded yet: the restore stays pending
    altBack()
    await screen.findByLabelText('Naziv animea')
    altBack() // second back before the restore finished
    await screen.findByRole('region', { name: 'Nastavi gledanje' })
    size(3000)
    altForward()
    await screen.findByLabelText('Naziv animea')
    await waitFor(() => expect(main.scrollTop).toBe(600))
  })
  it('going back to an entry with scroll 0 does not freeze later scroll saves', async () => {
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(0); return 1 })
    setup()
    await goWatchlist()
    altBack()
    await screen.findByRole('region', { name: 'Nastavi gledanje' })
    const main = document.querySelector('main.content')
    Object.defineProperty(main, 'scrollHeight', { configurable: true, value: 3000 })
    Object.defineProperty(main, 'clientHeight', { configurable: true, value: 500 })
    main.scrollTop = 400
    await goWatchlist()
    altBack()
    await screen.findByRole('region', { name: 'Nastavi gledanje' })
    await waitFor(() => expect(main.scrollTop).toBe(400))
  })
  it('a removed series route shows the watchlist grid', async () => {
    const changed = []
    let lib = LIB
    const api = makeFakeApi({ library: { list: vi.fn(async () => lib) } })
    api.onLibraryChanged = vi.fn((cb) => { changed.push(cb); return () => {} })
    render(<App api={api} />)
    await goWatchlist()
    await openCard('Alpha')
    lib = LIB.slice(1)
    await act(async () => { changed.forEach((cb) => cb()) })
    expect(await screen.findByLabelText('Naziv animea')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Nazad' })).not.toBeInTheDocument()
  })
})
