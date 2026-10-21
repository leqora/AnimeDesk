// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { SchedulePage } from '../../../src/renderer/pages/SchedulePage.jsx'
import { Sidebar } from '../../../src/renderer/components/Sidebar.jsx'
import { EMPTY_STATS } from '../../../src/shared/stats.js'

// Wed 2026-10-21 10:00 local; "at(0, 20)" = today 20:00, "at(1, 9)" = tomorrow 09:00.
const NOW = new Date(2026, 9, 21, 10, 0).getTime()
const at = (day, h, m = 0) => new Date(2026, 9, 21 + day, h, m).getTime()
const item = (over = {}) => ({ mediaId: 1, episode: 5, airingAt: at(0, 20), title: 'Alpha', romaji: 'Alpha R', format: 'TV', entryId: null, posterHidden: false, ...over })
const data = (items, over = {}) => ({ state: 'ok', refreshing: false, fetchedAt: NOW, from: at(0, 0), days: [], items, ...over })
const apiWith = (payload, extra = {}) => makeFakeApi({ schedule: { list: vi.fn(async () => payload), ...extra } })
const page = (api, props = {}) => renderUi(<SchedulePage ready onOpenAnime={vi.fn()} onSearch={vi.fn()} {...props} />, { api })
const dayButtons = () => within(screen.getByRole('group', { name: 'Dani' })).getAllByRole('button')

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
afterEach(() => { vi.useRealTimers() })

