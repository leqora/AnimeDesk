// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { EpisodePicker } from '../../../src/renderer/components/EpisodePicker.jsx'

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i))
const base = (over = {}) => ({ episodes: range(1, 12), selected: [], watched: [], onToggle: vi.fn(), ...over })

describe('EpisodePicker', () => {
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
  it('keeps pills free of titles', () => {
    renderUi(<EpisodePicker {...base({ episodes: ['1', '2', '3'] })} series={SERIES} />)
    for (const b of screen.getAllByRole('button', { name: /^\d$/ })) expect(b).not.toHaveAttribute('title')
    expect(screen.queryByText(/Naslov/)).not.toBeInTheDocument()
  })
})
