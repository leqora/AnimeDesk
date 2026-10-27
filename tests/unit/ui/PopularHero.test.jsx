// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { PopularHero } from '../../../src/renderer/components/PopularHero.jsx'

const slide = (id, over = {}) => ({ id, kind: 'discover', title: `Title ${id}`, romaji: `Romaji ${id}`, year: 2026, format: 'ONA', genres: ['Action', 'Sci-Fi', 'Drama', 'Comedy'], poster: 'data:image/png;base64,AAAA', labelKey: 'hero.popularSeason', rank: id, ...over })

describe('PopularHero', () => {
  it('labels and buttons', () => {
    const onSearch = vi.fn()
    const { container } = renderUi(<PopularHero slides={[slide(1)]} ready onSearch={onSearch} />)
    expect(screen.getByText('Popularno ove sezone · #1')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Title 1' })).toBeInTheDocument()
    expect(screen.getByText('2026 · ONA · Action · Sci-Fi · Drama')).toBeInTheDocument()
    expect(container.querySelector('.home-hero p')).toBeNull() // no description anywhere
    fireEvent.click(screen.getByRole('button', { name: /Potraži i gledaj/ }))
    expect(onSearch).toHaveBeenCalledWith('Romaji 1')
  })
  it('falls back to the title when there is no romaji and asks for the right banner', async () => {
    const onSearch = vi.fn()
    const api = makeFakeApi()
    renderUi(<PopularHero slides={[slide(4, { romaji: null, kind: 'rec', labelKey: 'hero.personal' })]} ready onSearch={onSearch} />, { api })
    expect(screen.getByText('Preporučeno za tebe · #4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Potraži i gledaj/ }))
    expect(onSearch).toHaveBeenCalledWith('Title 4')
    await waitFor(() => expect(api.anilist.banner).toHaveBeenCalledWith({ kind: 'rec', id: 4 }))
  })
  it('+ Watchlist keeps the card and focus', async () => {
    const api = makeFakeApi()
    const slides = [slide(1), slide(2)]
    const { rerender } = renderUi(<PopularHero slides={slides} ready onSearch={() => {}} />, { api })
    const add = screen.getByRole('button', { name: /Watchlist/ })
    act(() => add.focus())
    fireEvent.click(add)
    await waitFor(() => expect(screen.getByRole('button', { name: /U Watchlist-i/ })).toBeInTheDocument())
    expect(api.library.add).toHaveBeenCalledWith({ title: 'Title 1', aniListId: 1, status: 'planned' })
    const done = screen.getByRole('button', { name: /U Watchlist-i/ })
    expect(done).toBe(add)
    expect(done).toHaveAttribute('aria-disabled', 'true')
    expect(done).not.toBeDisabled()
    expect(document.activeElement).toBe(done)
    fireEvent.click(done)
    expect(api.library.add).toHaveBeenCalledTimes(1)
    rerender(<PopularHero slides={slides} ready onSearch={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Title 1' })).toBeInTheDocument()
  })
  it('keeps the button usable after a failed add', async () => {
    const api = makeFakeApi({ library: { add: vi.fn(async () => { throw new Error('x') }) } })
    renderUi(<PopularHero slides={[slide(1)]} ready onSearch={() => {}} />, { api })
    fireEvent.click(screen.getByRole('button', { name: /Watchlist/ }))
    await waitFor(() => expect(api.library.add).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /U Watchlist-i/ })).not.toBeInTheDocument()
  })
  it('nothing anywhere → welcome', () => {
    const onSearch = vi.fn()
    renderUi(<PopularHero slides={[]} ready onSearch={onSearch} />)
    expect(screen.getByRole('heading', { name: 'Šta gledamo danas?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Pretraži/ }))
    expect(onSearch).toHaveBeenCalled()
  })
})
