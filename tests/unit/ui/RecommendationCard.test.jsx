// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderUi, makeFakeApi } from './helpers.jsx'
import { RecommendationCard } from '../../../src/renderer/components/RecommendationCard.jsx'

const item = (over = {}) => ({
  id: 7, title: 'Alpha', romaji: 'Alpha R', format: 'TV', status: 'RELEASING', year: 2026, episodes: 12, genres: ['Action', 'Drama'], poster: null, ...over,
})
const card = (props = {}) => renderUi(<RecommendationCard ready onSearch={vi.fn()} {...props} item={props.item ?? item()} />, { api: makeFakeApi() })
const monthYear = (year, month) => new Intl.DateTimeFormat('sr-Latn', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1))

describe('RecommendationCard (Discover additions)', () => {
  it('a library card says Open, not Search', () => {
    const { unmount } = card({ inWatchlist: true, onOpen: vi.fn() })
    expect(screen.getByRole('button', { name: 'Otvori Alpha, U Watchlist-i' })).toBeInTheDocument()
    unmount()
    card({ inWatchlist: true })
    expect(screen.getByRole('button', { name: 'Potraži Alpha, U Watchlist-i' })).toBeInTheDocument()
  })


  it('keeps the recommendation rendering for a releasing item with onHide', () => {
    const onSearch = vi.fn()
    const { container } = card({ item: item({ fromTitle: 'Beta' }), onSearch, onHide: vi.fn() })
    const open = screen.getByRole('button', { name: 'Potraži Alpha' })
    expect(open).toHaveTextContent('Emituje se')
    expect(open).toHaveTextContent('Alpha')
    expect(open).toHaveTextContent('Action · Drama')
    expect(open).toHaveTextContent('Zbog')
    expect(screen.getByRole('button', { name: /Ne preporučuj/ })).toBeInTheDocument()
    expect(container.querySelector('.badge')).not.toBeNull()
    fireEvent.click(open)
    expect(onSearch).toHaveBeenCalledWith('Alpha R')
  })

  it('poster undefined shows the skeleton, null the empty frame', () => {
    const { container, unmount } = card({ item: item({ poster: undefined }) })
    expect(container.querySelector('.poster--skeleton')).not.toBeNull()
    unmount()
    const second = card({ item: item({ poster: null }) })
    expect(second.container.querySelector('.poster--skeleton')).toBeNull()
    expect(second.container.querySelector('.poster--empty')).not.toBeNull()
  })

  it('inWatchlist adds the badge and the label suffix', () => {
    const { container } = card({ inWatchlist: true })
    expect(screen.getByRole('button', { name: 'Potraži Alpha, U Watchlist-i' })).toBeInTheDocument()
    expect(container.querySelector('.schedule-badge--accent')).toHaveTextContent('U Watchlist-i')
  })

  it('onOpen replaces onSearch', () => {
    const onSearch = vi.fn()
    const onOpen = vi.fn()
    card({ onSearch, onOpen })
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('a not yet released item without onOpen is a group, not a button', () => {
    const { container } = card({ item: item({ status: 'NOT_YET_RELEASED', start: { year: 2027, month: 1 } }) })
    expect(container.querySelector('button')).toBeNull()
    const group = screen.getByRole('group', { name: new RegExp(`počinje ${monthYear(2027, 1)}`) })
    expect(group).toHaveTextContent(`Počinje: ${monthYear(2027, 1)}`)
  })

  it('shows only the year without a month, and "uskoro" without a start', () => {
    const { unmount } = card({ item: item({ status: 'NOT_YET_RELEASED', start: { year: 2027, month: null } }) })
    expect(screen.getByRole('group', { name: 'Alpha, počinje 2027' })).toHaveTextContent('Počinje: 2027')
    unmount()
    card({ item: item({ status: 'NOT_YET_RELEASED', start: null }) })
    expect(screen.getByRole('group', { name: 'Alpha, počinje uskoro' })).toHaveTextContent('Počinje: uskoro')
  })

  it('a not yet released item with onOpen stays a button', () => {
    const onOpen = vi.fn()
    card({ item: item({ status: 'NOT_YET_RELEASED', start: null }), onOpen, inWatchlist: true })
    fireEvent.click(screen.getByRole('button', { name: /Alpha/ }))
    expect(onOpen).toHaveBeenCalled()
  })
})