describe('SchedulePage', () => {
  it('defaults to My series when an item is in the library, else All', async () => {
    page(apiWith(data([item({ entryId: 'e1' }), item({ mediaId: 2, title: 'Beta' })])))
    expect(await screen.findByRole('button', { name: /Moje serije/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Sve/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /^Alpha/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Beta/ })).toBeNull()
  })

  it('defaults to All without library items, with counts', async () => {
    page(apiWith(data([item(), item({ mediaId: 2, title: 'Beta' })])))
    const all = await screen.findByRole('button', { name: /^Sve/ })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: /Moje serije/ })).toHaveTextContent('0')
  })

  it('shows 7 day buttons with counts and Danas selected', async () => {
    page(apiWith(data([item(), item({ mediaId: 2, title: 'Beta', airingAt: at(1, 9) }), item({ mediaId: 3, title: 'Gamma', airingAt: at(6, 9) })])))
    await screen.findByRole('group', { name: 'Dani' })
    const btns = dayButtons()
    expect(btns).toHaveLength(7)
    expect(btns[0]).toHaveTextContent('Danas')
    expect(btns[0]).toHaveAttribute('aria-pressed', 'true')
    expect(btns[0]).toHaveTextContent('1')
    expect(btns[1]).toHaveTextContent('Sutra')
    expect(btns[1]).toHaveAttribute('aria-pressed', 'false')
    expect(btns[2].textContent).toMatch(/23/)
    fireEvent.click(btns[1])
    expect(dayButtons()[1]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Beta/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Alpha/ })).toBeNull()
  })

  it('sorts rows by time and shows time, episode(s) and format', async () => {
    page(apiWith(data([
      item({ mediaId: 2, title: 'Late', airingAt: at(0, 22), episode: 3, format: 'ONA' }),
      item({ mediaId: 1, title: 'Early', airingAt: at(0, 12, 30), episode: 1 }),
      item({ mediaId: 1, title: 'Early', airingAt: at(0, 12, 30), episode: 2 }),
    ])))
    await screen.findByRole('button', { name: /^Early/ })
    const rows = screen.getAllByRole('button').filter((b) => /^(Early|Late)/.test(b.getAttribute('aria-label') ?? ''))
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Early, EP 1–2, Danas u 12:30, TV', 'Late, EP 3, Danas u 22:00, ONA'])
    expect(rows[0]).toHaveTextContent('12:30')
    expect(rows[0]).toHaveTextContent('EP 1–2')
    expect(rows[1]).toHaveTextContent('ONA')
  })

  it('marks aired rows', async () => {
    page(apiWith(data([item({ airingAt: at(0, 8) })])))
    const row = await screen.findByRole('button', { name: /^Alpha/ })
    expect(row.getAttribute('aria-label')).toMatch(/, izašlo$/)
    expect(row).toHaveTextContent('Izašlo')
  })

  it('shows the In Watchlist badge only in All for library rows', async () => {
    page(apiWith(data([item({ entryId: 'e1' })])))
    await screen.findByRole('button', { name: /^Alpha/ })
    expect(screen.queryByText('U Watchlist-i')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Sve/ }))
    expect(screen.getByText('U Watchlist-i')).toBeInTheDocument()
  })

  it('opens the library entry or searches', async () => {
    const onOpenAnime = vi.fn()
    const onSearch = vi.fn()
    page(apiWith(data([item({ entryId: 'e1' }), item({ mediaId: 2, title: 'Beta', romaji: null })])), { onOpenAnime, onSearch })
    fireEvent.click(await screen.findByRole('button', { name: /^Alpha/ }))
    expect(onOpenAnime).toHaveBeenCalledWith('e1')
    fireEvent.click(screen.getByRole('button', { name: /^Sve/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Beta/ }))
    expect(onSearch).toHaveBeenCalledWith('Beta')
  })

  it('searches by romaji when there is one', async () => {
    const onSearch = vi.fn()
    page(apiWith(data([item()])), { onSearch })
    fireEvent.click(await screen.findByRole('button', { name: /^Alpha/ }))
    expect(onSearch).toHaveBeenCalledWith('Alpha R')
  })

  it('disables rows until ready', async () => {
    page(apiWith(data([item()])), { ready: false })
    expect(await screen.findByRole('button', { name: /^Alpha/ })).toBeDisabled()
  })

  it('asks for the posters of the selected day (max 40) and renders them', async () => {
    const many = Array.from({ length: 45 }, (_, i) => item({ mediaId: 100 + i, title: `S${i}`, airingAt: at(0, 11, i) }))
    const posters = vi.fn(async (ids) => ({ [ids[0]]: 'data:image/png;base64,AAAA' }))
    const { container } = page(apiWith(data(many), { posters }))
    await waitFor(() => expect(posters).toHaveBeenCalled())
    expect(posters.mock.calls[0][0]).toHaveLength(40)
    await waitFor(() => expect(container.querySelector('img[src="data:image/png;base64,AAAA"]')).not.toBeNull())
  })

  it('asks again for another day', async () => {
    const posters = vi.fn(async () => ({}))
    page(apiWith(data([item(), item({ mediaId: 2, title: 'Beta', airingAt: at(1, 9) })]), { posters }))
    await waitFor(() => expect(posters).toHaveBeenLastCalledWith([1]))
    await screen.findByRole('group', { name: 'Dani' })
    fireEvent.click(dayButtons()[1])
    await waitFor(() => expect(posters).toHaveBeenLastCalledWith([2]))
  })

  it('hidden-poster rows have no image, describe why and never request a poster', async () => {
    const posters = vi.fn(async () => ({}))
    page(apiWith(data([item({ posterHidden: true })]), { posters }))
    const row = await screen.findByRole('button', { name: /^Alpha/ })
    expect(row.querySelector('img')).toBeNull()
    expect(row).toHaveAccessibleDescription('Kasnija sezona — bez postera, da ne otkrije ništa.')
    expect(row.querySelector('[title]')).toHaveAttribute('title', 'Kasnija sezona — bez postera, da ne otkrije ništa.')
    await act(async () => {})
    for (const [ids] of posters.mock.calls) expect(ids).not.toContain(1)
  })

  it('shows the no-poster note once, in All', async () => {
    page(apiWith(data([item({ posterHidden: true }), item({ mediaId: 2, title: 'Beta' })])))
    await screen.findByRole('button', { name: /^Alpha/ })
    expect(screen.getAllByText('Kasnije sezone i sporedne priče su bez postera, da ne otkriju ništa.')).toHaveLength(1)
  })

  it('shows a skeleton while loading', async () => {
    page(apiWith({ state: 'loading', refreshing: true, fetchedAt: null, from: 0, days: [], items: [] }))
    expect(await screen.findByTestId('schedule-skeleton')).toBeInTheDocument()
    expect(screen.queryByText('Nema epizoda ovog dana.')).toBeNull()
  })

  it('shows the error with a retry that forces a refresh', async () => {
    const list = vi.fn(async () => ({ state: 'error', refreshing: false, fetchedAt: null, from: 0, days: [], items: [] }))
    page(makeFakeApi({ schedule: { list } }))
    expect(await screen.findByText('Raspored trenutno nije dostupan.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(list).toHaveBeenLastCalledWith({ force: true })
  })

  it('shows the stale note with the time, rows, and a retry', async () => {
    const list = vi.fn(async () => data([item()], { state: 'stale', fetchedAt: at(0, 7, 5) }))
    page(makeFakeApi({ schedule: { list } }))
    expect(await screen.findByText(/Prikazan raspored od .*7:05/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Alpha/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(list).toHaveBeenLastCalledWith({ force: true })
  })

  it('moves focus to the heading after a successful retry from stale', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce(data([item()], { state: 'stale', fetchedAt: at(0, 7, 5) }))
      .mockResolvedValue(data([item()]))
    page(makeFakeApi({ schedule: { list } }))
    const btn = await screen.findByRole('button', { name: 'Pokušaj ponovo' })
    btn.focus()
    fireEvent.click(btn)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pokušaj ponovo' })).toBeNull())
    // the focus effect is passive, so it may land a tick after the button is gone
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Raspored' })))
    expect(document.activeElement).not.toBe(document.body)
  })

  it('same from the error state', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce({ state: 'error', refreshing: false, fetchedAt: null, from: 0, days: [], items: [] })
      .mockResolvedValue(data([item()]))
    page(makeFakeApi({ schedule: { list } }))
    const btn = await screen.findByRole('button', { name: 'Pokušaj ponovo' })
    btn.focus()
    fireEvent.click(btn)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pokušaj ponovo' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2, name: 'Raspored' })))
  })

  it('does not move focus when the retry button was not focused', async () => {
    let onSched
    const list = vi.fn()
      .mockResolvedValueOnce(data([item()], { state: 'stale', fetchedAt: at(0, 7, 5) }))
      .mockResolvedValue(data([item()]))
    page(makeFakeApi({ schedule: { list, onChanged: vi.fn((cb) => { onSched = cb; return () => {} }) } }))
    await screen.findByRole('button', { name: 'Pokušaj ponovo' })
    const chip = dayButtons()[1]
    chip.focus()
    await act(async () => { onSched() })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pokušaj ponovo' })).toBeNull())
    expect(document.activeElement).toBe(dayButtons()[1])
  })

  it('shows the clock-change note only on the day with the change', async () => {
    vi.spyOn(Date.prototype, 'getTimezoneOffset').mockImplementation(function () { return this.getTime() < at(4, 3) ? -120 : -60 })
    try {
      page(apiWith(data([item()])))
      await screen.findByRole('group', { name: 'Dani' })
      const note = 'Ovog dana se sat vraća unazad — vremena posle promene su po zimskom računanju vremena.'
      fireEvent.click(dayButtons()[3])
      expect(screen.queryByText(note)).toBeNull()
      fireEvent.click(dayButtons()[4])
      expect(screen.getByText(note)).toBeInTheDocument()
    } finally { vi.restoreAllMocks() }
  })

  it('offers Show all when My series is empty', async () => {
    page(apiWith(data([item()])))
    fireEvent.click(await screen.findByRole('button', { name: /Moje serije/ }))
    expect(screen.getByText('Nijedna serija iz Watchlist-e ne izlazi u narednih 7 dana.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Prikaži sve' }))
    expect(screen.getByRole('button', { name: /^Sve/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^Alpha/ })).toBeInTheDocument()
  })

  it('shows the empty day', async () => {
    page(apiWith(data([item()])))
    await screen.findByRole('group', { name: 'Dani' })
    fireEvent.click(dayButtons()[3])
    expect(screen.getByText('Nema epizoda ovog dana.')).toBeInTheDocument()
  })

  it('reloads on schedule and library changes', async () => {
    let onSched
    let onLib
    const api = apiWith(data([item()]), { onChanged: vi.fn((cb) => { onSched = cb; return () => {} }) })
    api.onLibraryChanged = vi.fn((cb) => { onLib = cb; return () => {} })
    page(api)
    await screen.findByRole('button', { name: /^Alpha/ })
    expect(api.schedule.list).toHaveBeenCalledTimes(1)
    await act(async () => { onSched() })
    expect(api.schedule.list).toHaveBeenCalledTimes(2)
    await act(async () => { onLib() })
    expect(api.schedule.list).toHaveBeenCalledTimes(3)
  })

  it('ignores a stale list answer that arrives after a newer one', async () => {
    let onSched
    let resolveFirst
    const first = new Promise((r) => { resolveFirst = r })
    const list = vi.fn().mockReturnValueOnce(first).mockResolvedValue(data([item({ title: 'Fresh' })]))
    page(makeFakeApi({ schedule: { list, onChanged: vi.fn((cb) => { onSched = cb; return () => {} }) } }))
    await act(async () => { onSched() })
    expect(await screen.findByRole('button', { name: /^Fresh/ })).toBeInTheDocument()
    await act(async () => { resolveFirst(data([item({ title: 'Old' })])) })
    expect(screen.queryByRole('button', { name: /^Old/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Fresh/ })).toBeInTheDocument()
  })

  it('reloads after midnight, resets a day that left the window and keeps one still inside', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 21, 23, 30).getTime())
    const api = apiWith(data([item({ airingAt: at(1, 9) })]))
    const { unmount } = page(api)
    await act(async () => { await Promise.resolve() })
    fireEvent.click(dayButtons()[3]) // 24th: still inside after midnight
    expect(dayButtons()[3]).toHaveAttribute('aria-pressed', 'true')
    vi.setSystemTime(new Date(2026, 9, 22, 0, 30).getTime())
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(api.schedule.list).toHaveBeenCalledTimes(2)
    expect(dayButtons().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    expect(dayButtons()[2]).toHaveAttribute('aria-pressed', 'true') // the 24th is index 2 now
    unmount()

    vi.setSystemTime(new Date(2026, 9, 21, 23, 30).getTime())
    const api2 = apiWith(data([item({ airingAt: at(1, 9) })]))
    page(api2)
    await act(async () => { await Promise.resolve() })
    fireEvent.click(dayButtons()[0]) // today leaves the window at midnight
    vi.setSystemTime(new Date(2026, 9, 22, 0, 30).getTime())
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(api2.schedule.list).toHaveBeenCalledTimes(2)
    expect(dayButtons()[0]).toHaveTextContent('Danas')
    expect(dayButtons()[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('requests posters in chunks of 40 and settles every row', async () => {
    const many = Array.from({ length: 45 }, (_, i) => item({ mediaId: 100 + i, title: `S${String(i).padStart(2, '0')}`, airingAt: at(0, 11, i) }))
    const posters = vi.fn(async (ids) => Object.fromEntries(ids.map((id) => [id, null])))
    const { container } = page(apiWith(data(many), { posters }))
    await waitFor(() => expect(posters).toHaveBeenCalledTimes(2))
    expect(posters.mock.calls.map((c) => c[0].length)).toEqual([40, 5])
    await waitFor(() => expect(container.querySelector('.poster--skeleton')).toBeNull())
  })

  it('shows a poster from the second chunk', async () => {
    const many = Array.from({ length: 45 }, (_, i) => item({ mediaId: 100 + i, title: `S${i}`, airingAt: at(0, 11, i) }))
    const posters = vi.fn(async (ids) => (ids.includes(144) ? { 144: 'data:image/png;base64,ZZZZ' } : {}))
    const { container } = page(apiWith(data(many), { posters }))
    await waitFor(() => expect(container.querySelector('img[src="data:image/png;base64,ZZZZ"]')).not.toBeNull())
  })

  it('falls back to the empty frame when posters() rejects', async () => {
    const posters = vi.fn(async () => { throw new Error('boom') })
    const { container } = page(apiWith(data([item()]), { posters }))
    await screen.findByRole('button', { name: /^Alpha/ })
    await waitFor(() => expect(container.querySelector('.poster--skeleton')).toBeNull())
    expect(container.querySelector('.poster--empty')).not.toBeNull()
  })

  it('keeps a shown poster when a later answer omits it', async () => {
    let onSched
    const posters = vi.fn().mockResolvedValueOnce({ 1: 'data:image/png;base64,KEEP' }).mockResolvedValue({})
    const { container } = page(apiWith(null, { list: vi.fn(async () => data([item()])), posters, onChanged: vi.fn((cb) => { onSched = cb; return () => {} }) }))
    await waitFor(() => expect(container.querySelector('img[src="data:image/png;base64,KEEP"]')).not.toBeNull())
    await act(async () => { onSched() })
    await waitFor(() => expect(posters).toHaveBeenCalledTimes(2))
    expect(container.querySelector('img[src="data:image/png;base64,KEEP"]')).not.toBeNull()
  })

  it('counts only the 7-day window for chips and the default mode', async () => {
    page(apiWith(data([item(), item({ mediaId: 2, title: 'Far', entryId: 'e9', airingAt: at(8, 9) }), item({ mediaId: 3, title: 'Past', entryId: 'e8', airingAt: at(-1, 9) })])))
    const all = await screen.findByRole('button', { name: /^Sve/ })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /Moje serije/ })).toHaveTextContent('0')
  })
})

