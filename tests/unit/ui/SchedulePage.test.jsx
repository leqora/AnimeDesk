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
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Early, EP 1–2, Danas u 12:30', 'Late, EP 3, Danas u 22:00'])
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
