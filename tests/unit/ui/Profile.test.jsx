// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderUi } from './helpers.jsx'
import { XpBar } from '../../../src/renderer/components/XpBar.jsx'
import { ProfileCard, initials } from '../../../src/renderer/components/ProfileCard.jsx'
import { ProfilePage } from '../../../src/renderer/pages/ProfilePage.jsx'
import { EMPTY_STATS } from '../../../src/shared/stats.js'

const stats = {
  ...EMPTY_STATS, xp: 3100, level: 11, title: 'veteran', xpIntoLevel: 1240, xpForNext: 1500,
  episodes: 1240, hours: 42, completed: 7, avgRating: 8.5, streakDays: 5,
  topGenres: [{ genre: 'Action', episodes: 40 }, { genre: 'Drama', episodes: 20 }],
  activity: EMPTY_STATS.activity.map((d, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, count: i === 27 ? 4 : 0 })),
}

describe('XpBar', () => {
  it('fills proportionally and clamps', () => {
    const { container, rerender } = renderUi(<XpBar into={50} total={100} />)
    expect(container.querySelector('.xp-bar__fill').style.transform).toBe('scaleX(0.5)')
    rerender(<XpBar into={500} total={100} />)
    expect(container.querySelector('.xp-bar__fill').style.transform).toBe('scaleX(1)')
    rerender(<XpBar into={5} total={0} />)
    expect(container.querySelector('.xp-bar__fill').style.transform).toBe('scaleX(0)')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5')
  })
})

describe('ProfileCard', () => {
  it('makes initials', () => {
    expect(initials('Nikola Lelekovic')).toBe('NL')
    expect(initials('nikola')).toBe('N')
    expect(initials('  ')).toBe('?')
  })
  it('shows level and title and opens the profile', () => {
    const onClick = vi.fn()
    renderUi(<ProfileCard name="Nikola Lelekovic" stats={stats} onClick={onClick} />)
    const card = screen.getByRole('button')
    expect(card).toHaveTextContent('NL')
    expect(card).toHaveTextContent('LV 11')
    expect(card).toHaveTextContent('Veteran')
    fireEvent.click(card)
    expect(onClick).toHaveBeenCalled()
  })
})

describe('ProfilePage', () => {
  it('shows stats formatted for Serbian', () => {
    renderUi(<ProfilePage stats={stats} name="Nikola" lang="sr" />)
    expect(screen.getByRole('heading', { name: 'Nikola' })).toBeInTheDocument()
    expect(screen.getByText('1.240 / 1.500 XP')).toBeInTheDocument()
    expect(screen.getByText('1.240')).toBeInTheDocument()
    expect(screen.getByText('~42')).toBeInTheDocument()
    expect(screen.getByText('8,5')).toBeInTheDocument()
    expect(screen.getByText('Niz dana: 5')).toBeInTheDocument()
    expect(screen.getByText('Action')).toBeInTheDocument()
    const cells = screen.getAllByTestId('activity-cell')
    expect(cells).toHaveLength(28)
    expect(cells[27]).toHaveClass('activity-cell--l3')
    expect(cells[0]).toHaveClass('activity-cell--l0')
    expect(screen.queryByText('Odgledaj prvu epizodu da počneš.')).not.toBeInTheDocument()
  })
  it('shows the empty state for a new install', () => {
    renderUi(<ProfilePage stats={EMPTY_STATS} name="Nikola" lang="en" />, { lang: 'en' })
    expect(screen.getByText('Watch your first episode to get started.')).toBeInTheDocument()
    expect(screen.getByText('LV 1 · Rookie')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
