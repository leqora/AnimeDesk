// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { useMemo, useState } from 'react'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { RouteStateContext } from '../../../src/renderer/nav/useNavigation.js'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { EpisodePicker } from '../../../src/renderer/components/EpisodePicker.jsx'

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i))
const base = (over = {}) => ({ episodes: range(1, 12), selected: [], watched: [], onToggle: vi.fn(), ...over })

describe('EpisodePicker', () => {
  it('renders no sticky action bar when it would be empty', () => {
    const { container, unmount } = renderUi(<EpisodePicker {...base()} />)
    expect(container.querySelector('.episode-bar')).toBeNull()
    unmount()
    const empty = renderUi(<EpisodePicker {...base()}>{false}{null}</EpisodePicker>)
    expect(empty.container.querySelector('.episode-bar')).toBeNull()
    empty.unmount()
    const withChild = renderUi(<EpisodePicker {...base()}><button type="button">Akcija</button></EpisodePicker>)
    expect(withChild.container.querySelector('.episode-bar')).not.toBeNull()
    withChild.unmount()
    renderUi(<EpisodePicker {...base({ prefs: {}, onPrefs: vi.fn() })} />)
    expect(screen.getByLabelText('Kvalitet').closest('.episode-bar')).not.toBeNull()
  })
  it('puts quality and sub/dub into the toolbar row instead of the sticky bar when a toolbar is given', () => {
    const { container } = renderUi(<EpisodePicker {...base({ prefs: {}, onPrefs: vi.fn() })} toolbar={<span>X</span>} />)
    const bar = container.querySelector('.ep-toolbar')
    expect(bar).not.toBeNull()
    expect(bar).toContainElement(screen.getByLabelText('Kvalitet'))
    expect(bar).toContainElement(screen.getByLabelText('Režim'))
    expect(bar).toHaveTextContent('X')
    expect(container.querySelector('.episode-bar')).toBeNull()
  })
  it('quality and mode stay together in the toolbar', () => {
    const { container } = renderUi(<EpisodePicker {...base({ prefs: {}, onPrefs: vi.fn() })} toolbar={<span>X</span>} />)
    const prefs = container.querySelector('.ep-toolbar .ep-toolbar__prefs')
    expect(prefs).not.toBeNull()
    expect(prefs).toContainElement(screen.getByLabelText('Kvalitet'))
    expect(prefs).toContainElement(screen.getByLabelText('Režim'))
  })
  it('keeps quality and sub/dub in the sticky bar and renders no toolbar without the toolbar prop', () => {
    const { container } = renderUi(<EpisodePicker {...base({ prefs: {}, onPrefs: vi.fn() })} />)
    expect(container.querySelector('.ep-toolbar')).toBeNull()
    expect(screen.getByLabelText('Kvalitet').closest('.episode-bar')).not.toBeNull()
    expect(screen.getByLabelText('Režim').closest('.episode-bar')).not.toBeNull()
  })
  it('shows all episodes without groups or go-to for short series', () => {
    renderUi(<EpisodePicker {...base({ watched: [1], selected: ['3'] })}><button type="button">Akcija</button></EpisodePicker>)
    expect(screen.getAllByRole('button', { name: /^\d+$/ })).toHaveLength(12)
    expect(screen.queryByRole('group', { name: 'Grupe epizoda' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Idi na epizodu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1' })).toHaveClass('ep--watched')
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '5' }))
    expect(screen.getByRole('button', { name: 'Akcija' })).toBeInTheDocument()
  })
  it('opens the last group when every episode is watched', () => {
    const p = base({ episodes: range(1, 250), watched: range(1, 250).map(Number) })
    renderUi(<EpisodePicker {...p} />)
    expect(screen.getByRole('button', { name: '201–250' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('opens the group with the first unwatched episode in long series', () => {
    const p = base({ episodes: range(1, 1120), watched: range(1, 250).map(Number) })
    renderUi(<EpisodePicker {...p} />)
    expect(screen.getByRole('button', { name: '201–300' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('button', { name: /^\d+$/ })).toHaveLength(100)
    expect(screen.getByRole('button', { name: '251' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '1101–1120' }))
    expect(screen.getAllByRole('button', { name: /^\d+$/ })).toHaveLength(20)
  })
  it('jumps to an episode, selects it, and reports a missing one', () => {
    const p = base({ episodes: [...range(1, 150), '150.5'] })
    renderUi(<EpisodePicker {...p} />)
    fireEvent.change(screen.getByLabelText('Idi na epizodu'), { target: { value: '150.5' } })
    fireEvent.submit(screen.getByLabelText('Idi na epizodu'))
    expect(screen.getByRole('button', { name: '101–150.5' })).toHaveAttribute('aria-pressed', 'true')
    expect(p.onToggle).toHaveBeenCalledWith('150.5')
    fireEvent.change(screen.getByLabelText('Idi na epizodu'), { target: { value: '999' } })
    fireEvent.submit(screen.getByLabelText('Idi na epizodu'))
    expect(screen.getByText('Epizoda ne postoji')).toBeInTheDocument()
    expect(p.onToggle).toHaveBeenCalledTimes(1)
  })
  it('does not unselect an already selected episode when jumping to it', () => {
    const p = base({ episodes: range(1, 150), selected: ['120'] })
    renderUi(<EpisodePicker {...p} />)
    fireEvent.change(screen.getByLabelText('Idi na epizodu'), { target: { value: '120' } })
    fireEvent.submit(screen.getByLabelText('Idi na epizodu'))
    expect(p.onToggle).not.toHaveBeenCalled()
  })
  it('shows quality and mode selects only with prefs and reports changes', () => {
    const onPrefs = vi.fn()
    const { rerender } = renderUi(<EpisodePicker {...base()} />)
    expect(screen.queryByLabelText('Kvalitet')).not.toBeInTheDocument()
    rerender(<EpisodePicker {...base()} prefs={{ quality: null, mode: 'dub' }} onPrefs={onPrefs} />)
    expect(screen.getByLabelText('Kvalitet')).toHaveValue('')
    expect(screen.getByLabelText('Režim')).toHaveValue('dub')
    fireEvent.change(screen.getByLabelText('Kvalitet'), { target: { value: '720' } })
    expect(onPrefs).toHaveBeenCalledWith({ quality: '720' })
    fireEvent.change(screen.getByLabelText('Režim'), { target: { value: '' } })
    expect(onPrefs).toHaveBeenLastCalledWith({ mode: null })
  })
  it('marks a partly watched episode on its pill', () => {
    const { container } = renderUi(<EpisodePicker {...base({ progress: { 4: { ratio: 0.34, remaining: 16 } } })} />)
    const pill = screen.getByRole('button', { name: '4' })
    expect(pill).toHaveAttribute('title', 'ostalo 16 min')
    expect(pill.querySelector('.ep__progress').style.getPropertyValue('--ratio')).toBe('0.34')
    expect(container.querySelectorAll('.ep__progress')).toHaveLength(1)
  })
  it('scrolls once per jump, including repeated jumps to the same episode', () => {
    const orig = Element.prototype.scrollIntoView
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      renderUi(<EpisodePicker {...base({ episodes: range(1, 150) })} />)
      const input = screen.getByLabelText('Idi na epizodu')
      fireEvent.change(input, { target: { value: '120' } })
      fireEvent.submit(input)
      expect(scroll).toHaveBeenCalledTimes(1)
      fireEvent.submit(input)
      expect(scroll).toHaveBeenCalledTimes(2)
      fireEvent.click(screen.getByRole('button', { name: '1–100' }))
      fireEvent.click(screen.getByRole('button', { name: '101–150' }))
      expect(scroll).toHaveBeenCalledTimes(2)
    } finally {
      Element.prototype.scrollIntoView = orig
    }
  })
})

const SERIES = {
  source: 'menu',
  meta: 'ok',
  episodes: [
    { number: '1', runtime: 24, visibility: 'full', title: 'Naslov 1', hasThumb: true, overview: 'Opis 1' },
    { number: '2', runtime: 24, visibility: 'preview', title: 'Naslov 2', hasThumb: true },
    { number: '3', runtime: 24, visibility: 'hidden' },
  ],
}
const listApi = () => makeFakeApi({ settings: { get: vi.fn(async () => ({ episodeView: 'list' })), update: vi.fn(async (p) => p) } })

describe('EpisodePicker list view', () => {
  it('offers the view switch only when metadata is available', () => {
    renderUi(<EpisodePicker {...base({ episodes: ['1', '2', '3'] })} series={{ ...SERIES, meta: 'none' }} />)
    expect(screen.queryByRole('group', { name: 'Prikaz epizoda' })).not.toBeInTheDocument()
  })
  it('switches to the list and remembers it', async () => {
    const { api } = renderUi(<EpisodePicker {...base({ episodes: ['1', '2', '3'] })} series={SERIES} />)
    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
    expect(api.settings.update).toHaveBeenCalledWith({ episodeView: 'list' })
    expect(screen.getByText('Epizoda 1 · Naslov 1')).toBeInTheDocument()
  })
  it('renders full, preview and hidden rows without leaking the hidden one', async () => {
    const onReveal = vi.fn()
    const onToggle = vi.fn()
    const loadThumb = vi.fn(async (n) => `data:image/png;base64,${n}`)
    const { container } = renderUi(
      <EpisodePicker {...base({ episodes: ['1', '2', '3'], watched: [1], onToggle })} series={SERIES} poster="data:poster" onReveal={onReveal} loadThumb={loadThumb} />,
      { api: listApi() },
    )
    await waitFor(() => expect(screen.getByText('Epizoda 2 · Naslov 2')).toBeInTheDocument())
    expect(screen.getAllByRole('button', { name: 'Opis' })).toHaveLength(1) // only the full row
    fireEvent.click(screen.getByRole('button', { name: 'Opis' }))
    expect(screen.getByText('Opis 1')).toBeInTheDocument()
    const hidden = screen.getByText('Epizoda 3').closest('.ep-row')
    expect(hidden.querySelector('img').getAttribute('src')).toBe('data:poster')
    await waitFor(() => expect(loadThumb).toHaveBeenCalledTimes(2))
    expect(loadThumb).not.toHaveBeenCalledWith('3')
    fireEvent.click(screen.getByRole('button', { name: 'Prikaži' }))
    expect(onReveal).toHaveBeenCalledWith('3')
    fireEvent.click(screen.getByText('Epizoda 2 · Naslov 2'))
    expect(onToggle).toHaveBeenCalledWith('2')
    expect(container.innerHTML).not.toMatch(/Naslov 3|Opis 2/)
  })
  it('never renders hidden or non-full fields even if the row carries them', async () => {
    const loadThumb = vi.fn(async () => 'data:x')
    const leaky = { ...SERIES, episodes: [
      { number: '1', runtime: 24, visibility: 'hidden', title: 'Tajna 5', overview: 'Skriveno', hasThumb: true },
      { number: '2', runtime: 24, visibility: 'preview', title: 'Naslov 2', overview: 'Skriveno 2', hasThumb: false },
    ] }
    const { container } = renderUi(<EpisodePicker {...base({ episodes: ['1', '2'] })} series={leaky} poster="data:poster" onReveal={vi.fn()} loadThumb={loadThumb} />, { api: listApi() })
    await waitFor(() => expect(screen.getByText('Epizoda 2 · Naslov 2')).toBeInTheDocument())
    expect(screen.getByText('Epizoda 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prikaži' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Opis' })).not.toBeInTheDocument()
    expect(loadThumb).not.toHaveBeenCalled()
    expect(container.innerHTML).not.toMatch(/Tajna 5|Skriveno/)
  })
  it('scrolls to the go-to row in list view', async () => {
    const orig = Element.prototype.scrollIntoView
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      const eps = range(1, 150)
      const series = { source: 'menu', meta: 'ok', episodes: eps.map((n) => ({ number: n, runtime: 24, visibility: 'preview', title: `Naslov ${n}` })) }
      renderUi(<EpisodePicker {...base({ episodes: eps })} series={series} />, { api: listApi() })
      await waitFor(() => expect(screen.getByText('Epizoda 1 · Naslov 1')).toBeInTheDocument())
      const input = screen.getByLabelText('Idi na epizodu')
      fireEvent.change(input, { target: { value: '120' } })
      fireEvent.submit(input)
      expect(scroll).toHaveBeenCalledTimes(1)
      expect(scroll.mock.contexts[0]).toBe(screen.getByText('Epizoda 120 · Naslov 120').closest('.ep-row'))
    } finally {
      Element.prototype.scrollIntoView = orig
    }
  })
  it('shows progress on a hidden row without revealing its title', async () => {
    const { container } = renderUi(<EpisodePicker {...base({ episodes: ['1', '2', '3'], progress: { 3: { ratio: 0.5, remaining: 12 } } })} series={SERIES} poster="data:poster" />, { api: listApi() })
    await waitFor(() => expect(screen.getByText('Epizoda 2 · Naslov 2')).toBeInTheDocument())
    const row = screen.getByText('Epizoda 3').closest('.ep-row')
    expect(row.querySelector('.ep-row__progress').style.getPropertyValue('--ratio')).toBe('0.5')
    expect(row).toHaveTextContent('ostalo 12 min')
    expect(row).not.toHaveTextContent(/Naslov/)
    expect(container.querySelectorAll('.ep-row__progress')).toHaveLength(1)
  })
  it('keeps pills free of titles', () => {
    renderUi(<EpisodePicker {...base({ episodes: ['1', '2', '3'] })} series={SERIES} />)
    for (const b of screen.getAllByRole('button', { name: /^\d$/ })) expect(b).not.toHaveAttribute('title')
    expect(screen.queryByText(/Naslov/)).not.toBeInTheDocument()
  })
})

describe('EpisodePicker marks', () => {
  const marked = (over = {}) => ({
    meta: 'none', marks: 'ok', markCounts: { filler: 2, recap: 1 },
    episodes: [
      { number: '3', runtime: null, visibility: 'hidden', kind: 'filler' },
      { number: '4', runtime: null, visibility: 'hidden', kind: 'recap' },
      { number: '5', runtime: null, visibility: 'hidden' },
      { number: '6', runtime: null, visibility: 'hidden', kind: 'filler' },
    ],
    ...over,
  })
  const eps = ['1', '2', '3', '4', '5', '6']

  it('grid button shows F or R with an accessible name and keeps plain ones plain', () => {
    renderUi(<EpisodePicker {...base({ episodes: eps })} series={marked()} />)
    const f = screen.getByRole('button', { name: '3, filler' })
    expect(f).toHaveTextContent('F')
    expect(screen.getByRole('button', { name: '4, recap' })).toHaveTextContent('R')
    expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument()
    expect(f.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })
  it('title keeps the remaining time and adds the mark', () => {
    renderUi(<EpisodePicker {...base({ episodes: eps, progress: { 3: { ratio: 0.5, remaining: 12 } } })} series={marked()} />)
    const title = screen.getByRole('button', { name: '3, filler' }).getAttribute('title')
    expect(title).toContain('ostalo 12 min')
    expect(title).toContain('Filler')
  })
  it('legend shows counts and source', () => {
    renderUi(<EpisodePicker {...base({ episodes: eps })} series={marked()} />)
    expect(screen.getByText('F = filler · R = recap')).toBeInTheDocument()
    expect(screen.getByText('Filler: 2')).toBeInTheDocument()
    expect(screen.getByText('Recap: 1')).toBeInTheDocument()
    expect(screen.getByText('(MyAnimeList)')).toBeInTheDocument()
  })
  it.each(['unreliable', 'none', 'off'])('renders no marks and no legend when marks is %s', (marks) => {
    renderUi(<EpisodePicker {...base({ episodes: eps })} series={marked({ marks })} onHideMarked={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '3, filler' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument()
    expect(screen.queryByText('F = filler · R = recap')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sakrij filler i recap' })).not.toBeInTheDocument()
  })
  it('renders no legend when counts are zero', () => {
    renderUi(<EpisodePicker {...base({ episodes: eps })} series={marked({ markCounts: { filler: 0, recap: 0 }, episodes: [] })} />)
    expect(screen.queryByText('F = filler · R = recap')).not.toBeInTheDocument()
  })
  it('hide toggle reports the new state', () => {
    const onHideMarked = vi.fn()
    renderUi(<EpisodePicker {...base({ episodes: eps })} series={marked()} onHideMarked={onHideMarked} />)
    const toggle = screen.getByRole('button', { name: 'Sakrij filler i recap' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(onHideMarked).toHaveBeenCalledWith(true)
  })
  it('has no toggle without onHideMarked', () => {
    renderUi(<EpisodePicker {...base({ episodes: eps })} series={marked()} />)
    expect(screen.queryByRole('button', { name: 'Sakrij filler i recap' })).not.toBeInTheDocument()
  })
  it('hiding removes marked buttons and shows the hidden count of the group', () => {
    renderUi(<EpisodePicker {...base({ episodes: eps })} series={marked()} hideMarked onHideMarked={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Sakrij filler i recap' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /^3/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^4/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument()
    expect(screen.getByText('Sakriveno: 3')).toBeInTheDocument()
  })
  it('hiding keeps the groups computed over the full list', () => {
    renderUi(<EpisodePicker {...base({ episodes: range(1, 150) })} series={marked()} hideMarked onHideMarked={vi.fn()} />)
    expect(screen.getByRole('button', { name: '1–100' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '101–150' })).toBeInTheDocument()
  })
  it('going to a hidden episode turns hiding off and selects it', () => {
    const onHideMarked = vi.fn()
    const p = base({ episodes: range(1, 150) })
    renderUi(<EpisodePicker {...p} series={marked()} hideMarked onHideMarked={onHideMarked} />)
    fireEvent.change(screen.getByLabelText('Idi na epizodu'), { target: { value: '3' } })
    fireEvent.submit(screen.getByLabelText('Idi na epizodu'))
    expect(onHideMarked).toHaveBeenCalledWith(false)
    expect(p.onToggle).toHaveBeenCalledWith('3')
  })
  it('list view shows the chip, also on a hidden row', async () => {
    const series = marked({ meta: 'ok' })
    renderUi(<EpisodePicker {...base({ episodes: eps })} series={series} />, { api: listApi() })
    await waitFor(() => expect(screen.getAllByText('Filler').length).toBeGreaterThan(0))
    expect(screen.getByText('Epizoda 3').closest('.ep-row')).toHaveTextContent('Filler')
    expect(screen.getByText('Epizoda 4').closest('.ep-row')).toHaveTextContent('Recap')
    expect(screen.getByText('Epizoda 5').closest('.ep-row')).not.toHaveTextContent(/Filler|Recap/)
  })
})

describe('EpisodePicker cards', () => {
  it('shows 16:9 cards in the list view when onPlay is given, rows otherwise', async () => {
    const a = renderUi(<EpisodePicker {...base({ episodes: ['1', '2', '3'] })} series={SERIES} onPlay={vi.fn()} nextEp="2" />, { api: listApi() })
    await waitFor(() => expect(a.container.querySelector('.ep-cards')).not.toBeNull())
    expect(a.container.querySelector('.ep-list')).toBeNull()
    expect(a.container.querySelectorAll('.ep-card')).toHaveLength(3)
    expect(a.container.querySelector('.ep-card--next')).toHaveTextContent('EP 2')
    a.unmount()
    const b = renderUi(<EpisodePicker {...base({ episodes: ['1', '2', '3'] })} series={SERIES} />, { api: listApi() })
    await waitFor(() => expect(b.container.querySelector('.ep-list')).not.toBeNull())
    expect(b.container.querySelector('.ep-cards')).toBeNull()
  })
})

describe('EpisodePicker group memory and jumping (v0.19.1)', () => {
  function Keeper({ keyName, children }) {
    const [state, setState] = useState({})
    const value = useMemo(() => ({ state, set: (k, v) => setState((s) => ({ ...s, [k]: v })) }), [state])
    return <RouteStateContext.Provider value={value}>{children(keyName)}</RouteStateContext.Provider>
  }
  it('remembers the chosen group per series in route state', () => {
    const eps = range(1, 220)
    const p = base({ episodes: eps })
    const { rerender } = renderUi(<Keeper keyName="a">{(k) => <EpisodePicker key={k} {...p} groupKey={k} />}</Keeper>)
    fireEvent.click(screen.getByRole('button', { name: '201–220' }))
    expect(screen.getByRole('button', { name: '201–220' })).toHaveAttribute('aria-pressed', 'true')
    // the picker remounts (key change) while the route state survives
    rerender(<Keeper keyName="a">{(k) => <EpisodePicker key="again" {...p} groupKey={k} />}</Keeper>)
    expect(screen.getByRole('button', { name: '201–220' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('keeps groups of different series apart', () => {
    const eps = range(1, 220)
    const p = base({ episodes: eps })
    let setKey
    function Host() {
      const [state, setState] = useState({})
      const [k, setK] = useState('a')
      setKey = setK
      const value = useMemo(() => ({ state, set: (key, v) => setState((s) => ({ ...s, [key]: v })) }), [state])
      return <RouteStateContext.Provider value={value}><EpisodePicker {...p} groupKey={k} /></RouteStateContext.Provider>
    }
    renderUi(<Host />)
    fireEvent.click(screen.getByRole('button', { name: '201–220' }))
    act(() => setKey('b'))
    expect(screen.getByRole('button', { name: '1–100' })).toHaveAttribute('aria-pressed', 'true')
    act(() => setKey('a'))
    expect(screen.getByRole('button', { name: '201–220' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('go to episode in card view scrolls to and focuses the card', async () => {
    const eps = range(1, 220)
    const series = { source: 'menu', meta: 'ok', episodes: eps.map((n) => ({ number: n, runtime: 24, visibility: n === '150' ? 'full' : 'preview', title: `N${n}` })) }
    const onToggle = vi.fn()
    renderUi(<EpisodePicker {...base({ episodes: eps, onToggle })} series={series} onPlay={vi.fn()} />, { api: listApi() })
    await screen.findAllByRole('button', { name: /Pusti: / })
    fireEvent.change(screen.getByLabelText('Idi na epizodu'), { target: { value: '150' } })
    fireEvent.submit(screen.getByLabelText('Idi na epizodu'))
    expect(screen.getByRole('button', { name: '101–200' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-label', expect.stringMatching(/^Pusti: .*150/)))
    expect(onToggle).not.toHaveBeenCalled()
  })
  it('go to episode on a locked card focuses its reveal button', async () => {
    const eps = range(1, 150)
    const series = { source: 'menu', meta: 'ok', episodes: eps.map((n) => ({ number: n, runtime: 24, visibility: 'hidden' })) }
    renderUi(<EpisodePicker {...base({ episodes: eps })} series={series} onPlay={vi.fn()} onReveal={vi.fn()} />, { api: listApi() })
    await waitFor(() => expect(document.querySelector('.ep-cards')).not.toBeNull())
    fireEvent.change(screen.getByLabelText('Idi na epizodu'), { target: { value: '120' } })
    fireEvent.submit(screen.getByLabelText('Idi na epizodu'))
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-label', expect.stringMatching(/^Prikaži: .*120/)))
  })
  it('go to episode in numbers view still selects the number', () => {
    const p = base({ episodes: range(1, 150) })
    renderUi(<EpisodePicker {...p} series={SERIES} onPlay={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Idi na epizodu'), { target: { value: '150' } })
    fireEvent.submit(screen.getByLabelText('Idi na epizodu'))
    expect(p.onToggle).toHaveBeenCalledWith('150')
  })
  it('disables quality and mode (no Default shown as chosen) while prefs load', () => {
    renderUi(<EpisodePicker {...base()} prefs={{}} prefsLoading onPrefs={vi.fn()} toolbar={<span>X</span>} />)
    expect(screen.getByLabelText('Kvalitet')).toBeDisabled()
    expect(screen.getByLabelText('Režim')).toBeDisabled()
  })
})