describe('schedule menu and copy', () => {
  it('has Raspored between Watchlist and Preuzeto and navigates', () => {
    const onNavigate = vi.fn()
    renderUi(<Sidebar page="home" onNavigate={onNavigate} health={{ light: 'green', reason: 'ok' }} onSemaphoreClick={vi.fn()} profileName="N" stats={EMPTY_STATS} />)
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(names.indexOf('Raspored')).toBe(names.indexOf('Watchlist') + 1)
    expect(names.indexOf('Preuzeto')).toBe(names.indexOf('Raspored') + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Raspored' }))
    expect(onNavigate).toHaveBeenCalledWith('schedule')
  })

  it('has identical schedule keys in sr and en', () => {
    const load = (l) => Object.keys(JSON.parse(readFileSync(join(__dirname, `../../../src/renderer/i18n/${l}.json`), 'utf8'))).filter((k) => k.startsWith('schedule.') || k === 'nav.schedule').sort()
    expect(load('sr')).toEqual(load('en'))
    expect(load('sr').length).toBeGreaterThan(20)
  })
})

describe('SchedulePage accessibility and labels', () => {
  it('row label carries the format and, in All, the Watchlist state (before the aired suffix)', async () => {
    page(apiWith(data([item({ entryId: 'e1', format: 'ONA', airingAt: at(0, 8) }), item({ mediaId: 2, title: 'Beta', format: null })])))
    fireEvent.click(await screen.findByRole('button', { name: /^Sve/ }))
    expect((await screen.findByRole('button', { name: /^Alpha/ })).getAttribute('aria-label')).toBe('Alpha, EP 5, Danas u 08:00, ONA, U Watchlist-i, izašlo')
    expect(screen.getByRole('button', { name: /^Beta/ }).getAttribute('aria-label')).toBe('Beta, EP 5, Danas u 20:00')
  })

  it('does not announce the Watchlist state in My series (every row is in it)', async () => {
    page(apiWith(data([item({ entryId: 'e1' })])))
    expect((await screen.findByRole('button', { name: /^Alpha/ })).getAttribute('aria-label')).toBe('Alpha, EP 5, Danas u 20:00, TV')
  })

  it('marks the page busy only while loading', async () => {
    const { container } = page(apiWith({ state: 'loading', refreshing: true, fetchedAt: null, from: 0, days: [], items: [] }))
    await screen.findByTestId('schedule-skeleton')
    expect(container.querySelector('.schedule-page')).toHaveAttribute('aria-busy', 'true')
  })

  it('is not busy once loaded', async () => {
    const { container } = page(apiWith(data([item()])))
    await screen.findByRole('button', { name: /^Alpha/ })
    expect(container.querySelector('.schedule-page')).not.toHaveAttribute('aria-busy', 'true')
  })

  it('puts the error message in a polite live region', async () => {
    page(makeFakeApi({ schedule: { list: vi.fn(async () => ({ state: 'error', refreshing: false, fetchedAt: null, from: 0, days: [], items: [] })) } }))
    expect(within(await screen.findByRole('status')).getByText('Raspored trenutno nije dostupan.')).toBeInTheDocument()
  })

  it('puts the stale message in a polite live region', async () => {
    page(makeFakeApi({ schedule: { list: vi.fn(async () => data([item()], { state: 'stale', fetchedAt: at(0, 7, 5) })) } }))
    expect(within(await screen.findByRole('status')).getByText(/Prikazan raspored od/)).toBeInTheDocument()
  })

  it('short day labels: Serbian keeps the trailing period, English drops it', async () => {
    const { unmount } = page(apiWith(data([item()])))
    await screen.findByRole('group', { name: 'Dani' })
    expect(dayButtons()[2].textContent).toMatch(/^\S+ 23\. ?\d/)
    unmount()
    renderUi(<SchedulePage ready onOpenAnime={vi.fn()} onSearch={vi.fn()} />, { api: apiWith(data([item()])), lang: 'en' })
    const days = await screen.findByRole('group', { name: 'Days' })
    expect(within(days).getAllByRole('button')[2].textContent).toMatch(/^\S+ 23 ?\d+$/)
  })

  describe('default day', () => {
    const pressed = () => dayButtons().findIndex((b) => b.getAttribute('aria-pressed') === 'true')

    it('defaults to the first day with episodes', async () => {
      page(apiWith(data([item({ entryId: 'e1', airingAt: at(2, 16) })])))
      await screen.findByRole('group', { name: 'Dani' })
      expect(dayButtons()[2]).toHaveAttribute('aria-pressed', 'true')
      expect(pressed()).toBe(2)
      expect(screen.getByRole('button', { name: /^Alpha/ })).toBeInTheDocument()
    })

    it('derived day follows the mode until the user picks a day', async () => {
      page(apiWith(data([item({ entryId: 'e1', airingAt: at(2, 16) }), item({ mediaId: 2, title: 'Beta', airingAt: at(0, 20) })])))
      await screen.findByRole('group', { name: 'Dani' })
      expect(pressed()).toBe(2)
      fireEvent.click(screen.getByRole('button', { name: /^Sve/ }))
      expect(pressed()).toBe(0)
    })

    it('a picked day stays when switching modes', async () => {
      page(apiWith(data([item({ entryId: 'e1', airingAt: at(2, 16) }), item({ mediaId: 2, title: 'Beta', airingAt: at(0, 20) })])))
      await screen.findByRole('group', { name: 'Dani' })
      fireEvent.click(dayButtons()[3])
      fireEvent.click(screen.getByRole('button', { name: /^Sve/ }))
      fireEvent.click(screen.getByRole('button', { name: /Moje serije/ }))
      expect(pressed()).toBe(3)
    })

    it('no episodes in the window keeps Danas', async () => {
      page(apiWith(data([])))
      await screen.findByRole('group', { name: 'Dani' })
      expect(pressed()).toBe(0)
    })

    it('today with only aired episodes is not empty', async () => {
      page(apiWith(data([item({ airingAt: at(0, 8) }), item({ mediaId: 2, title: 'Beta', airingAt: at(3, 8) })])))
      await screen.findByRole('group', { name: 'Dani' })
      expect(pressed()).toBe(0)
      expect(screen.getByRole('button', { name: /^Alpha/ })).toBeInTheDocument()
    })
  })

  describe('retry button', () => {
    const retry = () => screen.getByRole('button', { name: /^Pokušaj ponovo|^Osvežava se/ })

    it('stale + refreshing: shows Refreshing, aria-disabled, click does nothing', async () => {
      const api = apiWith(data([item()], { state: 'stale', refreshing: true, fetchedAt: at(0, 7) }))
      page(api)
      const btn = await screen.findByRole('button', { name: 'Osvežava se…' })
      expect(btn).toHaveAttribute('aria-disabled', 'true')
      expect(btn).toHaveAttribute('aria-busy', 'true')
      expect(btn).not.toHaveAttribute('disabled')
      fireEvent.click(btn)
      expect(api.schedule.list).not.toHaveBeenCalledWith({ force: true })
    })

    describe('countdown', () => {
      beforeEach(() => {
        vi.useRealTimers()
        vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
        vi.setSystemTime(NOW)
      })
      const mount = async () => {
        const api = apiWith(data([item()], { state: 'stale', fetchedAt: at(0, 7), retryAt: NOW + 5000 }))
        const view = page(api)
        await act(async () => { await Promise.resolve() })
        return { api, ...view }
      }

      it('retryAt counts down, then the retry button is usable again', async () => {
        const { api } = await mount()
        const btn = screen.getByRole('button', { name: 'Pokušaj ponovo za 5 s' })
        expect(btn).toHaveAttribute('aria-disabled', 'true')
        expect(btn).not.toHaveAttribute('disabled')
        expect(screen.getByRole('status')).toHaveTextContent('Pokušaj ponovo za 5 s')
        fireEvent.click(btn)
        expect(api.schedule.list).not.toHaveBeenCalledWith({ force: true })

        await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
        expect(screen.getByRole('button', { name: 'Pokušaj ponovo za 3 s' })).toBe(btn)
        expect(screen.getByRole('status')).toHaveTextContent('Pokušaj ponovo za 5 s')
        expect(screen.getByRole('status')).not.toHaveTextContent('za 3 s')

        await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
        const again = screen.getByRole('button', { name: 'Pokušaj ponovo' })
        expect(again).toBe(btn)
        expect(again).not.toHaveAttribute('aria-disabled')
        expect(screen.getByRole('status')).not.toHaveTextContent('Pokušaj ponovo za')
        fireEvent.click(again)
        expect(api.schedule.list).toHaveBeenLastCalledWith({ force: true })
      })

      // A new retryAt arrives long after the previous countdown stopped: the first paint must use the real clock, not the stale retryNow.
      const expireThenDeliver = async (retryAtFor) => {
        let onSched
        const list = vi.fn(async () => data([item()], { state: 'stale', fetchedAt: at(0, 7), retryAt: NOW + 5000 }))
        page(makeFakeApi({ schedule: { list, onChanged: vi.fn((cb) => { onSched = cb; return () => {} }) } }))
        await act(async () => { await Promise.resolve() })
        await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
        expect(screen.getByRole('button', { name: 'Pokušaj ponovo' })).not.toHaveAttribute('aria-disabled')
        vi.setSystemTime(NOW + 11 * 60 * 1000) // clock jumps; no interval tick runs
        const later = Date.now()
        list.mockImplementation(async () => data([item()], { state: 'stale', fetchedAt: at(0, 7), retryAt: retryAtFor(later) }))
        // every label the button ever showed (an intermediate stale frame would be committed to the DOM, then replaced)
        const seen = new Set()
        const watch = new MutationObserver((recs) => recs.forEach((r) => {
          if (r.oldValue) seen.add(r.oldValue)
          r.addedNodes.forEach((n) => seen.add(n.textContent))
        }))
        watch.observe(screen.getByRole('button', { name: 'Pokušaj ponovo' }), { subtree: true, childList: true, characterData: true, characterDataOldValue: true })
        await act(async () => { onSched() })
        await act(async () => { await Promise.resolve() })
        watch.takeRecords().forEach((r) => { if (r.oldValue) seen.add(r.oldValue); r.addedNodes.forEach((n) => seen.add(n.textContent)) })
        watch.disconnect()
        return seen
      }

      it('a new retryAt after a long gap counts from the real clock on the first paint', async () => {
        const seen = await expireThenDeliver((later) => later + 60000)
        expect([...seen].filter((x) => /\d+ s$/.test(x) && x !== 'Pokušaj ponovo za 60 s')).toEqual([])
        const btn = screen.getByRole('button', { name: 'Pokušaj ponovo za 60 s' })
        expect(btn).toHaveAttribute('aria-disabled', 'true')
      })

      it('a new retryAt already in the past shows no countdown', async () => {
        const seen = await expireThenDeliver((later) => later - 1000)
        expect([...seen].filter((x) => /\d+ s$/.test(x))).toEqual([])
        expect(screen.getByRole('button', { name: 'Pokušaj ponovo' })).not.toHaveAttribute('aria-disabled')
      })

      it('countdown interval is cleared on unmount', async () => {
        const { unmount } = await mount()
        expect(vi.getTimerCount()).toBeGreaterThan(0)
        unmount()
        expect(vi.getTimerCount()).toBe(0)
      })

      it('an already expired retryAt starts no countdown', async () => {
        page(apiWith(data([item()], { state: 'stale', fetchedAt: at(0, 7), retryAt: NOW - 1000 })))
        await act(async () => { await Promise.resolve() })
        expect(screen.getByRole('button', { name: 'Pokušaj ponovo' })).not.toHaveAttribute('aria-disabled')
      })
    })
  })
})
